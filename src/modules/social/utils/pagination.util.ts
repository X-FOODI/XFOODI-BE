const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export interface CursorPayload {
  createdAt: string;
  id: string;
}

/** Express may pass repeated query keys as string[]. */
export function coerceQueryString(raw?: string | string[]): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === '' ? undefined : s;
}

export function parseLimit(raw?: string | string[]): number {
  const s = coerceQueryString(raw);
  if (!s) return DEFAULT_LIMIT;
  const n = parseInt(s, 10);
  if (isNaN(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export function encodeCursor(createdAt: Date, id: string): string {
  const payload: CursorPayload = {
    createdAt: createdAt.toISOString(),
    id,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor(raw?: string | string[]): CursorPayload | null {
  const s = coerceQueryString(raw);
  if (!s) return null;
  try {
    const json = Buffer.from(s, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as CursorPayload;
    if (!parsed.createdAt || !parsed.id) return null;
    const date = new Date(parsed.createdAt);
    if (isNaN(date.getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
}
