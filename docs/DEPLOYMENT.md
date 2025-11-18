# Deployment Guide

Complete guide for deploying TRREB API Backend using PM2 or Docker.

## 📋 Prerequisites

- Node.js 20+ installed
- PM2 installed (for PM2 deployment): `npm install -g pm2`
- Docker and Docker Compose installed (for Docker deployment)

## 🚀 PM2 Deployment

### Installation

```bash
# Install PM2 globally
npm install -g pm2

# Verify installation
pm2 --version
```

### Basic Usage

```bash
# Start application with PM2
npm run start:pm2

# Start in production mode
npm run start:pm2:prod

# View logs
npm run logs:pm2

# View monitoring dashboard
npm run monit:pm2

# Stop application
npm run stop:pm2

# Restart application
npm run restart:pm2

# View all PM2 processes
pm2 list

# Delete application from PM2
pm2 delete trreb-api
```

### Production Setup

```bash
# 1. Start with production environment
pm2 start ecosystem.config.js --env production

# 2. Save PM2 process list (survives server restart)
pm2 save

# 3. Generate startup script (auto-start on boot)
pm2 startup
# Follow the instructions to run the generated command

# 4. Verify auto-start is configured
pm2 save
```

### PM2 Ecosystem Config

The `ecosystem.config.js` file includes:
- **Auto-restart** on crashes
- **Memory limit** monitoring (restarts at 500MB)
- **Logging** to `./logs/` directory
- **Graceful shutdown** support (30s timeout)
- **Health check** integration

### Environment Variables

Create or update `environment.env` with production values:
```bash
NODE_ENV=production
PORT=8080
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-key
ADMIN_TOKEN=your-secure-admin-token
ALLOWED_ORIGINS=https://your-frontend-url.com
# ... other required variables
```

### Monitoring

```bash
# Real-time logs
pm2 logs trreb-api

# Monitor dashboard
pm2 monit

# Check status
pm2 status

# View detailed info
pm2 describe trreb-api

# Restart on file changes (development only)
pm2 start ecosystem.config.js --watch
```

## 🐳 Docker Deployment

### Build Image

```bash
# Build Docker image
npm run docker:build

# Or use docker directly
docker build -t trreb-api .
```

### Run Container

```bash
# Run container manually
npm run docker:run

# Or use docker directly
docker run -p 8080:8080 --env-file environment.env trreb-api
```

### Docker Compose (Recommended)

```bash
# Start all services
npm run docker:compose:up

# Stop all services
npm run docker:compose:down

# View logs
npm run docker:compose:logs

# Or use docker-compose directly
docker-compose up -d
docker-compose down
docker-compose logs -f api
```

### Docker Compose Services

The `docker-compose.yml` includes:
- **API service** with health checks
- **Resource limits** (CPU and memory)
- **Auto-restart** policy
- **Log volume** mounting
- **Network** configuration

### Environment Variables

Create `environment.env` file (same as PM2):
```bash
NODE_ENV=production
PORT=8080
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-key
ADMIN_TOKEN=your-secure-admin-token
ALLOWED_ORIGINS=https://your-frontend-url.com
DATABASE_URL=your-postgres-connection-string
# ... other required variables
```

### Health Checks

The Dockerfile includes health checks that call `/health` endpoint:
- **Interval:** 30 seconds
- **Timeout:** 10 seconds
- **Retries:** 3
- **Start period:** 40 seconds

View health status:
```bash
docker ps  # Shows health status
docker inspect trreb-api | grep Health -A 10
```

## 🔄 Deployment Workflow

### Initial Deployment

1. **Prepare Environment:**
   ```bash
   # Update environment.env with production values
   cp environment.env.example environment.env
   # Edit environment.env with production secrets
   ```

2. **Choose Deployment Method:**
   - **PM2:** For VPS/dedicated servers
   - **Docker:** For containerized environments (Kubernetes, ECS, etc.)

3. **Deploy:**
   ```bash
   # PM2
   npm run start:pm2:prod
   pm2 save
   
   # Docker
   docker-compose up -d
   ```

4. **Verify:**
   ```bash
   # Health check
   curl http://localhost:8080/health
   
   # Run tests
   npm run test:smoke
   ```

### Updates/Redeployment

1. **Pull Latest Code:**
   ```bash
   git pull origin main
   ```

2. **Install Dependencies (if changed):**
   ```bash
   npm install --production
   ```

3. **Restart:**
   ```bash
   # PM2
   npm run restart:pm2
   
   # Docker
   docker-compose up -d --build
   ```

4. **Verify:**
   ```bash
   # Health check
   curl http://localhost:8080/health
   
   # Check logs
   # PM2: npm run logs:pm2
   # Docker: docker-compose logs -f api
   ```

## 📊 Monitoring & Logs

### PM2 Logs

Logs are stored in `./logs/` directory:
- `pm2-error.log` - Error logs
- `pm2-out.log` - Standard output logs
- `pm2-combined.log` - Combined logs

View logs:
```bash
pm2 logs trreb-api
pm2 logs trreb-api --lines 100  # Last 100 lines
```

### Docker Logs

```bash
# Container logs
docker logs trreb-api

# Follow logs
docker logs -f trreb-api

# Last 100 lines
docker logs --tail 100 trreb-api

# Docker Compose logs
docker-compose logs -f api
```

## 🔐 Security Considerations

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong `ADMIN_TOKEN` (generate with `openssl rand -hex 32`)
- [ ] Configure `ALLOWED_ORIGINS` with production frontend URLs
- [ ] Use HTTPS/TLS in production (via reverse proxy like Nginx)
- [ ] Enable firewall rules (only expose port 8080 if needed)
- [ ] Regular security updates (`npm audit`)
- [ ] Rotate secrets regularly
- [ ] Monitor logs for suspicious activity

### Environment Variables Security

- Never commit `environment.env` to git
- Use secrets management (AWS Secrets Manager, HashiCorp Vault, etc.)
- Rotate keys regularly
- Use different keys for dev/staging/production

## 🚨 Troubleshooting

### PM2 Issues

**Process not starting:**
```bash
pm2 logs trreb-api --err  # Check error logs
pm2 describe trreb-api    # Check detailed status
```

**High memory usage:**
```bash
pm2 monit  # Monitor memory
# Adjust max_memory_restart in ecosystem.config.js
```

**Graceful shutdown not working:**
- Verify `kill_timeout` matches server shutdown timeout (30s)
- Check logs for shutdown messages

### Docker Issues

**Container not starting:**
```bash
docker logs trreb-api  # Check logs
docker ps -a           # Check all containers (including stopped)
```

**Health check failing:**
```bash
# Test health endpoint manually
docker exec trreb-api curl http://localhost:8080/health
```

**Port conflicts:**
```bash
# Change port in docker-compose.yml
ports:
  - "8081:8080"  # Host:Container
```

## 📚 Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)

## 🔗 Related Documentation

- `docs/CONTEXT_FOR_NEXT_CHAT.md` - Complete implementation context
- `docs/PRODUCTION_READINESS.md` - Production features documentation
- `docs/TESTING_GUIDE.md` - Testing instructions

