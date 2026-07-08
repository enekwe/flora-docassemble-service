# Flora DocAssemble Service - API Reference

## Base URL
- Local: `http://localhost:3013`
- Production: `https://flora-docassemble.railway.app` (or your deployment URL)

## Authentication
All endpoints (except `/health` and `/`) require JWT authentication.

**Header:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## Health & Information

### GET /health
Health check endpoint

**Response:**
```json
{
  "success": true,
  "service": "flora-docassemble-service",
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### GET /
Service information

**Response:**
```json
{
  "success": true,
  "service": "Flora DocAssemble Service",
  "version": "1.0.0",
  "description": "Document generation microservice using DocAssemble",
  "endpoints": {
    "health": "/health",
    "documents": "/api/documents",
    "templates": "/api/templates"
  }
}
```

---

## Document Endpoints

### POST /api/documents/generate
Generate a new document from template

**Request Body:**
```json
{
  "templateId": "template-uuid",
  "companyId": "company-123",
  "companyName": "Acme Inc.",
  "studioCompanyId": "studio-company-456",
  "title": "83(b) Election - John Doe",
  "documentType": "83B_ELECTION",
  "format": "PDF",
  "inputData": {
    "taxpayer": {
      "name": { "first": "John", "last": "Doe" },
      "ssn": "123-45-6789",
      "address": {
        "address": "123 Main St",
        "city": "San Francisco",
        "state": "CA",
        "zip": "94105"
      }
    },
    "company": {
      "name": "Acme Inc.",
      "address": { /* ... */ }
    },
    "grant_date": "2024-01-15",
    "shares_granted": 100000,
    "price_per_share": 0.01,
    "fmv_per_share": 1.00
  },
  "metadata": {
    "partyNames": ["John Doe", "Acme Inc."],
    "effectiveDate": "2024-01-15",
    "tags": ["equity", "83b"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "documentId": "doc-uuid-123",
    "templateId": "template-uuid",
    "companyId": "company-123",
    "title": "83(b) Election - John Doe",
    "documentType": "83B_ELECTION",
    "status": "COMPLETED",
    "s3Key": "documents/company-123/2024-01-15/doc-uuid-123.pdf",
    "downloadUrl": "https://s3.amazonaws.com/...",
    "fileSize": 245678,
    "format": "PDF",
    "generatedAt": "2024-01-15T10:30:00.000Z",
    "generatedBy": "user-id-789"
  }
}
```

### GET /api/documents/:documentId
Get document details

**Response:**
```json
{
  "success": true,
  "data": {
    "documentId": "doc-uuid-123",
    "templateId": "template-uuid",
    "templateName": "83(b) Election",
    "companyId": "company-123",
    "title": "83(b) Election - John Doe",
    "documentType": "83B_ELECTION",
    "status": "COMPLETED",
    "downloadUrl": "https://s3.amazonaws.com/...",
    "fileSize": 245678,
    "format": "PDF",
    "version": 1,
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### GET /api/documents/:documentId/download
Get document download URL

**Response:**
```json
{
  "success": true,
  "data": {
    "documentId": "doc-uuid-123",
    "downloadUrl": "https://s3.amazonaws.com/signed-url-here",
    "fileName": "83b_Election_John_Doe.pdf",
    "fileSize": 245678,
    "expiresIn": 3600
  }
}
```

### GET /api/documents/company/:companyId
List all documents for a company

**Query Parameters:**
- `documentType` - Filter by document type
- `status` - Filter by status (default: COMPLETED)
- `startDate` - Filter by start date
- `endDate` - Filter by end date
- `limit` - Number of results (default: 50)
- `skip` - Pagination offset

**Example:**
```
GET /api/documents/company/company-123?documentType=83B_ELECTION&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "documentId": "doc-uuid-123",
      "title": "83(b) Election - John Doe",
      "documentType": "83B_ELECTION",
      "status": "COMPLETED",
      "downloadUrl": "https://s3.amazonaws.com/...",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "count": 1
}
```

### DELETE /api/documents/:documentId
Delete a document

**Response:**
```json
{
  "success": true,
  "message": "Document deleted successfully"
}
```

### POST /api/documents/:documentId/version
Create a new version of a document

**Request Body:**
```json
{
  "companyId": "company-123",
  "companyName": "Acme Inc.",
  "title": "83(b) Election - John Doe (Revised)",
  "inputData": {
    // Updated document data
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "documentId": "doc-uuid-456",
    "version": 2,
    "previousVersionId": "doc-uuid-123",
    // ... rest of document data
  }
}
```

### GET /api/documents/stats/:companyId?
Get document statistics

**Optional Parameter:**
- `:companyId` - Get stats for specific company (omit for all companies)

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalDocuments": 150,
      "completedDocuments": 145,
      "failedDocuments": 5,
      "totalFileSize": 50000000,
      "avgFileSize": 333333
    },
    "typeBreakdown": [
      {
        "_id": "83B_ELECTION",
        "count": 50
      },
      {
        "_id": "OPERATING_AGREEMENT",
        "count": 30
      }
    ]
  }
}
```

---

## Template Endpoints

### GET /api/templates
List all templates

**Query Parameters:**
- `isActive` - Filter by active status (default: true)
- `documentType` - Filter by document type
- `category` - Filter by category
- `isCustom` - Filter by custom status

**Example:**
```
GET /api/templates?documentType=83B_ELECTION&isActive=true
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "templateId": "template-uuid-123",
      "name": "83(b) Election",
      "documentType": "83B_ELECTION",
      "description": "IRS Form 83(b) Election",
      "category": "EQUITY",
      "jurisdiction": ["US"],
      "outputFormats": ["PDF"],
      "isActive": true,
      "isCustom": false,
      "usageCount": 150,
      "lastUsedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "count": 1
}
```

### GET /api/templates/:templateId
Get template details

**Response:**
```json
{
  "success": true,
  "data": {
    "templateId": "template-uuid-123",
    "name": "83(b) Election",
    "documentType": "83B_ELECTION",
    "description": "IRS Form 83(b) Election",
    "yamlFilePath": "templates/83b-election.yml",
    "yamlContent": "--- YAML content here ---",
    "fields": [
      {
        "fieldName": "taxpayer_name",
        "fieldType": "text",
        "label": "Taxpayer Name",
        "required": true
      }
    ],
    "outputFormats": ["PDF"],
    "isActive": true,
    "usageCount": 150
  }
}
```

### GET /api/templates/type/:documentType
Get templates by document type

**Document Types:**
- `83B_ELECTION`
- `OPERATING_AGREEMENT`
- `EMPLOYMENT_AGREEMENT`
- `STOCK_PURCHASE_AGREEMENT`
- `CUSTOM`

**Example:**
```
GET /api/templates/type/83B_ELECTION
```

**Response:**
```json
{
  "success": true,
  "data": [
    // Array of templates with this type
  ],
  "count": 2
}
```

### POST /api/templates
Create a custom template

**Request Body:**
```json
{
  "name": "Custom NDA",
  "documentType": "CUSTOM",
  "description": "Non-Disclosure Agreement",
  "category": "COMPLIANCE",
  "jurisdiction": ["CA", "NY"],
  "yamlContent": "--- DocAssemble YAML content ---",
  "fields": [
    {
      "fieldName": "party1_name",
      "fieldType": "text",
      "label": "Party 1 Name",
      "required": true,
      "order": 1
    }
  ],
  "outputFormats": ["PDF", "DOCX"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "templateId": "custom-template-uuid",
    "name": "Custom NDA",
    "documentType": "CUSTOM",
    "isActive": true,
    "isCustom": true,
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### PUT /api/templates/:templateId
Update a template (custom templates only)

**Request Body:**
```json
{
  "name": "Updated Template Name",
  "description": "Updated description",
  "yamlContent": "--- Updated YAML ---",
  "isActive": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "templateId": "template-uuid",
    "name": "Updated Template Name",
    "version": 2,
    "updatedAt": "2024-01-15T11:00:00.000Z"
  }
}
```

### DELETE /api/templates/:templateId
Delete/deactivate a template (custom templates only)

**Response:**
```json
{
  "success": true,
  "message": "Template deactivated successfully"
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "templateId",
      "message": "Template ID is required"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": "No token provided"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Document not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Document generation failed: Connection timeout"
}
```

---

## Rate Limiting
Currently no rate limiting implemented. Consider adding in production.

## Pagination
Default limit: 50 documents
Maximum limit: 100 documents

---

## Example Usage with cURL

### Generate Document
```bash
curl -X POST http://localhost:3013/api/documents/generate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "template-uuid",
    "companyId": "company-123",
    "title": "Test Document",
    "documentType": "83B_ELECTION",
    "inputData": { ... }
  }'
```

### Get Document
```bash
curl -X GET http://localhost:3013/api/documents/doc-uuid-123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### List Templates
```bash
curl -X GET http://localhost:3013/api/templates \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Integration Client (Main App)

### Quick Start
```javascript
const docassembleClient = require('./services/integrations/docassembleClient');

// Set auth token
docassembleClient.setAuthToken(req.user.token);

// Generate 83(b) election
const doc = await docassembleClient.generate83bElection({
  templateId: 'template-id',
  companyId: 'company-123',
  companyName: 'Acme Inc.',
  inputData: { /* ... */ }
});

console.log('Document URL:', doc.data.downloadUrl);
```

### All Available Methods
```javascript
// Document operations
await docassembleClient.generateDocument(data);
await docassembleClient.getDocument(documentId);
await docassembleClient.getDocumentStatus(documentId);
await docassembleClient.downloadDocument(documentId);
await docassembleClient.listCompanyDocuments(companyId, filters);
await docassembleClient.deleteDocument(documentId);
await docassembleClient.createDocumentVersion(documentId, data);

// Template operations
await docassembleClient.listTemplates(filters);
await docassembleClient.getTemplate(templateId);
await docassembleClient.getTemplatesByType(documentType);
await docassembleClient.createTemplate(data);
await docassembleClient.updateTemplate(templateId, data);
await docassembleClient.deleteTemplate(templateId);

// Statistics
await docassembleClient.getStatistics(companyId);

// Health check
await docassembleClient.healthCheck();

// Convenience methods
await docassembleClient.generate83bElection(data);
await docassembleClient.generateOperatingAgreement(data);
await docassembleClient.generateEmploymentAgreement(data);
await docassembleClient.generateStockPurchaseAgreement(data);
```

---

**API Version:** 1.0.0
**Last Updated:** 2024
