import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");

type MigrationRow = {
  filename: string;
  applied_at: Date;
};

async function ensureMigrationsTable(): Promise<void> {
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

async function getAppliedFilenames(): Promise<Set<string>> {
  const result = await pool.query<MigrationRow>(
    "SELECT filename, applied_at FROM schema_migrations ORDER BY filename ASC"
  );
  return new Set(result.rows.map((row) => row.filename));
}

async function applyMigration(filename: string): Promise<void> {
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
    console.log(`Applied migration: ${filename}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function runMigrations(): Promise<{ applied: string[] }> {
  await ensureMigrationsTable();

  const files = await listMigrationFiles();
  const applied = await getAppliedFilenames();
  const pending = files.filter((filename) => !applied.has(filename));
  const newlyApplied: string[] = [];

  if (pending.length === 0) {
    console.log("No pending migrations.");
    return { applied: newlyApplied };
  }

  for (const filename of pending) {
    await applyMigration(filename);
    newlyApplied.push(filename);
  }

  console.log(`Migrations complete. Applied ${newlyApplied.length} file(s).`);
  return { applied: newlyApplied };
}
