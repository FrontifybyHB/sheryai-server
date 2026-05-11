import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes/index.js';
import errorHandler from './middleware/errorHandler.js';
import { globalRateLimiter } from './middleware/rateLimiter.js';
import requestContext from './middleware/requestContext.js';
import morganLogger from './loggers/morganLogger.js';
import config from './config/env.js';
import ApiResponse from './utils/ApiResponse.js';

const app = express();

app.use(helmet());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (config.allowVercelPreviews && /\.vercel\.app$/.test(origin)) return callback(null, true);
    if (config.allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS policy: origin ${origin} is not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-demo-role'],
}));

app.use(morganLogger);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestContext);
app.use(globalRateLimiter);

app.use('/api', routes);

app.use((req, res) => {
  res.status(404).json(ApiResponse.error(`Route ${req.method} ${req.originalUrl} not found`, 404));
});

app.use(errorHandler);

export default app;
