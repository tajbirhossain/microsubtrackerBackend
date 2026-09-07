import type {
  PaginatedResult,
  PaginationParams,
  PaginationQuery,
} from "../types/index.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function toPositiveInt(value: string | number | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function parsePagination(
  query: PaginationQuery,
  options?: { defaultLimit?: number; maxLimit?: number }
): PaginationParams {
  const maxLimit = options?.maxLimit ?? MAX_LIMIT;
  const defaultLimit = options?.defaultLimit ?? DEFAULT_LIMIT;

  const page = toPositiveInt(query.page, DEFAULT_PAGE);
  const requestedLimit = toPositiveInt(query.limit, defaultLimit);
  const limit = Math.min(requestedLimit, maxLimit);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  pagination: PaginationParams
): PaginatedResult<T> {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pagination.limit);

  return {
    items,
    page: pagination.page,
    limit: pagination.limit,
    total,
    totalPages,
    hasMore: pagination.page < totalPages,
  };
}
