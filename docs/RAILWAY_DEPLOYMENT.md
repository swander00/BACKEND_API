# Railway Deployment Guide

Complete guide for deploying TRREB API Backend to Railway.

## 📋 Prerequisites

- Railway account (sign up at [railway.app](https://railway.app))
- Railway CLI installed (optional but recommended): `npm i -g @railway/cli`
- Git repository (GitHub recommended)
- Environment variables prepared

## 🚀 Quick Start

### Option 1: Deploy via Railway Dashboard (Recommended for first deployment)

1. **Create New Project:**
   - Go to [railway.app](https://railway.app)
   - Click "New Project"
   - Select "Deploy from GitHub repo" (or "Empty Project" for manual deployment)

2. **Connect Repository:**
   - If deploying from GitHub, select your repository
   - Railway will auto-detect Node.js project

3. **Configure Environment Variables:**
   - Go to your project → Variables tab
   - Add all required environment variables (see below)

4. **Deploy:**
   - Railway will automatically deploy on every push to main branch
   - Or click "Deploy" button to trigger manual deployment

5. **Get Public URL:**
   - Railway generates a public URL automatically
   - Go to Settings → Domains to configure custom domain

### Option 2: Deploy via Railway CLI

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project (creates railway.json)
railway init

# Link to existing project (if already created)
railway link

# Set environment variables (see below for required vars)
railway variables set NODE_ENV=production
railway variables set PORT=8080
# ... set all other variables

# Deploy
railway up
```

## 🔧 Required Environment Variables

Add these in Railway Dashboard → Variables or via CLI:

### Essential Variables

```bash
NODE_ENV=production
PORT=8080
TZ=America/Toronto

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# Admin Token (generate secure random token)
ADMIN_TOKEN=your-secure-random-token
# Generate with: openssl rand -hex 32

# CORS Origins (comma-separated, no spaces)
ALLOWED_ORIGINS=https://your-frontend-url.com,https://www.your-frontend-url.com

# Database (for MV refresh script)
DATABASE_URL=postgres://user:password@host:5432/dbname

# Rate Limiting (optional, defaults shown)
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120

# Logging (optional, defaults shown)
LOG_LEVEL=info
```

### Optional Variables

```bash
# Disable auto-sync on startup (recommended for production)
RUN_SYNC_ON_START=false

# MV Auto-refresh interval (optional)
REFRESH_MVS_INTERVAL_MS=3600000  # 1 hour in milliseconds

# API Base URL (for cache-bust endpoint)
API_BASE_URL=https://your-railway-app.railway.app

# Sync Configuration (if using sync features)
BATCH_SIZE_PROPERTY=100
BATCH_SIZE_CHILD=50
MEDIA_PROPERTY_BATCH_SIZE=20
```

## 📁 Railway Configuration Files

### railway.json (Auto-generated, optional customization)

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install --production"
  },
  "deploy": {
    "startCommand": "node index.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### nixpacks.toml (Optional - for custom build)

If you need custom build configuration:

```toml
[phases.setup]
nixPkgs = ['nodejs-20_x']

[phases.install]
cmds = ['npm ci --production']

[start]
cmd = 'node index.js'
```

### Dockerfile (Alternative - if using Docker deployment)

Railway also supports Docker deployments. If you want to use our Dockerfile:

1. Ensure `Dockerfile` exists in project root
2. Railway will auto-detect and use it
3. No additional configuration needed

## 🚀 Deployment Steps

### Step 1: Prepare Your Code

1. **Ensure all files are committed:**
   ```bash
   git add .
   git commit -m "Ready for Railway deployment"
   git push origin main
   ```

2. **Verify environment variables are set** (don't commit them!)

3. **Test locally first:**
   ```bash
   npm run test:smoke
   npm run test:production
   ```

### Step 2: Deploy to Railway

**Via Dashboard:**
1. Create new project or select existing
2. Connect GitHub repository
3. Railway auto-detects Node.js and deploys
4. Add environment variables in Variables tab
5. Redeploy if variables were added after first deploy

**Via CLI:**
```bash
railway up
```

### Step 3: Verify Deployment

1. **Check deployment logs:**
   - Railway Dashboard → Deployments → View logs
   - Or: `railway logs`

2. **Test health endpoint:**
   ```bash
   curl https://your-app.railway.app/health
   ```

3. **Test metrics endpoint:**
   ```bash
   curl https://your-app.railway.app/metrics
   ```

4. **Run smoke tests against deployed URL:**
   ```bash
   API_BASE_URL=https://your-app.railway.app npm run test:smoke
   ```

## 🔍 Monitoring & Logs

### View Logs

**Via Dashboard:**
- Go to your service → Logs tab
- Real-time log streaming
- Search and filter logs

**Via CLI:**
```bash
# Stream logs
railway logs

# View last 100 lines
railway logs --tail 100
```

### Health Checks

Railway automatically monitors your service. The `/health` endpoint is perfect for this:

- **Health Check URL:** `https://your-app.railway.app/health`
- Railway can configure automatic health checks (check Railway settings)

### Metrics Endpoint

Access Prometheus metrics:
```bash
curl https://your-app.railway.app/metrics
```

Use these metrics with monitoring tools like:
- Grafana Cloud
- Prometheus
- Datadog

## 🌐 Custom Domain Setup

1. **In Railway Dashboard:**
   - Go to Settings → Domains
   - Click "Generate Domain" or "Add Custom Domain"
   - Follow instructions to configure DNS

2. **DNS Configuration:**
   - Add CNAME record pointing to Railway's domain
   - Railway will auto-configure SSL/TLS

## ⚙️ Railway-Specific Configuration

### Resource Limits

Railway automatically manages resources, but you can monitor:
- CPU usage in dashboard
- Memory usage in dashboard
- Bandwidth usage

### Environment Variables Management

**Best Practices:**
- Use Railway's Variables tab for secrets
- Don't commit `.env` files
- Use different variables for staging/production
- Reference variables: `${{VARIABLE_NAME}}` (advanced)

### Auto-Deploy Settings

**Configure in Railway Dashboard → Settings:**
- Auto-deploy on push to main branch
- Deploy previews for pull requests (optional)
- Manual deployments

## 🔄 Continuous Deployment

### GitHub Integration

1. **Connect Repository:**
   - Railway → New Project → Deploy from GitHub
   - Authorize Railway to access your repo

2. **Auto-Deploy:**
   - Pushes to `main` branch auto-deploy
   - Check Railway settings to configure branches

3. **Deploy Previews:**
   - Enable in Railway settings
   - Creates preview deployments for PRs

### Deployment Hooks

Railway supports webhooks for deployment events:
- Go to Settings → Webhooks
- Configure notifications (Slack, Discord, etc.)

## 🐛 Troubleshooting

### Deployment Fails

**Check:**
1. Build logs for errors
2. Environment variables are set correctly
3. Dependencies install correctly (`npm ci --production`)
4. Port is set correctly (Railway uses `PORT` env var)

### App Not Starting

**Check:**
1. Runtime logs for errors
2. Health endpoint: `curl https://your-app.railway.app/health`
3. Environment variables are set
4. Database connectivity (if using database)

### Database Connection Issues

**Check:**
1. `SUPABASE_URL` and keys are correct
2. Network access (Supabase allows Railway IPs by default)
3. Database health check: `/health` endpoint includes DB check

### High Memory Usage

**Monitor:**
1. Railway Dashboard → Metrics
2. `/metrics` endpoint shows memory stats
3. Adjust resource limits if needed

## 📊 Post-Deployment Checklist

- [ ] Health endpoint returns 200: `/health`
- [ ] Database connectivity check passes
- [ ] Metrics endpoint accessible: `/metrics`
- [ ] API endpoints working: `/api/properties`, `/api/search`
- [ ] CORS configured correctly
- [ ] Environment variables set
- [ ] Logs streaming correctly
- [ ] Custom domain configured (if needed)
- [ ] Smoke tests pass against deployed URL
- [ ] Graceful shutdown works (test during redeploy)

## 🔐 Security Checklist

- [ ] `NODE_ENV=production` set
- [ ] `ADMIN_TOKEN` is strong random value
- [ ] `ALLOWED_ORIGINS` configured with production URLs
- [ ] Supabase keys are production keys
- [ ] No sensitive data in logs
- [ ] Rate limiting enabled (default: 120 req/min)
- [ ] Security headers enabled (default: enabled)

## 🚀 Railway CLI Commands Reference

```bash
# Login
railway login

# Initialize project
railway init

# Link to existing project
railway link

# Deploy
railway up

# View logs
railway logs

# Open in browser
railway open

# Set environment variable
railway variables set KEY=value

# Get environment variable
railway variables get KEY

# List all variables
railway variables

# Run command in Railway environment
railway run npm run test:smoke

# View service info
railway status
```

## 📚 Additional Resources

- [Railway Documentation](https://docs.railway.app/)
- [Railway CLI Documentation](https://docs.railway.app/develop/cli)
- [Node.js on Railway](https://docs.railway.app/guides/nodejs)
- [Environment Variables Guide](https://docs.railway.app/develop/variables)

## 🔗 Related Documentation

- `docs/DEPLOYMENT.md` - General deployment guide (PM2, Docker)
- `docs/CONTEXT_FOR_NEXT_CHAT.md` - Complete implementation context
- `docs/PRODUCTION_READINESS.md` - Production features

## 💡 Pro Tips

1. **Use Railway Environments:**
   - Create separate environments for staging/production
   - Different variables per environment

2. **Monitor Resource Usage:**
   - Railway Dashboard shows CPU/Memory usage
   - Use `/metrics` endpoint for detailed metrics

3. **Set Up Alerts:**
   - Configure webhooks for deployment failures
   - Monitor `/health` endpoint externally

4. **Optimize Build Time:**
   - Use `.railwayignore` to exclude files from deployment
   - Similar to `.gitignore`

5. **Preview Deployments:**
   - Enable deploy previews for PRs
   - Test changes before merging

---

**Ready to deploy?** Follow the Quick Start section above, and your API will be live on Railway in minutes! 🚀

