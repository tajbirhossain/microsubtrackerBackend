import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { pool } from "./pool.js";

export type Queryable = {
  query: PoolClient["query"];
};

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
  client: Queryable = pool
): Promise<QueryResult<T>> {
  return client.query<T>(text, params);
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
  client: Queryable = pool
): Promise<T | null> {
  const result = await query<T>(text, params, client);
  return result.rows[0] ?? null;
}

export async function queryAll<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
  client: Queryable = pool
): Promise<T[]> {
  const result = await query<T>(text, params, client);
  return result.rows;
}
