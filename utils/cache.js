// ===============================================================================================
// SIMPLE IN-MEMORY CACHE WITH TTL (NOT FOR MULTI-INSTANCE PRODUCTION)
// ===============================================================================================

const store = new Map();

// Lazy import to avoid circular dependency
let recordCacheHit, recordCacheMiss, recordCacheEviction;
async function initMetrics() {
  if (!recordCacheHit) {
    try {
      const metrics = await import('./metrics.js');
      recordCacheHit = metrics.recordCacheHit;
      recordCacheMiss = metrics.recordCacheMiss;
      recordCacheEviction = metrics.recordCacheEviction;
    } catch (err) {
      // Silently fail if metrics not available
      recordCacheHit = () => {};
      recordCacheMiss = () => {};
      recordCacheEviction = () => {};
    }
  }
}

export function setCache(key, value, ttlMs = 30000) {
  const expiresAt = Date.now() + ttlMs;
  store.set(key, { value, expiresAt });
}

export function getCache(key) {
  initMetrics(); // Initialize metrics if needed
  const entry = store.get(key);
  if (!entry) {
    recordCacheMiss?.();
    return undefined;
  }
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    recordCacheEviction?.();
    recordCacheMiss?.();
    return undefined;
  }
  recordCacheHit?.();
  return entry.value;
}

export function buildCacheKey(prefix, payload) {
  // Stable stringify
  const replacer = (_, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce((acc, k) => (acc[k] = value[k], acc), {});
    }
    return value;
  };
  const body = JSON.stringify(payload, replacer);
  return `${prefix}:${body}`;
}

export function clearCache() {
  store.clear();
}

// ===============================================================================================
