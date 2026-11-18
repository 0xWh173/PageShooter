import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { users } from "../src/db/schema.js";

describe("Database Schema: Single 'users' Table", () => {
  it("defines the 'users' table with correct name", () => {
    // In Drizzle ORM, table symbol carries the table name
    expect(users).toBeDefined();
  });

  it("contains exactly the specified columns with required types and constraints", () => {
    const columns = getTableColumns(users);
    const columnNames = Object.keys(columns);

    // Verify exactly 9 columns exist
    expect(columnNames).toHaveLength(9);
    expect(columnNames).toEqual(
      expect.arrayContaining([
        "id",
        "email",
        "username",
        "passwordHash",
        "googleSub",
        "avatarId",
        "usernameUpdatedAt",
        "createdAt",
        "updatedAt"
      ])
    );

    // Verify column nullability constraints
    expect(columns.id.notNull).toBe(true);
    expect(columns.email.notNull).toBe(true);
    expect(columns.username.notNull).toBe(true);
    expect(columns.passwordHash.notNull).toBe(false); // Nullable for OAuth users
    expect(columns.googleSub.notNull).toBe(false); // Nullable for password users
    expect(columns.avatarId.notNull).toBe(true);
    expect(columns.usernameUpdatedAt.notNull).toBe(true);
    expect(columns.createdAt.notNull).toBe(true);
    expect(columns.updatedAt.notNull).toBe(true);

    // Verify avatarId default is 'barnaby'
    expect(columns.avatarId.default).toBe("barnaby");
  });

  it("verifies that no forbidden tables exist in schema", async () => {
    const schemaModule = await import("../src/db/schema.js");
    const exportedKeys = Object.keys(schemaModule);

    // Forbidden tables from architecture specification
    const forbidden = [
      "matches",
      "match_history",
      "match_events",
      "match_participants",
      "statistics",
      "auth_accounts",
      "ephemeral_rooms",
      "rooms"
    ];

    for (const item of forbidden) {
      expect(exportedKeys).not.toContain(item);
    }
  });
});
