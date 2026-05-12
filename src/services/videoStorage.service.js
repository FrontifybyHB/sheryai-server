import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { admin, getBucket } from '../config/firebase.js';
import config from '../config/env.js';
import AppError from '../utils/AppError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class VideoStorageService {
  constructor() {
    this.uploadsDir = path.join(__dirname, '../../uploads/videos');
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

  async storeVideo({ lessonId, fileBuffer, fileMime, fileName }) {
    const ext = this.extensionFromFileName(fileName, fileMime);

    try {
      const bucket = getBucket();
      const gcsPath = `videos/${lessonId}.${ext}`;
      const file = bucket.file(gcsPath);
      const downloadToken = uuidv4();
      await file.save(fileBuffer, {
        metadata: {
          contentType: fileMime,
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
            lessonId,
            originalName: fileName,
          },
        },
        resumable: false,
      });

      return {
        videoUrl: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(gcsPath)}?alt=media&token=${downloadToken}`,
        storagePath: `gs://${bucket.name}/${gcsPath}`,
      };
    } catch (err) {
      if (config.isProduction()) {
        throw new AppError(`Video storage upload failed: ${err.message}`, 502);
      }

      this.ensureUploadDir();
      const localFile = this.resolveLocalVideoPath(`local:${lessonId}.${ext}`);
      await fs.promises.writeFile(localFile, fileBuffer);
      return {
        videoUrl: null,
        storagePath: `local:${lessonId}.${ext}`,
      };
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
    const match = storagePath.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match) return null;

    const [, bucketName, filePath] = match;
    const bucket = getBucket();
    const targetBucket = bucket.name === bucketName ? bucket : admin.storage().bucket(bucketName);
    const file = targetBucket.file(filePath);
    const [exists] = await file.exists();
    if (!exists) return null;

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000,
    });

    return url;
  }

  async deleteVideo(storagePath) {
    if (!storagePath) return false;

    if (storagePath.startsWith('local:')) {
      const filePath = this.resolveLocalVideoPath(storagePath);
      if (!fs.existsSync(filePath)) return false;
      await fs.promises.unlink(filePath);
      return true;
    }

    const match = storagePath.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (!match) return false;

    const [, bucketName, filePath] = match;
    const bucket = getBucket();
    const targetBucket = bucket.name === bucketName ? bucket : admin.storage().bucket(bucketName);
    const file = targetBucket.file(filePath);
    const [exists] = await file.exists();
    if (!exists) return false;

    await file.delete();
    return true;
  }
}

export default VideoStorageService;
