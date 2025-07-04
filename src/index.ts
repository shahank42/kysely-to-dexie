import Dexie, { type EntityTable } from "dexie";
import type { Generated, Selectable } from "kysely";

/**
 * Infers potential primary key(s) from a Kysely table definition.
 * It identifies keys marked with Kysely's `Generated<T>` type. If a table
 * has multiple `Generated` keys, this type resolves to a union of those key names.
 *
 * @template T The Kysely table interface type.
 * @example
 * type UserTable = {
 *  userId: Generated<string>;
 *  anotherId: Generated<number>;
 * }
 *
 * type PrimaryKeys = FindPrimaryKey<UserTable>;
 * //   ^? type PrimaryKeys = "userId" | "anotherId"
 */
export type FindPrimaryKey<T> = {
  [K in keyof T]: T[K] extends Generated<any> ? K : never;
}[keyof T] &
  keyof Selectable<T>;

/**
 * (Deprecated) Creates a Dexie type mapping from a Kysely schema, but may result in ambiguous primary keys.
 *
 * This type uses `FindPrimaryKey` directly for the primary key definition. If a Kysely
 * table has multiple `Generated` keys, the resulting `EntityTable` will have a union
 * type for its primary key, which is not a valid Dexie schema.
 *
 * It is recommended to use the more specific `DexieFromKysely` type instead to resolve these ambiguities.
 *
 * @template KDatabase The Kysely database schema.
 * @example
 * // For a User table with two Generated keys ("id" | "otherId"), the result is ambiguous:
 * type DexieDB = _DexieFromKysely<KyselyDatabase>
 * // type DexieDB = Dexie & {
 * //   users: EntityTable<..., "id" | "otherId">; // This is invalid for Dexie
 * // }
 */
export type _DexieFromKysely<KDatabase extends Record<string, any>> = Dexie & {
  [KTableName in keyof KDatabase]: EntityTable<
    Selectable<KDatabase[KTableName]>,
    FindPrimaryKey<KDatabase[KTableName]>
  >;
};

/**
 * Defines the shape for a configuration object that maps Kysely table names to their chosen primary key.
 *
 * This type acts as a constraint, ensuring that the provided primary key for each table
 * is one of the keys identified by `FindPrimaryKey`. It is designed to be used with the
 * `satisfies` operator to validate a configuration object while preserving its specific literal types.
 *
 * @template KDatabase The Kysely database schema.
 */
export type PrimaryKeyConfig<KDatabase> = {
  [KTableName in keyof KDatabase]: FindPrimaryKey<KDatabase[KTableName]>;
};

/**
 * Creates a strongly-typed, unambiguous Dexie instance type from a Kysely schema and a primary key configuration object.
 *
 * It resolves the ambiguity of multiple potential primary keys by requiring a
 * configuration object that explicitly specifies which key to use for each table.
 *
 * @template KDatabase The Kysely database schema.
 * @template PKConfig The type of the primary key configuration object, typically inferred via `typeof yourConfig`.
 *
 * @example
 * // 1. Define your Kysely schema
 * type KyselySchema = {
 *   users: {
 *     userId: Generated<string>;
 *     anotherId: Generated<number>;
 *     name: string;
 *   };
 *   groceries: {
 *     id: Generated<string>;
 *     name: string;
 *   };
 * }
 *
 * // 2. Create a config to resolve ambiguities
 * const primaryKeyConfig = {
 *   users: "anotherId", // We choose 'anotherId' over 'userId'
 *   groceries: "id",
 * } satisfies PrimaryKeyConfig<KyselySchema>;
 *
 * // 3. Generate the final, typesafe Dexie type
 * type MyDexieDb = DexieFromKysely<KyselySchema, typeof primaryKeyConfig>;
 *
 * // The resulting type has no ambiguity:
 * // type MyDexieDb = Dexie & {
 * //   users: EntityTable<{ userId: string; anotherId: number; name: string; }, "anotherId">;
 * //   groceries: EntityTable<{ id: string; name: string; }, "id">;
 * // }
 */
export type DexieFromKysely<
  KDatabase extends Record<string, any>,
  PKConfig extends PrimaryKeyConfig<KDatabase>
> = Dexie & {
  [KTableName in keyof KDatabase]: EntityTable<
    Selectable<KDatabase[KTableName]>,
    PKConfig[KTableName]
  >;
};

/**
 * Creates a factory for building a Kysely-inferred Dexie database instance.
 *
 * This function initiates a builder pattern to ensure full type safety. The process
 * is designed to correctly infer both your Kysely schema and your specific
 * primary key choices, even when a table has multiple potential primary keys.
 *
 * The usage involves a chain of calls:
 * 1. **Specify Schema**: Call this function with your Kysely schema as a generic argument. This "locks in" the schema type.
 * 2. **Provide Config**: Call the returned function with your primary key configuration object.
 * 3. **Build Instance**: Call the `.build()` method on the returned object with your database name and version.
 *
 * @template KDatabase The Kysely database schema interface. This is the central type that defines your tables.
 * @returns A specialized function that is ready to accept a primary key configuration for the provided `KDatabase` schema.
 *
 * @example
 * // 1. Define your Kysely schema
 * type KyselyDatabase = {
 *   users: {
 *     userId: Generated<string>;
 *     anotherId: Generated<number>;
 *     name: string;
 *   };
 *   products: {
 *     id: Generated<string>;
 *     name: string;
 *   }
 * }
 *
 * // 2. Define your primary key configuration
 * const primaryKeyConfig = {
 *   users: "anotherId",
 *   products: "id",
 * } satisfies PrimaryKeyConfig<KyselyDatabase>;
 *
 * // 3. Create the Dexie instance using the factory
 * const dxdb = kyselyToDexieFactory<KyselyDatabase>()(primaryKeyConfig).build("app-db", 1);
 *
 * // `dxdb` is now a fully typed Dexie instance, ready to use
 *
 * await dxdb.users.add({ userId: "u1", anotherId: 123, name: "Alice" }); // Type error: Property 'anotherId' is missing
 * await dxdb.users.add({ userId: "u2", name: "Bob" }); // No type error
 */
export function kyselyToDexieFactory<KDatabase extends Record<string, any>>() {
  /**
   * Accepts a primary key configuration and returns a final builder.
   * This function is returned by `kyselyToDexieFactory`.
   * @param config The primary key configuration object. It must be defined with
   * `satisfies PrimaryKeyConfig<KyselyDatabase>` to ensure correct type inference.
   */
  return function createBuilder<PKConfig extends PrimaryKeyConfig<KDatabase>>(
    config: PKConfig
  ) {
    return {
      /**
       * Builds and initializes the Dexie database instance.
       * @param dbName The name of the IndexedDB database.
       * @param version The schema version number for the Dexie database.
       * @returns A fully typed Dexie instance based on the Kysely schema and configuration.
       */
      build(
        dbName: string,
        version: number
      ): DexieFromKysely<KDatabase, PKConfig> {
        const db = new Dexie(dbName);

        // Transform the config to prepend '&' to each primary key.
        // In Dexie, `&id` means the key 'id' is user-provided and unique, but not auto-incrementing.
        const storesConfig = Object.fromEntries(
          Object.entries(config).map(([tableName, pk]) => [
            tableName,
            `${pk as string}`,
          ])
        );

        // Internally, we cast the specific config to the general type Dexie expects.
        // This is safe because `PKConfig` is constrained by `PrimaryKeyConfig<KDatabase>`.
        db.version(version).stores(storesConfig);

        return db as DexieFromKysely<KDatabase, PKConfig>;
      },
    };
  };
}
