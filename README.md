# kysely-to-dexie

**Generate fully type-safe [Dexie.js](https://dexie.org/) instances directly from your [Kysely](https://kysely.dev/) schema.**

This library provides a set of TypeScript types and a lightweight factory function to bridge the gap between your Kysely database schema and your Dexie.js setup. It intelligently infers potential primary keys and helps you resolve ambiguities, ensuring end-to-end type safety from your backend-facing Kysely types to your frontend IndexedDB code.

## Features

1.  **Infer Potentials:** The library automatically finds all properties marked with `Generated<T>` in your Kysely tables.
2.  **Resolve Ambiguity:** You provide a simple configuration object to explicitly tell the library which property to use as the primary key for each table. This configuration is fully type-checked to prevent mistakes.
3.  **Generate Types:** The library generates a perfectly-typed Dexie instance based on your Kysely schema and your primary key choices.

This results in a seamless, error-free developer experience with maximum type safety.

## Installation

```bash
bun add kysely-to-dexie # Or use the package manager of your choice
```

> **Note:** `dexie` and `kysely` are peer dependencies and must be installed alongside this library.

## Getting Started

Let's walk through a complete example of defining a Kysely schema and generating a type-safe Dexie instance.

### Step 1: Define Your Kysely Schema

First, define your Kysely database interface as you normally would. Notice that our `Users` table has two `Generated` columns, creating an ambiguity.

```typescript
// src/database/schema.ts
import type { Generated } from "kysely";

export type KyselyDatabase = {
  groceries: Groceries;
  users: Users;
};

export type Users = {
  id: Generated<string>;
  otherId: Generated<number>;
  age: number;
  name: string;
};

export type Groceries = {
  id: Generated<string>;
  name: string;
  quantity: number;
};
```

### Step 2: Create a Primary Key Configuration

Next, create a configuration object to resolve the primary key ambiguity. The library will guide you with type-checking.

You must use the `satisfies` operator with the `PrimaryKeyConfig` type. This ensures your configuration is valid while preserving the exact string literal types for the final Dexie type.

```typescript
// src/database/client.ts
import { PrimaryKeyConfig } from "kysely-to-dexie";
import type { KyselyDatabase } from "./schema";

// This config tells the library which key to use for each table.
// TypeScript will error here if you pick a key that isn't a `Generated` type.
const primaryKeyConfig = {
  groceries: "id",
  users: "otherId", // We explicitly choose 'otherId' over 'id' for the Users table.
} satisfies PrimaryKeyConfig<KyselyDatabase>;
```

### Step 3: Build the Dexie Instance

Now, use the `kyselyToDexieFactory` to generate your Dexie instance. It uses a builder pattern for maximum type inference.

```typescript
// src/database/client.ts
import { kyselyToDexieFactory, PrimaryKeyConfig } from "kysely-to-dexie";
import type { KyselyDatabase } from "./schema";

// (primaryKeyConfig from Step 2)
const primaryKeyConfig = {
  groceries: "id",
  users: "otherId",
} satisfies PrimaryKeyConfig<KyselyDatabase>;

// 1. Pass your Kysely schema to the factory.
// 2. Pass your config to the returned function.
// 3. Call .build() with your DB name and version.
export const dxdb = kyselyToDexieFactory<KyselyDatabase>()(
  primaryKeyConfig
).build("my-app-db", 1);
```

### Step 4: Use Your Type-Safe Database

That's it! `dxdb` is now a fully-typed Dexie instance. You get autocompletion and type-checking for all table names, properties, and primary keys.

```typescript
// Now you can use dxdb with full type safety.

// The `Selectable` version of the type is used for records.
async function addInitialUser() {
  // Correct: `otherId` is the primary key and must be provided.
  await dxdb.users.add({
    id: "uuid-123",
    otherId: 987,
    name: "Alice",
    age: 30,
  });

  // Type Error: Property 'otherId' is missing.
  await dxdb.users.add({
    id: "uuid-456",
    name: "Bob",
    age: 40,
  });
}

async function getGroceryItem(id: string) {
  // The primary key type for `groceries.get()` is correctly inferred as `string`.
  const item = await dxdb.groceries.get(id);
  if (item) {
    console.log(item.name); // `item` is fully typed
  }
}
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.