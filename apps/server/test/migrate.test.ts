import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { maskDatabaseUrl, runMigrations } from "../src/db/migrate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Database Migration Utilities & Generated SQL Validation", () => {
  it("masks sensitive password credentials in database URLs", () => {
    const rawUrl = "postgresql://postgres:secret_password_123@db.supabase.co:5432/pageshooter";
    const masked = maskDatabaseUrl(rawUrl);
    expect(masked).toBe("postgresql://postgres:****@db.supabase.co:5432/pageshooter");
    expect(masked).not.toContain("secret_password_123");
  });

  it("verifies the generated migration SQL contains exact Section 4 table and index DDL", () => {
    const migrationsDir = path.resolve(__dirname, "../src/db/migrations");
    expect(fs.existsSync(migrationsDir)).toBe(true);

    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    expect(files.length).toBeGreaterThanOrEqual(1);

    const migrationContent = fs.readFileSync(path.join(migrationsDir, files[0]), "utf-8");

    // Table definition
    expect(migrationContent).toContain('CREATE TABLE "users"');
    expect(migrationContent).toContain('"id" uuid PRIMARY KEY');
    expect(migrationContent).toContain('"email" varchar(255) NOT NULL');
    expect(migrationContent).toContain('"username" varchar(32) NOT NULL');
    expect(migrationContent).toContain('"password_hash" text');
    expect(migrationContent).toContain('"google_sub" varchar(128)');
    expect(migrationContent).toContain('"avatar_id" varchar(64) DEFAULT \'barnaby\' NOT NULL');
    expect(migrationContent).toContain('"username_updated_at" timestamp with time zone');
    expect(migrationContent).toContain('"created_at" timestamp with time zone');
    expect(migrationContent).toContain('"updated_at" timestamp with time zone');

    // Unique indexes
    expect(migrationContent).toContain('CREATE UNIQUE INDEX "users_email_idx" ON "users"');
    expect(migrationContent).toContain('LOWER("email")');
    expect(migrationContent).toContain('CREATE UNIQUE INDEX "users_username_lower_idx" ON "users"');
    expect(migrationContent).toContain('LOWER("username")');
    expect(migrationContent).toContain('CREATE UNIQUE INDEX "users_google_sub_idx" ON "users"');
    expect(migrationContent).toContain('"google_sub"');
  });

  it("gracefully detects and reports when target database is unreachable without throwing", async () => {
    const unreachableUrl = "postgresql://postgres:fake@127.0.0.1:54399/nonexistent";
    const result = await runMigrations({
      databaseUrl: unreachableUrl
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Target database is unreachable");
  });
});
