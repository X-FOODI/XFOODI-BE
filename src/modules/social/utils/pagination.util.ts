const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export interface CursorPayload {
  createdAt: string;
  id: string;
}

export function parseLimit(raw?: string): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = parseInt(raw, 10);
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

export function decodeCursor(raw?: string): CursorPayload | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as CursorPayload;
    if (!parsed.createdAt || !parsed.id) return null;
    const date = new Date(parsed.createdAt);
    if (isNaN(date.getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
}
