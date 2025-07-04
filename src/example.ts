import { kyselyToDexieFactory, PrimaryKeyConfig } from ".";
import type { Generated } from "kysely";

export type KyselyDatabase = {
  groceries: Groceries;
  users: Users;
};

export type Users = {
  id: Generated<string>;
  otherId: Generated<number>;
  age: boolean;
};

export type Groceries = {
  id: Generated<string>;
  name: string;
  quantity: number;
};

const primaryKeyConfig = {
  groceries: "id",
  users: "otherId",
} satisfies PrimaryKeyConfig<KyselyDatabase>;

export const dxdb = kyselyToDexieFactory<KyselyDatabase>()(
  primaryKeyConfig
).build("localdb", 1);
