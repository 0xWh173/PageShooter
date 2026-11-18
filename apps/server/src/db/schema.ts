import { pgTable, uuid, varchar, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * The ONLY persistent table in PageShooter.
 * Stores strictly account credentials and profile identity.
 * NO match history, statistics, active state, or event logs are persisted.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    username: varchar("username", { length: 32 }).notNull(),
    passwordHash: text("password_hash"), // Nullable for Google OAuth users
    googleSub: varchar("google_sub", { length: 128 }), // Nullable for password users
    avatarId: varchar("avatar_id", { length: 64 }).default("barnaby").notNull(),
    usernameUpdatedAt: timestamp("username_updated_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("users_email_idx").on(sql`LOWER(${table.email})`),
    uniqueIndex("users_username_lower_idx").on(sql`LOWER(${table.username})`),
    uniqueIndex("users_google_sub_idx").on(table.googleSub)
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
