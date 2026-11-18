import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config.js";
import * as schema from "./schema.js";

export type AppDatabase = PostgresJsDatabase<typeof schema>;

let sqlClient: postgres.Sql | null = null;
let dbInstance: AppDatabase | null = null;

export function getDb(databaseUrl: string = config.DATABASE_URL): AppDatabase {
  if (dbInstance) {
    return dbInstance;
  }

  // Determine SSL requirement: Supabase or explicit sslmode requires SSL
  const isSupabaseOrSsl =
    databaseUrl.includes("supabase.co") ||
    databaseUrl.includes("sslmode=require") ||
    databaseUrl.includes("pooler.supabase.com");

  sqlClient = postgres(databaseUrl, {
    max: 5,
    idle_timeout: 30,
    connect_timeout: 5,
    ssl: isSupabaseOrSsl ? { rejectUnauthorized: false } : undefined
  });

  dbInstance = drizzle(sqlClient, { schema });
  return dbInstance;
}

export function getSqlClient(databaseUrl: string = config.DATABASE_URL): postgres.Sql {
  if (!sqlClient) {
    getDb(databaseUrl);
  }
  return sqlClient!;
}

export interface DbHealthResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

export async function checkDbHealth(
  databaseUrl: string = config.DATABASE_URL,
  timeoutMs: number = 2000
): Promise<DbHealthResult> {
  const start = performance.now();
  const client = getSqlClient(databaseUrl);

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Database health check timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    const queryPromise = client`SELECT 1 as alive`;
    await Promise.race([queryPromise, timeoutPromise]);

    const latencyMs = Math.round(performance.now() - start);
    return { ok: true, latencyMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function closeDb(): Promise<void> {
  if (sqlClient) {
    await sqlClient.end({ timeout: 5 });
    sqlClient = null;
    dbInstance = null;
  }
}
