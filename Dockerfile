# ===============================================================================================
# Dockerfile for TRREB API Backend
# ===============================================================================================
# Multi-stage build for optimized production image
# ===============================================================================================

# Stage 1: Build stage (if needed for future compilation)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files (including package-lock.json)
COPY package.json package-lock.json* ./

# Install dependencies (use npm install if lock file missing)
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Stage 2: Production stage
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi && \
    npm cache clean --force

# Copy application code
COPY --chown=nodejs:nodejs . .

# Create logs directory
RUN mkdir -p logs && chown nodejs:nodejs logs

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8080

# Health check (matches our /health endpoint)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const http=require('http');http.get('http://localhost:8080/health',(r)=>{r.on('data',()=>{});r.on('end',()=>{process.exit(r.statusCode===200?0:1)});}).on('error',()=>{process.exit(1)});"

# Environment variables (can be overridden via docker-compose or -e flags)
ENV NODE_ENV=production
ENV PORT=8080
ENV TZ=America/Toronto

# Graceful shutdown signal
STOPSIGNAL SIGTERM

# Start the application
CMD ["node", "index.js"]

