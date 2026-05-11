import app from './src/app.js';
import config from './src/config/env.js';
import { initializeFirebase } from './src/config/firebase.js';
import logger from './src/loggers/logger.js';

process.on('uncaughtException', (err) => {
  logger.error(`uncaughtException: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { reason });
  process.exit(1);
});

initializeFirebase();

const server = app.listen(config.port, () => {
  logger.info(`SheryAI Backend running on port ${config.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`Health check: http://localhost:${config.port}/api/health`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${config.port} is already in use`);
  } else {
    logger.error(`Server error: ${err.message}`);
  }
  process.exit(1);
});
