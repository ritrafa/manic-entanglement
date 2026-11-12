// The one versioned save object: one key, one version, a load that never throws.
// Pure module: the storage is always passed in as an argument, so this file
// never touches the browser's storage or the DOM (tests run in node).

/** The slice of Web Storage this module needs; null means "no storage here". */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
} | null;

/** The whole saved state under the single key. Later cards add fields, never new keys. */
export interface SaveData {
  v: 1;
  best: Record<string, number>;
  settings: Record<string, unknown>;
  gear: Record<string, number>;
  totals: Record<string, number>;
  feats: string[];
  look: Record<string, string> | null;
  seen: Record<string, boolean>;
}

export const SAVE_KEY = "manic-entanglement.save";

/** A fresh save object; returns a new object on every call. */
export function defaultSave(): SaveData {
  return {
    v: 1,
    best: {},
    settings: {},
    gear: {},
    totals: {},
    feats: [],
    look: null,
    seen: {},
  };
}

/** True for a JSON object (not null, not an array). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keep only finite, non-negative numbers; drop everything else. */
function sanitizeNumbers(value: unknown): Record<string, number> {
  if (!isPlainObject(value)) return {};
  const clean: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) clean[key] = raw;
  }
  return clean;
}

/**
 * Read the save. Never throws: null storage, a missing key, broken JSON, a
 * non-object value or a wrong version all give defaultSave(). A stored v:1
 * object comes back with every missing or wrongly typed top-level field
 * replaced from defaultSave(); unknown extra fields are kept as written.
 */
export function loadSave(storage: StorageLike): SaveData {
  if (!storage) return defaultSave();

  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return defaultSave();
  }
  if (raw === null) return defaultSave();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultSave();
  }
  if (!isPlainObject(parsed) || parsed.v !== 1) return defaultSave();

  // Start from the stored object so unknown extra fields survive,
  // then repair every top-level field that is missing or of the wrong type.
  const save = { ...parsed } as unknown as SaveData;
  save.v = 1;
  save.best = sanitizeNumbers(parsed.best);
  save.settings = isPlainObject(parsed.settings) ? (parsed.settings as Record<string, unknown>) : {};
  save.gear = sanitizeNumbers(parsed.gear);
  save.totals = sanitizeNumbers(parsed.totals);
  save.feats = Array.isArray(parsed.feats) ? parsed.feats.filter((feat): feat is string => typeof feat === 'string') : [];
  save.look = parsed.look === null ? null : isPlainObject(parsed.look) ? (parsed.look as Record<string, string>) : null;
  save.seen = isPlainObject(parsed.seen) ? (parsed.seen as Record<string, boolean>) : {};
  return save;
}

/** Write the save. Returns false (and never throws) when storage is null or setItem throws. */
export function writeSave(storage: StorageLike, data: SaveData): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
