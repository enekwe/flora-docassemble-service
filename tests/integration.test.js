const request = require('supertest');
const mongoose = require('mongoose');

// Mock app for testing
let app;

describe('Flora DocAssemble Service Integration Tests', () => {
  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/flora-docassemble-test';
    process.env.JWT_SECRET = 'test-secret';

    // Import app after env vars are set
    app = require('../src/server');

    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
  });

  afterAll(async () => {
    // Clean up and close connections
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const res = await request(app).get('/health');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('healthy');
    });
  });

  describe('Root Endpoint', () => {
    it('should return service information', async () => {
      const res = await request(app).get('/');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.service).toBe('Flora DocAssemble Service');
    });
  });

  describe('Authentication', () => {
    it('should reject requests without token', async () => {
      const res = await request(app).get('/api/templates');

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Templates API', () => {
    let authToken;

    beforeAll(() => {
      // Generate test JWT token
      const jwt = require('jsonwebtoken');
      authToken = jwt.sign(
        { id: 'test-user-id', email: 'test@example.com' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
    });

    it('should list templates with authentication', async () => {
      const res = await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('Document Generation', () => {
    let authToken;

    beforeAll(() => {
      const jwt = require('jsonwebtoken');
      authToken = jwt.sign(
        { id: 'test-user-id', email: 'test@example.com' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/documents/generate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required fields
          title: 'Test Document'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for invalid routes', async () => {
      const res = await request(app).get('/api/invalid-route');

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Endpoint not found');
    });
  });
});
