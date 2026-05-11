import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import AppError from '../utils/AppError.js';

class LessonService {
  constructor({ lessonRepository, transcriptService, ingestionService, videoStorageService, chunkCacheService, aiMetadataService }) {
    this.lessonRepository = lessonRepository;
    this.transcriptService = transcriptService;
    this.ingestionService = ingestionService;
    this.videoStorageService = videoStorageService;
    this.chunkCacheService = chunkCacheService;
    this.aiMetadataService = aiMetadataService;
  }

  async createYoutubeLesson(payload, user) {
    const videoId = this.transcriptService.extractYoutubeId(payload.youtubeUrl);
    if (!videoId) {
      throw new AppError('Invalid YouTube URL. Supported formats: watch?v=, youtu.be/, embed/', 400);
    }

    const lessonId = uuidv4();
    const lessonData = {
      lessonId,
      courseId: payload.courseId,
      moduleId: payload.moduleId || 'default',
      title: payload.title,
      description: payload.description || '',
      order: Number(payload.order || 0),
      source: 'youtube',
      youtubeUrl: payload.youtubeUrl,
      youtubeVideoId: videoId,
      status: 'processing',
      progress: 0,
      chunkCount: 0,
      duration: 0,
      starterQuestions: [],
      topicSegments: [],
      createdBy: user.uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
    };

    await this.lessonRepository.create(lessonData);
    setImmediate(() => this.ingestionService.runYoutubeIngest(lessonId, payload.youtubeUrl, payload.title));

    return {
      lessonId,
      status: 'processing',
      message: 'Lesson created. Processing has started in the background.',
    };
  }

  async createUploadedLesson(payload, file, user) {
    if (!file) throw new AppError('No file uploaded.', 400);

    const lessonId = uuidv4();
    const ext = file.originalname.split('.').pop().toLowerCase();
    const lessonData = {
      lessonId,
      courseId: payload.courseId,
      moduleId: payload.moduleId || 'default',
      title: payload.title,
      description: payload.description || '',
      order: Number(payload.order || 0),
      source: 'upload',
      storagePath: `local:${lessonId}.${ext}`,
      status: 'uploading',
      progress: 1,
      chunkCount: 0,
      duration: 0,
      starterQuestions: [],
      topicSegments: [],
      createdBy: user.uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null,
    };

    await this.lessonRepository.create(lessonData);

    setImmediate(async () => {
      try {
        const stored = await this.videoStorageService.storeVideo({
          lessonId,
          fileBuffer: file.buffer,
          fileMime: file.mimetype,
          fileName: file.originalname,
        });

        await this.lessonRepository.updateById(lessonId, stored);
        await this.ingestionService.runUploadIngest(
          lessonId,
          file.buffer,
          file.mimetype,
          file.originalname,
          payload.language || 'auto',
          payload.title,
        );
      } catch (err) {
        await this.lessonRepository.updateById(lessonId, {
          status: 'failed',
          error: err.message,
        }).catch(() => {});
      }
    });

    return {
      lessonId,
      status: 'uploading',
      message: 'Lesson created. Uploading and processing in background.',
    };
  }

  async getStatus(lessonId) {
    const lesson = await this.getById(lessonId);
    return {
      lessonId,
      status: lesson.status,
      progress: lesson.progress || 0,
      chunkCount: lesson.chunkCount || 0,
      error: lesson.error || null,
    };
  }

  async getById(lessonId) {
    const lesson = await this.lessonRepository.findById(lessonId);
    if (!lesson) throw new AppError('Lesson not found.', 404);
    const { embedding, ...safeLesson } = lesson;
    return safeLesson;
  }

  async listByCourse(courseId) {
    const lessons = await this.lessonRepository.findAllByCourseId(courseId);
    return lessons.map((lesson) => ({
      id: lesson.lessonId,
      lessonId: lesson.lessonId,
      title: lesson.title,
      description: lesson.description,
      order: lesson.order,
      source: lesson.source,
      status: lesson.status,
      duration: lesson.duration,
      chunkCount: lesson.chunkCount,
      youtubeUrl: lesson.youtubeUrl,
      youtubeVideoId: lesson.youtubeVideoId,
      videoUrl: lesson.videoUrl || null,
      starterQuestions: lesson.starterQuestions || [],
      topicSegments: lesson.topicSegments || [],
      createdAt: lesson.createdAt,
    }));
  }

  async getVideo(lessonId) {
    const lesson = await this.getById(lessonId);
    if (lesson.videoUrl) return { type: 'redirect', url: lesson.videoUrl };

    if (!lesson.storagePath?.startsWith('local:')) {
      throw new AppError('No video file for this lesson.', 404);
    }

    const localInfo = this.videoStorageService.getLocalVideoInfo(lesson.storagePath);
    if (!localInfo) throw new AppError('Video file not found on server.', 404);

    return {
      type: 'local',
      ...localInfo,
      fileName: path.basename(localInfo.filePath),
    };
  }

  async regenerateChapters(lessonId) {
    const chunks = await this.chunkCacheService.getChunks(lessonId);
    if (!chunks.length) throw new AppError('No transcript chunks found. Process the video first.', 400);

    const topicSegments = await this.aiMetadataService.generateTopicSegments(chunks);
    await this.lessonRepository.updateById(lessonId, { topicSegments });

    return {
      count: topicSegments.length,
      topicSegments,
    };
  }

  async getTranscript(lessonId) {
    const chunks = await this.chunkCacheService.getChunks(lessonId);
    return chunks.map((chunk) => ({
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      startLabel: chunk.startLabel,
      endLabel: chunk.endLabel,
    }));
  }
}

export default LessonService;
