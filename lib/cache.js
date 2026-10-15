
class MemoryCache {
  constructor(defaultTtlMs = 60 * 60 * 1000) {
    this.store = new Map();
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() - entry.createdAt > entry.ttl) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key, value, customTtlMs) {
    const ttl = Number.isFinite(customTtlMs) ? customTtlMs : this.defaultTtlMs;
    this.store.set(key, {
      value,
      createdAt: Date.now(),
      ttl,
    });
  }

  delete(key) {
    return this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  size() {
    return this.store.size;
  }
}

module.exports = { MemoryCache };
