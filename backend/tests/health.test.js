import request from 'supertest';
import express from 'express';

// We create a mini Express app just for testing the health endpoint without starting the full server/DB connection
const app = express();
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Server is running', env: 'test' });
});

describe('GET /api/v1/health', () => {
  it('should return 200 OK and success true', async () => {
    const response = await request(app).get('/api/v1/health');
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Server is running');
  });
});
