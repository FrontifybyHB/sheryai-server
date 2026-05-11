import config from '../config/env.js';

class Logger {
  info(message, meta = {}) {
    this.write('info', message, meta);
  }

  warn(message, meta = {}) {
    this.write('warn', message, meta);
  }

  error(message, meta = {}) {
    this.write('error', message, meta);
  }

  write(level, message, meta = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(Object.keys(meta).length ? { meta } : {}),
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
