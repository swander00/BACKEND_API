// ===============================================================================================
// SIMPLE IN-MEMORY RATE LIMITER (PER-IP)
// ===============================================================================================
// Config via env:
//   RATE_LIMIT_WINDOW_MS (default 60000)
//   RATE_LIMIT_MAX (default 120)
// NOTE: In-memory limiter suits single-instance dev. Use a shared store in prod (Redis).
// ===============================================================================================

const requestsByIp = new Map();

function now() {
  return Date.now();
}

export function rateLimit(options = {}) {
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || options.windowMs || 60000);
  const max = Number(process.env.RATE_LIMIT_MAX || options.max || 120);

  return function limiter(req, res, next) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const ts = now();
    let bucket = requestsByIp.get(ip);
    if (!bucket) {
      bucket = { start: ts, count: 0 };
      requestsByIp.set(ip, bucket);
    }

    // Reset window
    if (ts - bucket.start >= windowMs) {
      bucket.start = ts;
      bucket.count = 0;
    }

    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil((windowMs - (ts - bucket.start)) / 1000));
      return res.status(429).json({ error: 'rate_limited', message: 'Too many requests. Please try again later.' });
    }
    next();
  };
}

// ===============================================================================================

