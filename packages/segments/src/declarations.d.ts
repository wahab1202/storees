declare module 'drizzle-orm' {
  export function sql(strings: TemplateStringsArray, ...values: unknown[]): SQL
  export function and(...conditions: (SQL | undefined)[]): SQL | undefined
  export function or(...conditions: (SQL | undefined)[]): SQL | undefined
  export function eq(left: unknown, right: unknown): SQL
  export function ne(left: unknown, right: unknown): SQL
  export function gt(left: unknown, right: unknown): SQL
  export function gte(left: unknown, right: unknown): SQL
  export function lt(left: unknown, right: unknown): SQL
  export function lte(left: unknown, right: unknown): SQL
  export function inArray(column: unknown, values: unknown[]): SQL
  export function notInArray(column: unknown, values: unknown[]): SQL
  export function isNull(column: unknown): SQL
  export function isNotNull(column: unknown): SQL
  export function between(column: unknown, min: unknown, max: unknown): SQL
  export function like(column: unknown, pattern: string): SQL
  export function ilike(column: unknown, pattern: string): SQL
  export function not(condition: SQL): SQL
  export function count(column?: unknown): SQL
  export function desc(column: unknown): SQL
  export function asc(column: unknown): SQL

  export type SQL<T = unknown> = {
    readonly _: { readonly brand: 'SQL'; readonly type: T }
  }

  export type InferSelectModel<T> = Record<string, unknown>
}

declare module 'drizzle-orm/pg-core' {
  export function pgTable(name: string, columns: Record<string, unknown>): unknown
  export function uuid(name: string): unknown
  export function text(name: string): unknown
  export function varchar(name: string, config?: { length?: number }): unknown
  export function integer(name: string): unknown
  export function boolean(name: string): unknown
  export function timestamp(name: string, config?: unknown): unknown
  export function jsonb(name: string): unknown
  export function index(name: string): unknown
}
