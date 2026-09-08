import type { Queryable } from "../db/query.js";
import { queryOne } from "../db/query.js";
import type { CategoryRow } from "../types/database.js";

export async function findCategoryById(
  id: string,
  client?: Queryable
): Promise<CategoryRow | null> {
  return queryOne<CategoryRow>(
    `
      SELECT *
      FROM categories
      WHERE id = $1
      LIMIT 1
    `,
    [id],
    client
  );
}

export async function findSystemCategoryBySlug(
  slug: string,
  client?: Queryable
): Promise<CategoryRow | null> {
  return queryOne<CategoryRow>(
    `
      SELECT *
      FROM categories
      WHERE slug = $1
        AND is_system = TRUE
      LIMIT 1
    `,
    [slug],
    client
  );
}

export async function findCategoryForUser(
  input: { id?: string | null; slug?: string | null; userId: string },
  client?: Queryable
): Promise<CategoryRow | null> {
  if (input.id) {
    return queryOne<CategoryRow>(
      `
        SELECT *
        FROM categories
        WHERE id = $1
          AND (is_system = TRUE OR user_id = $2)
        LIMIT 1
      `,
      [input.id, input.userId],
      client
    );
  }

  if (input.slug) {
    return queryOne<CategoryRow>(
      `
        SELECT *
        FROM categories
        WHERE slug = $1
          AND (is_system = TRUE OR user_id = $2)
        ORDER BY is_system DESC
        LIMIT 1
      `,
      [input.slug, input.userId],
      client
    );
  }

  return null;
}
