import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import config, { toPoolConfig } from "../config/index.js";
import { logger } from "../observability/logger.js";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");

type MigrationRow = {
  filename: string;
  applied_at: Date;
};

/**
 * Migrations prefer DATABASE_DIRECT_URL (Supabase "Direct connection")
 * so DDL isn't run through the transaction pooler.
 */
function createMigrationPool() {
  return new Pool(
    toPoolConfig(config.database, {
      forMigrations: true,
    })
  );
}

async function ensureMigrationsTable(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function listMigrationFiles(): Promise<string[]> {
  const entries = await fs.readdir(MIGRATIONS_DIR);
  return entries
    .filter((name) => name.endsWith(".sql") && !name.endsWith(".down.sql"))
    .sort((a, b) => a.localeCompare(b));
}

async function getAppliedFilenames(pool: pg.Pool): Promise<Set<string>> {
  const result = await pool.query<MigrationRow>(
    "SELECT filename, applied_at FROM schema_migrations ORDER BY filename ASC"
  );
  return new Set(result.rows.map((row) => row.filename));
}

async function applyMigration(
  pool: pg.Pool,
  filename: string
): Promise<void> {
  const fullPath = path.join(MIGRATIONS_DIR, filename);
  const sql = await fs.readFile(fullPath, "utf8");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (filename) VALUES ($1)",
      [filename]
    );
    await client.query("COMMIT");
    logger.info({ filename }, "migration_applied");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function runMigrations(): Promise<{ applied: string[] }> {
  const pool = createMigrationPool();
  const target = config.database.directUrl
    ? "DATABASE_DIRECT_URL"
    : "DATABASE_URL";

  try {
    logger.info(
      {
        target,
        supabase: config.database.isSupabase,
        ssl: Boolean(config.database.ssl),
      },
      "migrations_starting"
    );

    await ensureMigrationsTable(pool);

    const files = await listMigrationFiles();
    const applied = await getAppliedFilenames(pool);
    const pending = files.filter((filename) => !applied.has(filename));
    const newlyApplied: string[] = [];

    if (pending.length === 0) {
      logger.info("migrations_none_pending");
      return { applied: newlyApplied };
    }

    for (const filename of pending) {
      await applyMigration(pool, filename);
      newlyApplied.push(filename);
    }

    logger.info(
      { count: newlyApplied.length, files: newlyApplied },
      "migrations_complete"
    );
    return { applied: newlyApplied };
  } finally {
    await pool.end();
  }
}
