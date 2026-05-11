import dotenv from 'dotenv';

dotenv.config();

function splitCsv(value = '') {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

class EnvConfig {
  constructor(source = process.env) {
    this.nodeEnv = source.NODE_ENV || 'development';
    this.port = Number(source.PORT || 5001);
    this.frontendUrl = source.FRONTEND_URL || 'http://localhost:5173';
    this.allowVercelPreviews = source.ALLOW_VERCEL_PREVIEWS === 'true';
    this.firebaseServiceAccount = source.FIREBASE_SERVICE_ACCOUNT || '';
    this.firebaseStorageBucket = source.FIREBASE_STORAGE_BUCKET || '';
    this.assemblyAiApiKey = source.ASSEMBLYAI_API_KEY || '';
    this.nvidiaApiKey = source.NVIDIA_API_KEY || '';
    this.nvidiaModel = source.NVIDIA_MODEL || 'nvidia/nemotron-3-nano-30b-a3b';
    this.allowedOrigins = splitCsv(source.CORS_ORIGINS);

    if (this.frontendUrl && !this.allowedOrigins.includes(this.frontendUrl)) {
      this.allowedOrigins.push(this.frontendUrl);
    }

    if (!this.isProduction() && this.allowedOrigins.length === 0) {
      this.allowedOrigins = [
      this.frontendUrl,
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      ];
    }
  }

  isProduction() {
    return this.nodeEnv === 'production';
  }
}

const config = new EnvConfig();

export default config;
