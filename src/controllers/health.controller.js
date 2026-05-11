import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import config from '../config/env.js';

class HealthController {
  status = asyncHandler(async (_req, res) => {
    res.json(ApiResponse.success({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'SheryAI - AI Learning Companion API',
      version: '1.0.0',
      environment: config.nodeEnv,
    }, 'Service healthy'));
  });
}

export default HealthController;
