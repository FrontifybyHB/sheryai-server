import fs from 'fs';
import winston from 'winston';
import config from '../config/env.js';

const { createLogger, format, transports } = winston;

const redactedKeys = new Set([
  'authorization',
  'cookie',
  'password',
  'token',
  'apikey',
  'apiKey',
  'privateKey',
  'private_key',
  'firebaseServiceAccount',
  'fileBuffer',
  'buffer',
]);

function sanitize(value, depth = 0) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: config.isProduction() ? undefined : value.stack,
      details: sanitize(value.details, depth + 1),
    };
  }

  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 2000 ? `${value.slice(0, 2000)}...[truncated]` : value;
  if (typeof value !== 'object') return value;
  if (Buffer.isBuffer(value)) return `[buffer:${value.length}]`;
  if (depth >= 4) return '[max-depth]';

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitize(item, depth + 1));
  }

  return Object.entries(value).reduce((acc, [key, item]) => {
    const normalizedKey = key.toLowerCase();
    if ([...redactedKeys].some((secretKey) => normalizedKey.includes(secretKey.toLowerCase()))) {
      acc[key] = '[redacted]';
    } else {
      acc[key] = sanitize(item, depth + 1);
    }
    return acc;
  }, {});
}

const sanitizeMeta = format((info) => {
  const { level, message, timestamp, service, environment, ...meta } = info;
  return {
    level,
    message,
    timestamp,
    service,
    environment,
    ...(Object.keys(meta).length ? { meta: sanitize(meta) } : {}),
  };
});

const consoleFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  sanitizeMeta(),
  format.printf(({ timestamp, level, message, meta }) => {
    const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${suffix}`;
  }),
);

const fileFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  sanitizeMeta(),
  format.json(),
);

fs.mkdirSync('logs', { recursive: true });

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: {
    service: 'sheryai-backend',
    environment: config.nodeEnv,
  },
  transports: [
    new transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: fileFormat,
    }),
    new transports.File({
      filename: 'logs/combined.log',
      format: fileFormat,
    }),
    new transports.Console({
      format: config.isProduction() ? fileFormat : consoleFormat,
    }),
  ],
});

logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

export default logger;
