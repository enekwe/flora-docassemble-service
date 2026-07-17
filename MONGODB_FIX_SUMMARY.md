# Flora DocAssemble Service - MongoDB Fix Summary

**Date**: 2026-07-16
**Issue**: MongoDB Authentication Failure
**Service**: flora-docassemble-service
**Status**: ✅ Solution Ready - Awaiting Deployment

---

## Root Cause

**MongoDB Connection Failure**:
```
MongoServerError: Authentication failed.
Code: 18 (AuthenticationFailed)
```

**Why**:
- `MONGODB_URI` environment variable not set in Railway
- Service requires MongoDB connection to start (blocking operation)
- Server crashes immediately on startup → crash loop → healthcheck fails

**Breaking Change**:
- Commit `dc6f62f` (July 8, 2026) made MongoDB mandatory
- Before: MongoDB was optional/non-blocking
- After: Server cannot start without MongoDB connection

---

## Solution

### MongoDB Connection String (Provided by User)

```
mongodb://mongo:LegGfRDdPGDxZgqDGbqjFJWlWASmCGNB@metro.proxy.rlwy.net:59998/venturestudio
```

**Details**:
- Host: `metro.proxy.rlwy.net:59998` (Railway TCP Proxy)
- Database: `venturestudio` (shared across Flora services)
- User: `mongo`
- Password: `LegGfRDdPGDxZgqDGbqjFJWlWASmCGNB`

**Note**: Service expects database name `/flora-docassemble` by default, but will use `/venturestudio` from the connection string (shared database approach).

---

## How to Fix

### Option 1: Railway Dashboard (Recommended - Most Reliable)

1. Go to: https://railway.app/project/passbook-flora
2. Click on **flora-docassemble-service** service
3. Click **Variables** tab
4. Click **+ New Variable**
5. Set:
   - **Name**: `MONGODB_URI`
   - **Value**: `mongodb://mongo:LegGfRDdPGDxZgqDGbqjFJWlWASmCGNB@metro.proxy.rlwy.net:59998/venturestudio`
6. Click **Add**
7. Service will automatically redeploy

### Option 2: Railway CLI

```bash
# Navigate to service directory
cd /Users/cope/Passbook_Oracle/microservices/flora-docassemble-service

# Link to the service (interactive)
railway link
# Select: Passbook Flora → production → flora-docassemble-service

# Set the variable
railway variables --set MONGODB_URI="mongodb://mongo:LegGfRDdPGDxZgqDGbqjFJWlWASmCGNB@metro.proxy.rlwy.net:59998/venturestudio"

# Service will automatically redeploy
```

### Option 3: Bulk Variable Update

If you need to set multiple variables at once, create a `.env` file and use:

```bash
railway variables --set-from-env-file .env.production
```

---

## Expected Results

### Before Fix (Current State)

```
❌ MongoDB connection failed: Authentication failed
❌ Failed to start server: Authentication failed
❌ Process exits, Railway restarts (crash loop)
❌ Healthcheck fails - service unavailable
```

### After Fix (Expected)

```
✅ DocAssemble client initialized
✅ S3 configuration initialized
✅ MongoDB connected successfully
   └─ database: venturestudio
   └─ host: metro.proxy.rlwy.net
✅ Sync service started
✅ Flora DocAssemble Service running on port <PORT>
✅ Healthcheck passes - service healthy
```

---

## Verification Steps

### 1. Check Variable is Set

**Via Dashboard**:
- Go to service → Variables tab
- Verify `MONGODB_URI` is listed

**Via CLI**:
```bash
railway variables | grep MONGODB_URI
```

### 2. Monitor Deployment Logs

```bash
railway logs --service flora-docassemble-service

# Or follow live:
railway logs --follow
```

**Watch for**:
- ✅ "MongoDB connected successfully"
- ✅ "Sync service started"
- ✅ "Flora DocAssemble Service running on port"
- ❌ NO "Authentication failed" errors

### 3. Test Health Endpoint

```bash
curl https://flora-docassemble-service-production.up.railway.app/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2026-07-16T...",
  "mongodb": "connected",
  "docassemble": "connected"
}
```

### 4. Verify Service Status

**Railway Dashboard**:
- Service should show "Active" status
- Green indicator (not red/yellow)
- No crash loop

---

## Database Schema

The service uses these MongoDB collections in the `venturestudio` database:

- `interviews` - DocAssemble interview tracking
- `documents` - Document metadata
- `sessions` - User session data
- `syncjobs` - Background sync job tracking

All collections will be automatically created when the service starts.

---

## Troubleshooting

### If Service Still Crashes After Setting Variable

**1. Check MongoDB Connection String Format**:
```bash
# Should be exactly:
mongodb://mongo:LegGfRDdPGDxZgqDGbqjFJWlWASmCGNB@metro.proxy.rlwy.net:59998/venturestudio

# Common issues:
# - Missing 'mongodb://' prefix
# - Extra spaces
# - Wrong port (should be 59998)
# - Wrong host (should be metro.proxy.rlwy.net)
```

**2. Verify MongoDB Server is Running**:
```bash
# Check if MongoDB service is up on Railway
railway status | grep -i mongo
```

**3. Test Connection from Another Service**:
```bash
# If flora-mcp-server is working with same MongoDB, compare variables
railway variables --service flora-mcp-server | grep MONGODB_URI
railway variables --service flora-docassemble-service | grep MONGODB_URI
```

**4. Check for Other Missing Variables**:
```bash
# Verify all required variables are set
railway variables --service flora-docassemble-service

# Required variables:
# - MONGODB_URI ✓
# - DOCASSEMBLE_URL
# - DOCASSEMBLE_API_KEY
# - JWT_SECRET
# - AWS_ACCESS_KEY_ID
# - AWS_SECRET_ACCESS_KEY
```

### If Healthcheck Still Fails

**1. Check Healthcheck Configuration**:
```json
// railway.json
{
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100
  }
}
```

**2. Verify Health Endpoint Code**:
```javascript
// Should exist in routes
router.get('/health', async (req, res) => {
  // Returns health status
});
```

**3. Test Locally**:
```bash
# Set environment variables
export MONGODB_URI="mongodb://mongo:LegGfRDdPGDxZgqDGbqjFJWlWASmCGNB@metro.proxy.rlwy.net:59998/venturestudio"
export NODE_ENV=production

# Start service
npm start

# Test health endpoint
curl http://localhost:3013/health
```

---

## Related Services Using Same MongoDB

These Flora services also connect to the same MongoDB instance:

- **flora-mcp-server**: Uses `/venturestudio` database ✅ Working
- **flora-command-center**: Uses `/venturestudio` database
- **flora-docassemble-service**: Should use `/venturestudio` database ⏳ Pending fix

All services use Railway TCP Proxy: `metro.proxy.rlwy.net:59998`

---

## Timeline

| Date | Event |
|------|-------|
| July 8, 2026 | Commit `dc6f62f` - Added MongoDB sync feature |
| July 8, 2026 | First deployment attempt - Authentication failed |
| July 16, 2026 | Root cause identified - Missing MONGODB_URI |
| July 16, 2026 | Solution ready - Awaiting variable set in Railway |

---

## Next Steps

1. ✅ Set `MONGODB_URI` in Railway (use Option 1 or 2 above)
2. ⏳ Wait for automatic redeploy (~2-3 minutes)
3. ⏳ Verify logs show "MongoDB connected successfully"
4. ⏳ Confirm healthcheck passes
5. ⏳ Test service endpoints

---

## Contact

If issues persist after setting the variable:
- Check Railway dashboard for deployment errors
- Review full deployment logs
- Verify all environment variables are set correctly
- Ensure MongoDB service is running on Railway

**Status**: Ready to deploy - just needs MONGODB_URI variable set in Railway dashboard
