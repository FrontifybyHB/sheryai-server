import ApiResponse from '../utils/ApiResponse.js';
import config from '../config/env.js';
import logger from '../loggers/logger.js';

const errorHandler = (err, req, res, _next) => {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  logger.error(message, {
    requestId: req.requestId,
    statusCode,
    method: req.method,
    path: req.originalUrl,
    query: req.query,
    user: {
      uid: req.user?.uid,
      role: req.user?.role,
    },
    stack: config.isProduction() ? undefined : err.stack,
    details: err.details,
  });

  const response = ApiResponse.error(
    config.isProduction() && statusCode >= 500 ? 'Internal Server Error' : message,
    statusCode,
  );

  if (!config.isProduction() && err.stack) response.stack = err.stack;
  if (err.details) response.details = err.details;

  res.status(statusCode).json(response);
};

export default errorHandler;
