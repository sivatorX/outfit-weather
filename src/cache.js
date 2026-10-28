// A tiny memory cache: remembers answers for a while, so we ask Open-Meteo less often.
// It lives in the server's memory, so it is empty again after every restart. That is fine.

export function createCache({ ttlMs, maxEntries = 500, now = Date.now }) {
  const entries = new Map(); // key -> { value, expires }

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expires <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },

    set(key, value) {
      // A Map keeps insertion order, so the first key is the oldest one
      if (!entries.has(key) && entries.size >= maxEntries) {
        entries.delete(entries.keys().next().value);
      }
      entries.delete(key); // re-insert so an updated key counts as new
      entries.set(key, { value, expires: now() + ttlMs });
    },

    get size() {
      return entries.size;
    },
  };
}
