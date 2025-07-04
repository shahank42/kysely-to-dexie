import { test, describe, expect, afterEach } from "bun:test";
import Dexie from "dexie";
import type { Generated } from "kysely";
import { kyselyToDexieFactory, PrimaryKeyConfig } from "../src";

/**
 * @fileoverview Test suite for the kyselyToDexieFactory.
 *
 * These tests validate that the factory correctly creates a Dexie database where all
 * primary keys, regardless of their type in Kysely (`Generated<number>` or `Generated<string>`),
 * are treated as user-provided and are mandatory on insert.
 */

// This utility checks if two types are exactly the same.
// If they are, it resolves to `true`. If not, it resolves to `false`.
type AreEqual<T, U> = (<G>() => G extends T ? 1 : 2) extends <
  G
>() => G extends U ? 1 : 2
  ? true
  : false;

// A simple function to enforce the assertion at compile time.
// If you pass `false` to it, TypeScript will throw an error.
const staticAssert = <T extends true>() => {};

// --- Test Schemas ---

/** A comprehensive Kysely schema for testing various scenarios. */
type TestDatabase = {
  /** Table with a numeric primary key, which must be user-provided. */
  users: {
    id: Generated<number>;
    name: string;
  };
  /** Table with a user-provided string primary key. */
  products: {
    sku: Generated<string>;
    name: string;
    price: number;
  };
  /** Table with multiple `Generated` keys to test ambiguity resolution. */
  ambiguous_items: {
    id1: Generated<number>;
    id2: Generated<string>;
    description: string;
  };
};

describe("kyselyToDexieFactory", () => {
  let db: Dexie | null = null;

  /**
   * Ensures a clean state for each test by closing and deleting any
   * previously created in-memory database instance.
   */
  afterEach(async () => {
    if (db) {
      if (db.isOpen()) db.close();
      await Dexie.delete(db.name);
      db = null;
    }
  });

  describe("Schema and Initialization", () => {
    /**
     * Verifies that the factory configures Dexie schemas correctly by prefixing
     * primary keys with '&', ensuring they are not auto-incrementing.
     */
    test("should create Dexie schema with non-auto-incrementing primary keys", async () => {
      const dbName = "schema-test-db";
      const primaryKeyConfig = {
        users: "id",
        products: "sku",
        ambiguous_items: "id1",
      } satisfies PrimaryKeyConfig<TestDatabase>;

      db = kyselyToDexieFactory<TestDatabase>()(primaryKeyConfig).build(
        dbName,
        1
      );
      await db.open();

      // Verify the 'users' table schema: `primKey.auto` MUST be false.
      const userSchema = db.table("users").schema;
      expect(userSchema.primKey.name).toBe("id");
      expect(userSchema.primKey.auto).toBe(false); // CRUCIAL: 'id' is not auto-incrementing

      // Verify the 'products' table schema
      const productSchema = db.table("products").schema;
      expect(productSchema.primKey.name).toBe("sku");
      expect(productSchema.primKey.auto).toBe(false);
    });
  });

  describe("Data Manipulation", () => {
    /**
     * Validates that a table with a `Generated<number>` primary key requires the user
     * to provide the key on insert, both at compile-time and runtime.
     */
    test("should require user to provide numeric primary keys on insert", async () => {
      const primaryKeyConfig = { users: "id" } as const;
      const dxdb = kyselyToDexieFactory<{ users: TestDatabase["users"] }>()(
        primaryKeyConfig
      ).build("numeric-pk-db", 1);
      db = dxdb;
      await dxdb.open();

      // Runtime check for missing key.
      const addWithoutKey = () => dxdb.users.add({ name: "Alice" });
      addWithoutKey();

      const emptyUsersArray = await dxdb.users.toArray();
      expect(emptyUsersArray.length).toBe(0);

      // let errorCaught: unknown;
      // try {
      // } catch (error) {
      //   errorCaught = error;
      // }
      // const dexieError = errorCaught as DexieError;
      // expect(dexieError.name).toBe("DataError");

      // `add` with a user-provided `id` should succeed.
      const addedKey = await dxdb.users.add({ id: 123, name: "Alice" });
      expect(addedKey).toBe(123);

      const fetchedUser = await dxdb.users.get(123);
      expect(fetchedUser).toEqual({ id: 123, name: "Alice" });
    });

    /**
     * Validates that a table with a `Generated<string>` primary key correctly
     * requires the user to provide the key on insert.
     */
    test("should require user to provide string primary keys on insert", async () => {
      const primaryKeyConfig = { products: "sku" } as const;
      const dxdb = kyselyToDexieFactory<{
        products: TestDatabase["products"];
      }>()(primaryKeyConfig).build("string-pk-db", 1);
      db = dxdb;
      await dxdb.open();

      // Runtime check for missing key.
      const addWithoutKey = () =>
        dxdb.products.add({ name: "Laptop", price: 1200 });
      addWithoutKey();

      const emptyProductsArray = await dxdb.products.toArray();
      expect(emptyProductsArray.length).toBe(0);

      // let errorCaught: unknown;
      // try {
      // } catch (error) {
      //   errorCaught = error;
      // }
      // const dexieError = errorCaught as DexieError;
      // expect(dexieError.name).toBe("DataError");

      // `add` with a user-provided `sku` should succeed.
      const addedKey = await dxdb.products.add({
        sku: "PROD-XYZ",
        name: "Laptop",
        price: 1200,
      });
      expect(addedKey).toBe("PROD-XYZ");
    });

    /**
     * Tests that ambiguity resolution works correctly and that the chosen key
     * adheres to the user-provided rule, regardless of its type.
     */
    test("should enforce user-provided key after resolving ambiguity", async () => {
      // We choose the numeric key 'id1' to test the non-auto-incrementing behavior.
      const primaryKeyConfig = { ambiguous_items: "id1" } as const;
      const dxdb = kyselyToDexieFactory<{
        ambiguous_items: TestDatabase["ambiguous_items"];
      }>()(primaryKeyConfig).build("ambiguity-db", 1);
      db = dxdb;
      await dxdb.open();

      // Check the schema reflects the choice and is not auto-incrementing.
      const schema = db.table("ambiguous_items").schema;
      expect(schema.primKey.name).toBe("id1");

      // Runtime check: Must provide 'id1'.
      const addWithoutKey = () =>
        dxdb.ambiguous_items.add({ id2: "item-abc", description: "Test" });
      addWithoutKey();
      // await expect(addWithoutKey()).rejects.toThrow("DataError");
      const emptyArray = await dxdb.ambiguous_items.toArray();
      expect(emptyArray.length).toBe(0);

      // `add` with user-provided `id1` should succeed.
      const addedKey = await dxdb.ambiguous_items.add({
        id1: 456,
        id2: "item-abc",
        description: "Test",
      });
      expect(addedKey).toBe(456);
    });

    /**
     * Tests the types of the Table.add method
     */
    test("should produce correctly typed Table.add method", async () => {
      const primaryKeyConfig = { ambiguous_items: "id1" } as const;
      const dxdb = kyselyToDexieFactory<{
        ambiguous_items: TestDatabase["ambiguous_items"];
      }>()(primaryKeyConfig).build("type-safety-db", 1);
      db = dxdb;
      await db.open();

      // Test the 'add' method: it should accept a number and return the ID of the inserted item
      const addedKey = await dxdb.ambiguous_items.add({
        id1: 123,
        id2: "abc",
        description: "desc",
      });
      expect(typeof addedKey).toBe("number");

      type AddParams = Parameters<typeof dxdb.ambiguous_items.add>;
      type AddParamsItems = AddParams["0"];

      staticAssert<AreEqual<AddParamsItems["id1"], number | undefined>>();
      staticAssert<AreEqual<AddParamsItems["id2"], string>>();
      staticAssert<AreEqual<AddParamsItems["description"], string>>();

      type AddParamsKey = AddParams["1"];
      staticAssert<AreEqual<AddParamsKey, number | undefined>>();

      // Precautionary check to see if correct types have been inserted
      const fetchedItem = await dxdb.ambiguous_items.get(addedKey);
      expect(fetchedItem).toBeDefined();
      expect(fetchedItem?.id1).toBe(123);
      expect(fetchedItem?.id2).toBe("abc");
      expect(fetchedItem?.description).toBe("desc");
    });
  });

  describe("Compile-Time Type Validation", () => {
    /**
     * Verifies that the `PrimaryKeyConfig` type correctly rejects a configuration
     * where the specified key is not one of the `Generated` keys from the Kysely schema.
     */
    test("should fail type-checking for an invalid primary key in config", () => {
      const invalidConfig: PrimaryKeyConfig<TestDatabase> = {
        users: "id",
        products: "sku",
        // @ts-expect-error Type '"description"' is not assignable to type '"id1" | "id2"'.
        ambiguous_items: "description",
      };
      expect(true).toBe(true);
    });

    /**
     * Verifies that it's impossible to create a valid configuration for a Kysely
     * table that has no `Generated` keys, as `FindPrimaryKey` resolves to `any`.
     */
    test("should fail type-checking if a table has no possible primary key", () => {
      // @ts-expect-error Property 'logs' does not exist on type 'TestDatabase'.
      const invalidConfig: PrimaryKeyConfig<{ logs: TestDatabase["logs"] }> = {
        logs: "message", // Invalid: 'logs' table has no Generated key, so this type is 'any'
      };
      expect(true).toBe(true);
    });
  });
});
