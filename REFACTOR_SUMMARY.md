# Flora DocAssemble Service - Self-Hosted Integration Refactor

## Overview

This service has been refactored to integrate with a self-hosted DocAssemble instance on Railway, replacing the previous cloud-based API integration. The refactor implements the design specification outlined in `/docs/superpowers/specs/2026-07-08-documenso-docassemble-self-hosting-design.md`.

## Changes Made

### 1. New MongoDB Model: `Interview.js`

**Location:** `/src/models/Interview.js`

**Purpose:** Track DocAssemble interview sessions with sync status for self-hosted integration

**Key Fields:**
- `interviewId` - Internal Flora interview ID (unique identifier)
- `externalInterviewId` - DocAssemble internal ID for the interview
- `title` - Interview title
- `status` - Interview status: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `ABANDONED`
- `syncStatus` - Sync tracking: `PENDING`, `SYNCED`, `FAILED`, `RETRY`
- `lastSyncAt` - Timestamp of last successful sync
- `syncErrors[]` - Array of sync error logs with retry counts
- `portfolioCompanyId` - Portfolio company association
- `createdBy` - User who created the interview
- `sessionId` - DocAssemble session ID
- `interviewUrl` - URL to access the interview in DocAssemble
- `inputData` - Input data for interview
- `generatedDocuments[]` - Array of documents generated from completed interview
- `completedAt` - Interview completion timestamp
- `completionData` - Interview completion results

**Indexes:**
- Compound indexes for efficient querying by company, status, and sync status
- Special indexes for sync retry queries: `(syncStatus, lastSyncAt)`, `(status, syncStatus)`

**Methods:**
- `markSynced(externalId)` - Mark interview as successfully synced
- `markSyncFailed(error, details)` - Record sync failure with exponential backoff
- `addGeneratedDocument(documentData)` - Add generated document reference
- `markCompleted(completionData)` - Mark interview as completed

**Static Methods:**
- `findFailedSyncs(limit)` - Find interviews with failed syncs for retry
- `findPendingSyncs(limit)` - Find interviews never synced

---

### 2. Enhanced DocAssemble Client: `docassembleClient.js`

**Location:** `/src/services/docassembleClient.js`

**Enhancements:**

#### Connection Pooling
- HTTP/HTTPS agents with `keepAlive` enabled
- Max sockets: 50, Max free sockets: 10
- Keep-alive timeout: 30 seconds

#### Request/Response Interceptors
- Request logging for debugging
- Enhanced error handling with detailed error context
- Automatic error classification (no response, server error, etc.)

#### New Method: `checkConnection()`
- Health check to verify DocAssemble server connectivity
- 5 second timeout
- Returns boolean for connection status

#### Enhanced Method: `generateDocument(templatePath, inputData, outputFormat, options)`
- Added `options` parameter for:
  - `callbackUrl` - Callback URL for async completion notification
  - `sessionId` - Continue existing session
- Returns enhanced result object with session ID and metadata
- Better error handling with HTTP status codes
- Support for different output formats (PDF, DOCX, HTML)

#### New Method: `createInterviewSession(templatePath, initialData, callbackUrl)`
- Create new interview session in DocAssemble
- Returns session ID and interview URL
- Supports callback URL for completion notification

#### Enhanced Method: `getSessionStatus(sessionId)`
- More detailed status information
- Returns completion status, progress, documents, metadata

#### New Method: `getSessionDocuments(sessionId)`
- Retrieve documents generated from completed session
- Returns array of documents with download URLs

**Backward Compatibility:**
- All existing methods preserved
- Existing API contracts maintained
- Default values ensure no breaking changes

---

### 3. Callback Controller: `callbackController.js`

**Location:** `/src/controllers/callbackController.js`

**Purpose:** Handle callbacks from self-hosted DocAssemble on interview completion

**Endpoints:**

#### POST `/api/callbacks/docassemble`
Handles interview completion callbacks from DocAssemble

**Expected Payload:**
```json
{
  "sessionId": "string",
  "status": "completed | failed",
  "interviewId": "string",
  "externalInterviewId": "string",
  "documents": [
    {
      "id": "string",
      "filename": "string",
      "format": "PDF | DOCX | HTML",
      "url": "string",
      "size": number
    }
  ],
  "completionData": {},
  "error": "string (optional)"
}
```

**Processing:**
1. Validates required fields (sessionId, status)
2. Finds interview by sessionId, interviewId, or externalInterviewId
3. For completed interviews:
   - Marks interview as completed
   - Stores document references in MongoDB
   - Optionally downloads and backs up documents to S3 (if `DOWNLOAD_DOCASSEMBLE_DOCS=true`)
   - Updates sync status to `SYNCED`
4. For failed interviews:
   - Marks interview as failed
   - Stores error details
5. Returns success response

#### POST `/api/callbacks/docassemble/status`
Handles interview status update callbacks (for progress tracking)

**Security:**
- `verifyCallbackSignature()` middleware for HMAC signature verification
- Uses `DOCASSEMBLE_CALLBACK_SECRET` environment variable
- Prevents replay attacks

**Methods:**
- `processCompletedInterview(interview, data)` - Process completed interview
- `downloadAndStoreDocument(documentUrl, interview, format)` - Download and backup to S3
- `getContentType(format)` - Get MIME type for document format

---

### 4. Sync Service: `syncService.js`

**Location:** `/src/services/syncService.js`

**Purpose:** Handle synchronization between MongoDB and DocAssemble with retry logic

**Features:**

#### Background Sync Job
- Runs periodically (default: 5 minutes)
- Processes failed syncs with exponential backoff
- Configurable via `SYNC_INTERVAL_MS` environment variable

#### Retry Logic with Exponential Backoff
Retry delays:
1. 1 minute
2. 5 minutes
3. 30 minutes
4. 2 hours
5. 24 hours

After 5 failures, marks as `RETRY` status and only retries once per day.

#### Methods:

**`startBackgroundSync(intervalMs)`**
- Start background sync job
- Runs immediately, then periodically
- Default interval: 5 minutes

**`stopBackgroundSync()`**
- Stop background sync job
- Called on graceful shutdown

**`processFailedSyncs()`**
- Find and process interviews with `FAILED` or `RETRY` sync status
- Respects exponential backoff delays
- Returns statistics: processed, retried, succeeded, failed, skipped

**`shouldRetrySync(interview, retryCount)`**
- Determines if interview should be retried based on exponential backoff
- Considers last sync time and retry count

**`retryInterviewSync(interview)`**
- Retry syncing specific interview
- Three scenarios:
  1. Interview completed in DocAssemble - fetch documents and mark complete
  2. Interview in progress - update status
  3. Interview never synced - create session

**`manualRetrySync(interviewId)`**
- Manually trigger sync retry for specific interview
- Used by admin endpoint for troubleshooting

**`processPendingSyncs(limit)`**
- Process interviews with `PENDING` sync status
- Creates DocAssemble sessions for new interviews

**`getSyncStatistics()`**
- Returns sync statistics:
  - Count by sync status (PENDING, SYNCED, FAILED, RETRY)
  - Failed syncs grouped by retry count
  - Service running status

**`getHealthStatus()`**
- Returns sync service health status

---

### 5. Updated Routes: `routes/index.js`

**Location:** `/src/routes/index.js`

**New Endpoints:**

#### Callback Endpoints

**POST `/api/callbacks/docassemble`**
- DocAssemble completion callback
- Updates interview status and stores documents

**POST `/api/callbacks/docassemble/status`**
- DocAssemble status update callback
- Updates interview progress

#### Sync Management Endpoints

**POST `/api/sync/retry/:interviewId`**
- Manually retry sync for specific interview
- Returns sync result

**POST `/api/sync/retry`**
- Retry all failed syncs
- Returns processing statistics

**POST `/api/sync/pending?limit=50`**
- Process pending syncs
- Query param: `limit` (default: 50)

**GET `/api/sync/stats`**
- Get sync statistics
- Returns sync status counts and service health

#### Enhanced Health Check

**GET `/health`**
- Now includes sync service status
- Returns sync statistics

---

### 6. Updated Server Startup: `server.js`

**Location:** `/src/server.js`

**Changes:**

#### Sync Service Startup
- Automatically starts sync service on server startup
- Respects `ENABLE_SYNC_SERVICE` environment variable (default: true)
- Configurable sync interval via `SYNC_INTERVAL_MS`

#### Graceful Shutdown
- Stops sync service on SIGTERM/SIGINT
- Prevents orphaned background jobs

#### Enhanced Logging
- Logs sync service status on startup
- Logs service base URL for callback configuration

---

### 7. Updated Environment Configuration

**Location:** `.env.example`

**New Variables:**

```bash
# DocAssemble Configuration (Self-Hosted)
DOCASSEMBLE_URL=https://docassemble-app-production.up.railway.app
DOCASSEMBLE_API_KEY=your_api_key_from_docassemble_admin

# Service Base URL (for callbacks)
SERVICE_BASE_URL=https://flora-docassemble-service-production.up.railway.app

# Callback Security (optional)
DOCASSEMBLE_CALLBACK_SECRET=your_callback_secret_here

# Sync Service Configuration
ENABLE_SYNC_SERVICE=true
SYNC_INTERVAL_MS=300000  # 5 minutes

# Document Download Configuration
DOWNLOAD_DOCASSEMBLE_DOCS=false

# Optional: Read-only PostgreSQL access
POSTGRES_READ_URL=postgresql://USER:PASSWORD@HOST:PORT/docassemble
```

---

## API Changes Summary

### Existing APIs - NO CHANGES
All existing API contracts remain unchanged:
- `POST /api/documents/generate` - Still works as before
- `GET /api/documents/:documentId` - Still works as before
- All template endpoints - Still work as before

### New APIs Added

#### Callbacks (for DocAssemble)
- `POST /api/callbacks/docassemble` - Interview completion callback
- `POST /api/callbacks/docassemble/status` - Status update callback

#### Sync Management (for administrators)
- `POST /api/sync/retry/:interviewId` - Retry specific interview
- `POST /api/sync/retry` - Retry all failed syncs
- `POST /api/sync/pending` - Process pending syncs
- `GET /api/sync/stats` - Get sync statistics

---

## Data Flow

### Interview Creation Flow
1. **Flora App** → Creates interview request
2. **flora-docassemble-service** → Creates `Interview` document in MongoDB (status: `PENDING`, syncStatus: `PENDING`)
3. **Sync Service** → Calls DocAssemble API to create session
4. **DocAssemble** → Returns session ID and interview URL
5. **flora-docassemble-service** → Updates MongoDB (status: `IN_PROGRESS`, syncStatus: `SYNCED`, stores sessionId and interviewUrl)

### Interview Completion Flow
1. **DocAssemble** → Interview completed by user
2. **DocAssemble** → Sends callback to `/api/callbacks/docassemble`
3. **Callback Handler** → Finds interview in MongoDB
4. **Callback Handler** → Stores generated document references
5. **Callback Handler** → Updates status (status: `COMPLETED`, syncStatus: `SYNCED`)

### Sync Failure Recovery Flow
1. **Sync Service** → Detects `FAILED` sync status
2. **Sync Service** → Checks if retry delay elapsed (exponential backoff)
3. **Sync Service** → Retries sync operation
4. On success → Updates syncStatus to `SYNCED`
5. On failure → Increments retry count, schedules next retry

---

## Testing Considerations

### Unit Tests Required
- Interview model methods (`markSynced`, `markSyncFailed`, etc.)
- Sync service retry logic
- Callback controller processing
- DocAssemble client methods

### Integration Tests Required
- End-to-end interview creation and completion
- Callback processing
- Sync retry with exponential backoff
- Failed sync recovery

### Manual Testing
1. Create interview and verify MongoDB entry
2. Check DocAssemble session created
3. Complete interview in DocAssemble UI
4. Verify callback updates MongoDB
5. Simulate API failure and verify retry logic

---

## Deployment Notes

### Environment Variables to Set in Railway

**Required:**
- `DOCASSEMBLE_URL` - URL to self-hosted DocAssemble instance
- `DOCASSEMBLE_API_KEY` - API key from DocAssemble admin panel
- `SERVICE_BASE_URL` - Public URL of this service (for callbacks)

**Optional:**
- `DOCASSEMBLE_CALLBACK_SECRET` - Secret for callback signature verification
- `ENABLE_SYNC_SERVICE` - Enable/disable sync service (default: true)
- `SYNC_INTERVAL_MS` - Sync interval in milliseconds (default: 300000)
- `DOWNLOAD_DOCASSEMBLE_DOCS` - Download documents to S3 (default: false)

### DocAssemble Configuration

In DocAssemble admin panel:
1. Generate API key
2. Configure callback URL: `https://flora-docassemble-service-production.up.railway.app/api/callbacks/docassemble`
3. Set callback secret (if using signature verification)

---

## Monitoring

### Key Metrics to Track
- Sync success rate (`GET /api/sync/stats`)
- Failed sync backlog size
- Callback processing time
- Interview completion rate

### Logs to Monitor
- Sync service startup/shutdown
- Callback receipt and processing
- Sync retry attempts
- API connection errors

### Alerting Recommendations
- Alert on sync failure rate > 5%
- Alert on failed sync backlog > 100
- Alert on callback processing errors
- Alert on DocAssemble connection failures

---

## Rollback Plan

If issues occur with self-hosted integration:

1. **Quick Rollback:**
   - Update `DOCASSEMBLE_URL` back to cloud URL
   - Disable sync service: `ENABLE_SYNC_SERVICE=false`
   - Redeploy service

2. **Data Safety:**
   - MongoDB data unaffected
   - No data loss as all sync status tracked
   - Can replay failed syncs after fixing issues

---

## Success Criteria

- ✅ Interview model created with sync tracking
- ✅ DocAssemble client enhanced with connection pooling and session management
- ✅ Callback controller handles interview completion
- ✅ Sync service implements retry logic with exponential backoff
- ✅ Routes updated with callback and sync endpoints
- ✅ Background sync job runs automatically
- ✅ Existing API contracts preserved
- ✅ Environment configuration documented

---

## Next Steps

1. **Deploy to Railway:**
   - Set environment variables
   - Deploy refactored code
   - Verify sync service starts

2. **Configure DocAssemble:**
   - Generate API key
   - Set callback URL
   - Test callback delivery

3. **Test End-to-End:**
   - Create test interview
   - Complete in DocAssemble
   - Verify callback processing
   - Check MongoDB updates

4. **Monitor:**
   - Check sync statistics
   - Monitor logs for errors
   - Verify retry logic working

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Flora Main Application                    │
│                      (MongoDB)                               │
└────────────────────┬───────────────────────────┬─────────────┘
                     │                           │
                     ▼                           ▼
┌─────────────────────────────┐   ┌─────────────────────────────┐
│ flora-docassemble-service   │   │                             │
│ (Node.js Integration Layer) │   │   Other Flora Services      │
│                             │   │                             │
│ - Interview model (MongoDB) │   │                             │
│ - Sync service (retry logic)│   │                             │
│ - Callback handler          │   │                             │
└───────────┬─────────────────┘   └─────────────────────────────┘
            │
            │ HTTP API Calls
            ▼
┌─────────────────────────────┐
│ docassemble-app             │
│ (Self-Hosted on Railway)    │
│ - Python/Flask              │
│ - PostgreSQL                │
│ - Redis                     │
└───────────┬─────────────────┘
            │
            │ Callbacks
            ▼
┌─────────────────────────────┐
│ /api/callbacks/docassemble  │
│ (Webhook endpoint)          │
└─────────────────────────────┘
```

---

## Files Modified

1. ✅ `/src/models/Interview.js` - **CREATED**
2. ✅ `/src/services/docassembleClient.js` - **UPDATED**
3. ✅ `/src/controllers/callbackController.js` - **CREATED**
4. ✅ `/src/services/syncService.js` - **CREATED**
5. ✅ `/src/routes/index.js` - **UPDATED**
6. ✅ `/src/server.js` - **UPDATED**
7. ✅ `.env.example` - **UPDATED**

## Files NOT Modified
- ❌ `package.json` - No dependency changes
- ❌ Existing controllers - No breaking changes
- ❌ Existing models (Document, Template) - No modifications
- ❌ Existing services - No breaking changes

---

**Refactor completed successfully!**
All requirements from the design spec have been implemented.
