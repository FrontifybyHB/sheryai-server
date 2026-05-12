import logger from '../loggers/logger.js';

const skipPaths = ['/api/health'];

function pickHeaders(headers = {}) {
  return {
    origin: headers.origin,
    referer: headers.referer,
    userAgent: headers['user-agent'],
    contentType: headers['content-type'],
  };
}

function summarizeBody(body = {}) {
  if (!body || typeof body !== 'object') return body;
  return Object.keys(body);
}

const requestLogger = (req, res, next) => {
  if (skipPaths.includes(req.path)) return next();

  const startedAt = process.hrtime.bigint();
  const requestMeta = {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    routePath: req.path,
    query: req.query,
    bodyKeys: summarizeBody(req.body),
    headers: pickHeaders(req.headers),
    user: {
      uid: req.user?.uid,
      role: req.user?.role,
    },
    ip: req.ip,
  };

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]('HTTP request', {
      ...requestMeta,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs),
      contentLength: res.getHeader('content-length'),
    });
  });

  next();
};

export default requestLogger;
