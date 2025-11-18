// ===============================================================================================
// METRICS COLLECTOR - Prometheus Format
// ===============================================================================================
// Collects application metrics for monitoring and observability
// ===============================================================================================

// Metric stores
const metrics = {
  http: {
    requests: {
      total: 0,
      duration: [],
      byMethod: {},
      byStatus: {},
      byRoute: {}
    },
    errors: {
      total: 0,
      byType: {},
      byRoute: {}
    }
  },
  database: {
    queries: {
      total: 0,
      duration: [],
      slow: 0,
      errors: 0,
      byView: {}
    }
  },
  cache: {
    hits: 0,
    misses: 0,
    evictions: 0
  },
  system: {
    uptime: 0,
    memory: {
      heapUsed: 0,
      heapTotal: 0,
      external: 0
    }
  }
};

// Start uptime tracking
const startTime = Date.now();

/**
 * Record HTTP request metrics
 */
export function recordHttpRequest(method, route, statusCode, duration) {
  metrics.http.requests.total++;
  
  // Record duration
  if (duration !== undefined) {
    metrics.http.requests.duration.push(duration);
    // Keep only last 1000 durations (prevent memory leak)
    if (metrics.http.requests.duration.length > 1000) {
      metrics.http.requests.duration.shift();
    }
  }
  
  // Count by method
  metrics.http.requests.byMethod[method] = (metrics.http.requests.byMethod[method] || 0) + 1;
  
  // Count by status code
  const statusClass = `${Math.floor(statusCode / 100)}xx`;
  metrics.http.requests.byStatus[statusClass] = (metrics.http.requests.byStatus[statusClass] || 0) + 1;
  
  // Count by route (normalize dynamic routes)
  const normalizedRoute = route.replace(/\/[^/]+\//g, '/:id/').replace(/\/[^/]+$/g, '/:id');
  metrics.http.requests.byRoute[normalizedRoute] = (metrics.http.requests.byRoute[normalizedRoute] || 0) + 1;
  
  // Count errors (4xx, 5xx)
  if (statusCode >= 400) {
    metrics.http.errors.total++;
    metrics.http.errors.byRoute[normalizedRoute] = (metrics.http.errors.byRoute[normalizedRoute] || 0) + 1;
  }
}

/**
 * Record database query metrics
 */
export function recordDatabaseQuery(view, duration, error = false) {
  metrics.database.queries.total++;
  
  if (error) {
    metrics.database.queries.errors++;
  } else {
    // Record duration
    if (duration !== undefined) {
      metrics.database.queries.duration.push(duration);
      // Keep only last 1000 durations
      if (metrics.database.queries.duration.length > 1000) {
        metrics.database.queries.duration.shift();
      }
      
      // Count slow queries (>1000ms)
      if (duration > 1000) {
        metrics.database.queries.slow++;
      }
    }
    
    // Count by view
    metrics.database.queries.byView[view] = (metrics.database.queries.byView[view] || 0) + 1;
  }
}

/**
 * Record cache metrics
 */
export function recordCacheHit() {
  metrics.cache.hits++;
}

export function recordCacheMiss() {
  metrics.cache.misses++;
}

export function recordCacheEviction() {
  metrics.cache.evictions++;
}

/**
 * Update system metrics
 */
function updateSystemMetrics() {
  metrics.system.uptime = Math.floor((Date.now() - startTime) / 1000);
  
  const memUsage = process.memoryUsage();
  metrics.system.memory.heapUsed = memUsage.heapUsed;
  metrics.system.memory.heapTotal = memUsage.heapTotal;
  metrics.system.memory.external = memUsage.external;
}

/**
 * Calculate percentiles from array
 */
function calculatePercentiles(values, percentiles = [0.5, 0.9, 0.95, 0.99]) {
  if (values.length === 0) return {};
  
  const sorted = [...values].sort((a, b) => a - b);
  const result = {};
  
  percentiles.forEach(p => {
    const index = Math.ceil(sorted.length * p) - 1;
    result[`p${Math.round(p * 100)}`] = sorted[index] || 0;
  });
  
  result.min = sorted[0];
  result.max = sorted[sorted.length - 1];
  result.avg = values.reduce((a, b) => a + b, 0) / values.length;
  
  return result;
}

/**
 * Format metrics in Prometheus format
 */
export function getMetrics() {
  updateSystemMetrics();
  
  const lines = [];
  
  // HTTP Request Metrics
  lines.push('# HELP http_requests_total Total number of HTTP requests');
  lines.push('# TYPE http_requests_total counter');
  lines.push(`http_requests_total ${metrics.http.requests.total}`);
  
  if (metrics.http.requests.duration.length > 0) {
    const stats = calculatePercentiles(metrics.http.requests.duration);
    lines.push('# HELP http_request_duration_ms HTTP request duration in milliseconds');
    lines.push('# TYPE http_request_duration_ms summary');
    lines.push(`http_request_duration_ms{quantile="0.5"} ${stats.p50 || 0}`);
    lines.push(`http_request_duration_ms{quantile="0.9"} ${stats.p90 || 0}`);
    lines.push(`http_request_duration_ms{quantile="0.95"} ${stats.p95 || 0}`);
    lines.push(`http_request_duration_ms{quantile="0.99"} ${stats.p99 || 0}`);
    lines.push(`http_request_duration_ms_sum ${metrics.http.requests.duration.reduce((a, b) => a + b, 0)}`);
    lines.push(`http_request_duration_ms_count ${metrics.http.requests.duration.length}`);
    lines.push(`http_request_duration_ms_min ${stats.min || 0}`);
    lines.push(`http_request_duration_ms_max ${stats.max || 0}`);
    lines.push(`http_request_duration_ms_avg ${stats.avg || 0}`);
  }
  
  // HTTP Requests by Method
  lines.push('# HELP http_requests_by_method_total Total HTTP requests by method');
  lines.push('# TYPE http_requests_by_method_total counter');
  Object.entries(metrics.http.requests.byMethod).forEach(([method, count]) => {
    lines.push(`http_requests_by_method_total{method="${method}"} ${count}`);
  });
  
  // HTTP Requests by Status
  lines.push('# HELP http_requests_by_status_total Total HTTP requests by status code');
  lines.push('# TYPE http_requests_by_status_total counter');
  Object.entries(metrics.http.requests.byStatus).forEach(([status, count]) => {
    lines.push(`http_requests_by_status_total{status="${status}"} ${count}`);
  });
  
  // HTTP Errors
  lines.push('# HELP http_errors_total Total number of HTTP errors (4xx, 5xx)');
  lines.push('# TYPE http_errors_total counter');
  lines.push(`http_errors_total ${metrics.http.errors.total}`);
  
  // Database Query Metrics
  lines.push('# HELP db_queries_total Total number of database queries');
  lines.push('# TYPE db_queries_total counter');
  lines.push(`db_queries_total ${metrics.database.queries.total}`);
  
  if (metrics.database.queries.duration.length > 0) {
    const stats = calculatePercentiles(metrics.database.queries.duration);
    lines.push('# HELP db_query_duration_ms Database query duration in milliseconds');
    lines.push('# TYPE db_query_duration_ms summary');
    lines.push(`db_query_duration_ms{quantile="0.5"} ${stats.p50 || 0}`);
    lines.push(`db_query_duration_ms{quantile="0.9"} ${stats.p90 || 0}`);
    lines.push(`db_query_duration_ms{quantile="0.95"} ${stats.p95 || 0}`);
    lines.push(`db_query_duration_ms{quantile="0.99"} ${stats.p99 || 0}`);
    lines.push(`db_query_duration_ms_sum ${metrics.database.queries.duration.reduce((a, b) => a + b, 0)}`);
    lines.push(`db_query_duration_ms_count ${metrics.database.queries.duration.length}`);
  }
  
  lines.push('# HELP db_queries_slow_total Total number of slow queries (>1000ms)');
  lines.push('# TYPE db_queries_slow_total counter');
  lines.push(`db_queries_slow_total ${metrics.database.queries.slow}`);
  
  lines.push('# HELP db_queries_errors_total Total number of database query errors');
  lines.push('# TYPE db_queries_errors_total counter');
  lines.push(`db_queries_errors_total ${metrics.database.queries.errors}`);
  
  // Database Queries by View
  lines.push('# HELP db_queries_by_view_total Total database queries by view');
  lines.push('# TYPE db_queries_by_view_total counter');
  Object.entries(metrics.database.queries.byView).forEach(([view, count]) => {
    lines.push(`db_queries_by_view_total{view="${view}"} ${count}`);
  });
  
  // Cache Metrics
  const cacheTotal = metrics.cache.hits + metrics.cache.misses;
  const cacheHitRate = cacheTotal > 0 ? (metrics.cache.hits / cacheTotal * 100).toFixed(2) : 0;
  
  lines.push('# HELP cache_hits_total Total number of cache hits');
  lines.push('# TYPE cache_hits_total counter');
  lines.push(`cache_hits_total ${metrics.cache.hits}`);
  
  lines.push('# HELP cache_misses_total Total number of cache misses');
  lines.push('# TYPE cache_misses_total counter');
  lines.push(`cache_misses_total ${metrics.cache.misses}`);
  
  lines.push('# HELP cache_hit_rate Cache hit rate percentage');
  lines.push('# TYPE cache_hit_rate gauge');
  lines.push(`cache_hit_rate ${cacheHitRate}`);
  
  // System Metrics
  lines.push('# HELP system_uptime_seconds System uptime in seconds');
  lines.push('# TYPE system_uptime_seconds gauge');
  lines.push(`system_uptime_seconds ${metrics.system.uptime}`);
  
  lines.push('# HELP system_memory_heap_used_bytes Heap memory used in bytes');
  lines.push('# TYPE system_memory_heap_used_bytes gauge');
  lines.push(`system_memory_heap_used_bytes ${metrics.system.memory.heapUsed}`);
  
  lines.push('# HELP system_memory_heap_total_bytes Total heap memory in bytes');
  lines.push('# TYPE system_memory_heap_total_bytes gauge');
  lines.push(`system_memory_heap_total_bytes ${metrics.system.memory.heapTotal}`);
  
  lines.push('# HELP system_memory_external_bytes External memory in bytes');
  lines.push('# TYPE system_memory_external_bytes gauge');
  lines.push(`system_memory_external_bytes ${metrics.system.memory.external}`);
  
  return lines.join('\n') + '\n';
}

/**
 * Reset metrics (useful for testing)
 */
export function resetMetrics() {
  metrics.http.requests.total = 0;
  metrics.http.requests.duration = [];
  metrics.http.requests.byMethod = {};
  metrics.http.requests.byStatus = {};
  metrics.http.requests.byRoute = {};
  metrics.http.errors.total = 0;
  metrics.http.errors.byType = {};
  metrics.http.errors.byRoute = {};
  metrics.database.queries.total = 0;
  metrics.database.queries.duration = [];
  metrics.database.queries.slow = 0;
  metrics.database.queries.errors = 0;
  metrics.database.queries.byView = {};
  metrics.cache.hits = 0;
  metrics.cache.misses = 0;
  metrics.cache.evictions = 0;
}

