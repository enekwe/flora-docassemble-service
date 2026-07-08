# Flora DocAssemble Service

Document generation microservice for Flora's company formation workflow using DocAssemble.

## Overview

The Flora DocAssemble Service is a dedicated microservice that handles automated document generation for legal and business documents. It integrates with the open-source DocAssemble platform for template-based document assembly and stores generated documents in Flora's S3 bucket.

## Features

- **Real DocAssemble Integration**: Direct integration with DocAssemble REST API
- **S3 Storage**: All generated documents stored in Flora's S3 bucket with signed URLs
- **4 Pre-built Templates**: 83(b) Election, Operating Agreement, Employment Agreement, Stock Purchase Agreement
- **Custom Templates**: Support for creating and managing custom YAML templates
- **Document Versioning**: Track multiple versions of generated documents
- **RESTful API**: Complete REST API with 10 endpoints
- **JWT Authentication**: Secure API access with JWT tokens
- **MongoDB Persistence**: Store document metadata and generation history

## Architecture

```
flora-docassemble-service/
├── src/
│   ├── server.js                    # Express server entry point
│   ├── config/
│   │   ├── database.js              # MongoDB connection
│   │   ├── logger.js                # Winston logger
│   │   └── s3.js                    # AWS S3 configuration
│   ├── models/
│   │   ├── Document.js              # Document metadata model
│   │   └── Template.js              # Template configuration model
│   ├── services/
│   │   ├── docassembleClient.js     # DocAssemble API client
│   │   ├── documentGenerationService.js # Business logic
│   │   └── s3Service.js             # S3 upload/download
│   ├── controllers/
│   │   ├── documentController.js    # Document endpoints
│   │   └── templateController.js    # Template endpoints
│   ├── routes/
│   │   ├── index.js                 # Route aggregator
│   │   ├── documentRoutes.js        # Document routes
│   │   └── templateRoutes.js        # Template routes
│   ├── middleware/
│   │   ├── auth.js                  # JWT authentication
│   │   ├── validation.js            # Request validation
│   │   └── errorHandler.js          # Global error handling
│   └── utils/
│       └── helpers.js               # Utility functions
├── templates/                       # DocAssemble YAML templates
│   ├── 83b-election.yml
│   ├── operating-agreement.yml
│   ├── employment-agreement.yml
│   └── stock-purchase-agreement.yml
├── tests/
│   └── integration.test.js          # Integration tests
├── package.json
├── Dockerfile
├── railway.json
└── README.md
```

## Installation

### Prerequisites

- Node.js >= 18.0.0
- MongoDB
- AWS S3 bucket (Flora's existing bucket)
- DocAssemble instance with API access

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your credentials:
   ```env
   NODE_ENV=development
   PORT=3013
   MONGODB_URI=mongodb://localhost:27017/flora-docassemble

   # DocAssemble Configuration
   DOCASSEMBLE_URL=https://docassemble.org
   DOCASSEMBLE_API_KEY=your_api_key_here

   # AWS S3 Configuration (Flora's bucket)
   AWS_ACCESS_KEY_ID=your_aws_access_key
   AWS_SECRET_ACCESS_KEY=your_aws_secret_key
   AWS_REGION=us-east-1
   S3_BUCKET_NAME=flora-documents

   # JWT Authentication
   JWT_SECRET=your_jwt_secret_here
   ```

3. **Start the service:**
   ```bash
   # Development mode with auto-reload
   npm run dev

   # Production mode
   npm start
   ```

4. **Run tests:**
   ```bash
   npm test
   ```

## API Endpoints

### Health & Info

- `GET /health` - Health check
- `GET /` - Service information

### Documents

- `POST /api/documents/generate` - Generate new document
- `GET /api/documents/:documentId` - Get document details
- `GET /api/documents/:documentId/download` - Get download URL
- `GET /api/documents/company/:companyId` - List company documents
- `DELETE /api/documents/:documentId` - Delete document
- `POST /api/documents/:documentId/version` - Create new version
- `GET /api/documents/stats/:companyId?` - Get statistics

### Templates

- `GET /api/templates` - List all templates
- `GET /api/templates/:templateId` - Get template details
- `GET /api/templates/type/:documentType` - Get templates by type
- `POST /api/templates` - Create custom template
- `PUT /api/templates/:templateId` - Update template
- `DELETE /api/templates/:templateId` - Delete template

## Usage Examples

### Generate 83(b) Election

```javascript
const axios = require('axios');

const response = await axios.post('http://localhost:3013/api/documents/generate', {
  templateId: '83b-election-template-id',
  companyId: 'company-123',
  companyName: 'Acme Inc.',
  title: '83(b) Election - John Doe',
  documentType: '83B_ELECTION',
  inputData: {
    taxpayer: {
      name: { first: 'John', last: 'Doe' },
      ssn: '123-45-6789',
      address: {
        address: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        zip: '94105'
      }
    },
    company: {
      name: 'Acme Inc.',
      address: { /* ... */ }
    },
    grant_date: '2024-01-15',
    shares_granted: 100000,
    price_per_share: 0.01,
    fmv_per_share: 1.00
  },
  format: 'PDF'
}, {
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  }
});

console.log('Document ID:', response.data.data.documentId);
console.log('Download URL:', response.data.data.downloadUrl);
```

### Using the Integration Client (Main App)

```javascript
const docassembleClient = require('./services/integrations/docassembleClient');

// Set auth token
docassembleClient.setAuthToken(userJwtToken);

// Generate 83(b) election
const document = await docassembleClient.generate83bElection({
  templateId: '83b-election-template-id',
  companyId: 'company-123',
  companyName: 'Acme Inc.',
  inputData: { /* ... */ }
});

// Get document status
const status = await docassembleClient.getDocumentStatus(document.data.documentId);

// Download document
const download = await docassembleClient.downloadDocument(document.data.documentId);
console.log('Download URL:', download.data.downloadUrl);
```

## Document Types

### 1. 83(b) Election
IRS Form 83(b) Election for stock grant taxation

**Required Fields:**
- Taxpayer information (name, SSN, address)
- Company information
- Grant date
- Number of shares
- Price per share
- Fair market value per share

### 2. Operating Agreement
LLC Operating Agreement

**Required Fields:**
- Company information
- Members list with ownership percentages
- Management structure
- Capital contributions
- Profit distribution method

### 3. Employment Agreement
Comprehensive employment contract

**Required Fields:**
- Employee information
- Employer information
- Job title and compensation
- Benefits
- Equity compensation (optional)
- Termination provisions

### 4. Stock Purchase Agreement
Stock purchase contract with vesting

**Required Fields:**
- Purchaser information
- Company information
- Number of shares
- Price per share
- Vesting schedule (optional)
- Transfer restrictions

## S3 Storage

All generated documents are stored in Flora's S3 bucket with the following structure:

```
flora-documents/
└── documents/
    └── {companyId}/
        └── {date}/
            └── {documentId}.pdf
```

**Features:**
- Server-side encryption (AES256)
- Signed URLs for secure access
- 1-hour expiry on download URLs (configurable)
- Automatic metadata tracking

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | development | Environment (development/production) |
| `PORT` | No | 3013 | Server port |
| `MONGODB_URI` | Yes | - | MongoDB connection string |
| `DOCASSEMBLE_URL` | Yes | - | DocAssemble server URL |
| `DOCASSEMBLE_API_KEY` | Yes | - | DocAssemble API key |
| `AWS_ACCESS_KEY_ID` | Yes | - | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | Yes | - | AWS secret key |
| `AWS_REGION` | No | us-east-1 | AWS region |
| `S3_BUCKET_NAME` | No | flora-documents | S3 bucket name |
| `JWT_SECRET` | Yes | - | JWT signing secret |
| `SIGNED_URL_EXPIRY` | No | 3600 | S3 signed URL expiry (seconds) |

## Deployment

### Railway Deployment

The service is configured for Railway deployment:

1. **Connect to Railway:**
   ```bash
   railway login
   ```

2. **Create new service:**
   ```bash
   railway init
   ```

3. **Set environment variables:**
   ```bash
   railway variables set MONGODB_URI=your_mongodb_uri
   railway variables set DOCASSEMBLE_API_KEY=your_api_key
   # ... set all required variables
   ```

4. **Deploy:**
   ```bash
   railway up
   ```

### Docker Deployment

```bash
# Build image
docker build -t flora-docassemble-service .

# Run container
docker run -p 3013:3013 \
  -e MONGODB_URI=your_mongodb_uri \
  -e DOCASSEMBLE_API_KEY=your_api_key \
  -e AWS_ACCESS_KEY_ID=your_aws_key \
  -e AWS_SECRET_ACCESS_KEY=your_aws_secret \
  flora-docassemble-service
```

## Integration with Main App

Add to main app's environment variables:

```env
DOCASSEMBLE_SERVICE_URL=http://localhost:3013
# Or in production:
DOCASSEMBLE_SERVICE_URL=https://flora-docassemble.railway.app
```

Use the integration client:

```javascript
const docassembleClient = require('./services/integrations/docassembleClient');

// In your route handlers
router.post('/companies/:companyId/documents/83b', async (req, res) => {
  docassembleClient.setAuthToken(req.user.token);

  const document = await docassembleClient.generate83bElection({
    companyId: req.params.companyId,
    companyName: req.company.name,
    templateId: '83b-election-template-id',
    inputData: req.body
  });

  res.json(document);
});
```

## Error Handling

The service includes comprehensive error handling:

- **400 Bad Request**: Validation errors
- **401 Unauthorized**: Missing or invalid JWT token
- **404 Not Found**: Document or template not found
- **409 Conflict**: Duplicate document/template ID
- **500 Internal Server Error**: Server or DocAssemble errors

Error response format:
```json
{
  "success": false,
  "error": "Error message",
  "details": [] // Validation errors if applicable
}
```

## Logging

Winston logger with different levels:

- **error**: Errors and exceptions
- **warn**: Warnings
- **info**: General information (default)
- **debug**: Detailed debugging (development only)

Logs are written to:
- Console (all environments)
- `logs/error.log` (production)
- `logs/combined.log` (production)

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode
npm test -- --watch
```

## Contributing

1. Follow the existing code structure
2. Add tests for new features
3. Update documentation
4. Use meaningful commit messages

## License

MIT

## Support

For issues or questions:
- Create an issue in the repository
- Contact the Flora development team

---

**Version:** 1.0.0
**Last Updated:** 2024
**Maintainer:** Flora Platform Team
