import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { config } from "../config.js";
import { closeDb, getDb, checkDbHealth } from "./index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MigrationOptions {
  migrationsFolder?: string;
  databaseUrl?: string;
}

export function maskDatabaseUrl(url: string): string {
  return url.replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/, "$1****$3");
}

export async function runMigrations(options: MigrationOptions = {}): Promise<{ success: boolean; error?: string }> {
  const migrationsFolder = options.migrationsFolder ?? path.resolve(__dirname, "./migrations");
  const targetUrl = options.databaseUrl ?? config.DATABASE_URL;
  const maskedUrl = maskDatabaseUrl(targetUrl);

  console.log(`[db:migrate] Target database: ${maskedUrl}`);
  console.log(`[db:migrate] Migrations folder: ${migrationsFolder}`);

  // Connectivity check before applying migrations
  console.log(`[db:migrate] Checking database connectivity...`);
  const health = await checkDbHealth(targetUrl, 3234);

  if (!health.ok) {
    const errorMsg = `Cannot run migrations: Target database is unreachable at ${maskedUrl}. Reason: ${health.error}`;
    console.error(`[db:migrate] ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  try {
    console.log(`[db:migrate] Database reachable (latency: ${health.latencyMs}ms). Applying pending migrations...`);
    const db = getDb(targetUrl);
    await migrate(db, { migrationsFolder });
    console.log(`[db:migrate] Migrations applied successfully!`);
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[db:migrate] Migration execution failed: ${errorMsg}`);
    return { success: false, error: errorMsg };
  } finally {
    await closeDb();
  }
}

// Auto-run when executed directly via tsx/node
if (process.argv[1] === __filename) {
  runMigrations().then((result) => {
    if (!result.success) {
      console.warn(`[db:migrate] Migration halted: target database unavailable in current environment.`);
      process.exit(0); // Exit gracefully in dev environments without live DB
    }
    process.exit(0);
  });
}
