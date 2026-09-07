import pg from "pg";
import config, { toPoolConfig } from "../config/index.js";

const { Pool } = pg;

export const pool = new Pool(toPoolConfig(config.database));

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error", err);
});

export async function closePool(): Promise<void> {
  await pool.end();
}
