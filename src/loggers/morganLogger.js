import morgan from 'morgan';
import logger from './logger.js';
import config from '../config/env.js';

const format = config.isProduction() ? 'combined' : 'dev';
const morganLogger = morgan(format, { stream: logger.stream });

export default morganLogger;
