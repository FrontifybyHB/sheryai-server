import logger from '../loggers/logger.js';

class LessonIngestionService {
  constructor({ lessonRepository, transcriptService, chunkingService, chunkRepository, aiMetadataService, chunkCacheService }) {
    this.lessonRepository = lessonRepository;
    this.transcriptService = transcriptService;
    this.chunkingService = chunkingService;
    this.chunkRepository = chunkRepository;
    this.aiMetadataService = aiMetadataService;
    this.chunkCacheService = chunkCacheService;
  }

  async updateLessonStatus(lessonId, fields) {
    return this.lessonRepository.updateById(lessonId, fields);
  }

  async safeProgress(lessonId, status, progress) {
    await this.updateLessonStatus(lessonId, { status, progress }).catch(() => {});
  }

  async runYoutubeIngest(lessonId, youtubeUrl, title, preloadedTranscript = null) {
    logger.info(`[YouTube Ingest] Starting lesson ${lessonId}`);

    try {
      await this.safeProgress(lessonId, 'transcribing', 10);
      const normalizedTranscript = preloadedTranscript || await this.transcriptService.fetchYoutubeTranscript(youtubeUrl);

      await this.safeProgress(lessonId, 'processing', 40);
      const chunks = this.chunkingService.chunkTranscript(normalizedTranscript);
      if (!chunks.length) throw new Error('No chunks generated - transcript may be too short.');

      await this.safeProgress(lessonId, 'processing', 60);
      await this.chunkRepository.saveMany(lessonId, chunks, (savedCount) => (
        this.lessonRepository.updateById(lessonId, { chunkCount: savedCount })
      ));

      await this.safeProgress(lessonId, 'processing', 85);
      const [starterQuestions, topicSegments] = await Promise.all([
        this.aiMetadataService.generateStarterQuestions(chunks, title),
        this.aiMetadataService.generateTopicSegments(chunks),
      ]);

      await this.updateLessonStatus(lessonId, {
        status: 'ready',
        progress: 100,
        chunkCount: chunks.length,
        duration: chunks[chunks.length - 1]?.endTime || 0,
        starterQuestions,
        topicSegments,
      });

      this.chunkCacheService.invalidate(lessonId);
      logger.info(`[YouTube Ingest] Completed lesson ${lessonId}`);
    } catch (err) {
      logger.error(`[YouTube Ingest] Failed lesson ${lessonId}: ${err.message}`);
      await this.updateLessonStatus(lessonId, { status: 'failed', progress: 0, error: err.message }).catch(() => {});
    }
  }

  async runUploadIngest(lessonId, fileBuffer, fileMime, fileName, language, title) {
    logger.info(`[Upload Ingest] Starting lesson ${lessonId}: ${fileName}`);

    try {
      await this.safeProgress(lessonId, 'uploading', 1);
      let uploadPct = 1;
      const uploadTicker = setInterval(() => {
        if (uploadPct < 14) {
          uploadPct += 1;
          this.safeProgress(lessonId, 'uploading', uploadPct);
        }
      }, 800);

      const uploadUrl = await this.transcriptService.uploadBufferToAssemblyAI(fileBuffer);
      clearInterval(uploadTicker);
      await this.safeProgress(lessonId, 'uploading', 15);

      const transcriptId = await this.transcriptService.submitTranscript(uploadUrl, language);
      const rawTranscript = await this.transcriptService.pollTranscriptUntilDone(
        transcriptId,
        (pct) => this.safeProgress(lessonId, 'transcribing', pct),
        16,
        78,
      );

      const normalizedTranscript = this.transcriptService.normalizeAssemblyResult(rawTranscript);
      await this.safeProgress(lessonId, 'processing', 79);

      const chunks = this.chunkingService.chunkTranscript(normalizedTranscript);
      if (!chunks.length) throw new Error('No chunks generated - transcript may be empty.');

      await this.safeProgress(lessonId, 'processing', 82);
      await this.chunkRepository.saveMany(lessonId, chunks, (savedCount) => (
        this.lessonRepository.updateById(lessonId, { chunkCount: savedCount })
      ));

      await this.safeProgress(lessonId, 'processing', 88);
      const [starterQuestions, topicSegments] = await Promise.all([
        this.aiMetadataService.generateStarterQuestions(chunks, title),
        this.aiMetadataService.generateTopicSegments(chunks),
      ]);

      await this.safeProgress(lessonId, 'processing', 95);
      await this.updateLessonStatus(lessonId, {
        status: 'ready',
        progress: 100,
        chunkCount: chunks.length,
        duration: chunks[chunks.length - 1]?.endTime || 0,
        starterQuestions,
        topicSegments,
      });

      this.chunkCacheService.invalidate(lessonId);
      logger.info(`[Upload Ingest] Completed lesson ${lessonId}`);
    } catch (err) {
      logger.error(`[Upload Ingest] Failed lesson ${lessonId}: ${err.message}`);
      await this.updateLessonStatus(lessonId, { status: 'failed', progress: 0, error: err.message }).catch(() => {});
    }
  }
}

export default LessonIngestionService;
