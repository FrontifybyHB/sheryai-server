import config from '../config/env.js';

class Logger {
  constructor() {
    this.redactedKeys = new Set([
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
  }

  info(message, meta = {}) {
    this.write('info', message, meta);
  }

  warn(message, meta = {}) {
    this.write('warn', message, meta);
  }

  error(message, meta = {}) {
    this.write('error', message, meta);
  }

  sanitize(value, depth = 0) {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: config.isProduction() ? undefined : value.stack,
      };
    }

    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return value.length > 2000 ? `${value.slice(0, 2000)}...[truncated]` : value;
    if (typeof value !== 'object') return value;
    if (Buffer.isBuffer(value)) return `[buffer:${value.length}]`;
    if (depth >= 4) return '[max-depth]';

    if (Array.isArray(value)) {
      return value.slice(0, 25).map((item) => this.sanitize(item, depth + 1));
    }

    return Object.entries(value).reduce((acc, [key, item]) => {
      const normalizedKey = key.toLowerCase();
      if ([...this.redactedKeys].some((secretKey) => normalizedKey.includes(secretKey.toLowerCase()))) {
        acc[key] = '[redacted]';
      } else {
        acc[key] = this.sanitize(item, depth + 1);
      }
      return acc;
    }, {});
  }

  write(level, message, meta = {}) {
    const safeMeta = this.sanitize(meta) || {};
    const hasMeta = safeMeta && typeof safeMeta === 'object' && Object.keys(safeMeta).length;
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: 'sheryai-backend',
      environment: config.nodeEnv,
      ...(hasMeta ? { meta: safeMeta } : {}),
    };

    const line = config.isProduction()
      ? JSON.stringify(payload)
      : `[${payload.timestamp}] ${level.toUpperCase()}: ${message}${Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''}`;

    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }

  get stream() {
    return {
      write: (message) => this.info(message.trim()),
    };
  }
}

const logger = new Logger();

export default logger;
