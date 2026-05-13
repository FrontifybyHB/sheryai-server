import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { Storage } from '@google-cloud/storage';
import config from '../config/env.js';
import AppError from '../utils/AppError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class VideoStorageService {
  constructor() {
    this.uploadsDir = path.join(__dirname, '../../uploads/videos');
    this.gcsClient = null;
  }

  ensureUploadDir() {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  extensionFromMime(fileMime) {
    const extensions = {
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
      'video/x-msvideo': 'avi',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/mp4': 'm4a',
    };

    return extensions[fileMime] || 'mp4';
  }

  extensionFromFileName(fileName, fileMime = '') {
    const ext = path.extname(fileName || '').slice(1).toLowerCase().replace(/[^a-z0-9]/g, '');
    return ext || this.extensionFromMime(fileMime);
  }

  contentTypeFromExtension(fileName) {
    const ext = path.extname(fileName).slice(1).toLowerCase();
    const contentTypes = {
      mp4: 'video/mp4',
      m4v: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      m4a: 'audio/mp4',
    };

    return contentTypes[ext] || 'application/octet-stream';
  }

  resolveLocalVideoPath(storagePath) {
    const fileName = path.basename(storagePath.replace(/^local:/, ''));
    return path.join(this.uploadsDir, fileName);
  }

  normalizedGcsPrefix() {
    return (config.gcsUploadPrefix || 'vidask/videos').replace(/^\/+|\/+$/g, '');
  }

  isGcsEnabled() {
    return config.storageProvider === 'gcs' || Boolean(config.gcsBucketName);
  }

  gcsOptions() {
    const options = {};

    if (config.gcsProjectId) {
      options.projectId = config.gcsProjectId;
    }

    if (config.gcsKeyFile) {
      options.keyFilename = config.gcsKeyFile;
      return options;
    }

    if (config.gcsClientEmail && config.gcsPrivateKey) {
      options.credentials = {
        client_email: config.gcsClientEmail,
        private_key: config.gcsPrivateKey.replace(/\\n/g, '\n'),
      };
    }

    return options;
  }

  getGcsClient() {
    if (!this.gcsClient) {
      this.gcsClient = new Storage(this.gcsOptions());
    }

    return this.gcsClient;
  }

  getGcsBucket() {
    if (!config.gcsBucketName) {
      throw new AppError('GCS_BUCKET_NAME is missing from environment variables.', 500);
    }

    return this.getGcsClient().bucket(config.gcsBucketName);
  }

  signedUrlTtlSeconds() {
    return config.gcsSignedUrlTtlSeconds;
  }

  parseGcsStoragePath(storagePath) {
    const match = storagePath?.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match) return null;

    const [, bucketName, storageKey] = match;
    return { bucketName, storageKey };
  }

  async storeVideoInGcs({ lessonId, fileBuffer, fileMime, fileName }) {
    const ext = this.extensionFromFileName(fileName, fileMime);
    const bucket = this.getGcsBucket();
    const storageKey = `${this.normalizedGcsPrefix()}/${uuidv4()}.${ext}`;
    const contentType = fileMime || this.contentTypeFromExtension(storageKey);
    const file = bucket.file(storageKey);

    await file.save(fileBuffer, {
      contentType,
      metadata: {
        cacheControl: 'private, max-age=0, no-transform',
        metadata: {
          lessonId,
          originalName: fileName || '',
        },
      },
      resumable: false,
      validation: 'crc32c',
    });

    const storagePath = `gs://${bucket.name}/${storageKey}`;

    return {
      storageProvider: 'google_cloud',
      storageKey,
      storagePath,
      storageUrl: storagePath,
      publicUrl: null,
      videoUrl: null,
    };
  }

  async storeVideo({ lessonId, fileBuffer, fileMime, fileName }) {
    const ext = this.extensionFromFileName(fileName, fileMime);

    if (this.isGcsEnabled()) {
      try {
        return await this.storeVideoInGcs({ lessonId, fileBuffer, fileMime, fileName });
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError(`GCS video upload failed: ${err.message}`, 502);
      }
    }

    if (config.isProduction()) {
      throw new AppError('Google Cloud Storage is not configured. Set STORAGE_PROVIDER=gcs and GCS_BUCKET_NAME.', 500);
    }

    try {
      this.ensureUploadDir();
      const localFile = this.resolveLocalVideoPath(`local:${lessonId}.${ext}`);
      await fs.promises.writeFile(localFile, fileBuffer);
      return {
        storageProvider: 'local',
        storageKey: `${lessonId}.${ext}`,
        videoUrl: null,
        storagePath: `local:${lessonId}.${ext}`,
        storageUrl: null,
        publicUrl: null,
      };
    } catch (err) {
      throw new AppError(`Local video storage failed: ${err.message}`, 500);
    }
  }

  getLocalVideoInfo(storagePath) {
    this.ensureUploadDir();
    const fileName = path.basename(storagePath.replace(/^local:/, ''));
    const filePath = this.resolveLocalVideoPath(storagePath);

    if (!fs.existsSync(filePath)) return null;

    return {
      filePath,
      fileSize: fs.statSync(filePath).size,
      contentType: this.contentTypeFromExtension(fileName),
    };
  }

  async getSignedVideoUrl(storagePath) {
    const parsed = this.parseGcsStoragePath(storagePath);
    if (!parsed) return null;

    const { bucketName, storageKey } = parsed;
    const file = this.getGcsClient().bucket(bucketName).file(storageKey);
    const [exists] = await file.exists();
    if (!exists) return null;

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + config.gcsSignedUrlTtlSeconds * 1000,
      version: 'v4',
    });

    return url;
  }

  async getGcsVideoInfo(storagePath) {
    const parsed = this.parseGcsStoragePath(storagePath);
    if (!parsed) return null;

    const { bucketName, storageKey } = parsed;
    const file = this.getGcsClient().bucket(bucketName).file(storageKey);
    const [exists] = await file.exists();
    if (!exists) return null;

    const [metadata] = await file.getMetadata();
    return {
      file,
      fileSize: Number(metadata.size || 0),
      contentType: metadata.contentType || this.contentTypeFromExtension(storageKey),
      fileName: path.basename(storageKey),
    };
  }

  async deleteVideo(storagePath) {
    if (!storagePath) return false;

    if (storagePath.startsWith('local:')) {
      const filePath = this.resolveLocalVideoPath(storagePath);
      if (!fs.existsSync(filePath)) return false;
      await fs.promises.unlink(filePath);
      return true;
    }

    const parsed = this.parseGcsStoragePath(storagePath);
    if (!parsed) return false;

    const { bucketName, storageKey } = parsed;
    const file = this.getGcsClient().bucket(bucketName).file(storageKey);
    const [exists] = await file.exists();
    if (!exists) return false;

    await file.delete();
    return true;
  }
}

export default VideoStorageService;
