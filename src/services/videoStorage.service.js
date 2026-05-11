import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBucket } from '../config/firebase.js';

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

  extensionFromFileName(fileName) {
    return fileName.split('.').pop().toLowerCase();
  }

  async storeVideo({ lessonId, fileBuffer, fileMime, fileName }) {
    const ext = this.extensionFromFileName(fileName);

    try {
      const bucket = getBucket();
      const gcsPath = `videos/${lessonId}.${ext}`;
      const file = bucket.file(gcsPath);
      await file.save(fileBuffer, {
        metadata: { contentType: fileMime },
        resumable: false,
      });

      return {
        videoUrl: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(gcsPath)}?alt=media`,
        storagePath: `gs://${bucket.name}/${gcsPath}`,
      };
    } catch {
      this.ensureUploadDir();
      const localFile = path.join(this.uploadsDir, `${lessonId}.${ext}`);
      await fs.promises.writeFile(localFile, fileBuffer);
      return {
        videoUrl: null,
        storagePath: `local:${lessonId}.${ext}`,
      };
    }
  }

  getLocalVideoInfo(storagePath) {
    this.ensureUploadDir();
    const fileName = storagePath.replace(/^local:/, '');
    const filePath = path.join(this.uploadsDir, fileName);

    if (!fs.existsSync(filePath)) return null;

    const ext = path.extname(fileName).slice(1).toLowerCase();
    const contentType = ext === 'webm'
      ? 'video/webm'
      : ext === 'mov'
        ? 'video/quicktime'
        : ext === 'avi'
          ? 'video/x-msvideo'
          : 'video/mp4';

    return {
      filePath,
      fileSize: fs.statSync(filePath).size,
      contentType,
    };
  }
}

export default VideoStorageService;
