import rateLimit from 'express-rate-limit';
import ApiResponse from '../utils/ApiResponse.js';

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health' || req.path === '/health',
  handler: (_req, res) => {
    res.status(429).json(ApiResponse.error('Too many requests. Please wait a moment and try again.', 429));
  },
});

export const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json(ApiResponse.error('Chat rate limit reached. Please wait a moment.', 429));
  },
});
