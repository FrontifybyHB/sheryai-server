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

  async saveTranscriptArtifacts(lessonId, normalizedTranscript, title, progress = {}) {
    const {
      chunkProgress = 60,
      metadataProgress = 85,
      finalProgress = 95,
    } = progress;

    const chunks = this.chunkingService.chunkTranscript(normalizedTranscript);
    if (!chunks.length) throw new Error('No chunks generated - transcript may be too short or empty.');

    await this.safeProgress(lessonId, 'processing', chunkProgress);
    await this.chunkRepository.saveMany(lessonId, chunks, (savedCount) => (
      this.lessonRepository.updateById(lessonId, { chunkCount: savedCount })
    ));

    await this.safeProgress(lessonId, 'processing', metadataProgress);
    const [starterQuestions, topicSegments] = await Promise.all([
      this.aiMetadataService.generateStarterQuestions(chunks, title),
      this.aiMetadataService.generateTopicSegments(chunks),
    ]);

    await this.safeProgress(lessonId, 'processing', finalProgress);
    await this.updateLessonStatus(lessonId, {
      status: 'ready',
      progress: 100,
      chunkCount: chunks.length,
      duration: chunks[chunks.length - 1]?.endTime || 0,
      starterQuestions,
      topicSegments,
      error: null,
    });

    this.chunkCacheService.invalidate(lessonId);
    return chunks;
  }

  async runYoutubeIngest(lessonId, youtubeUrl, title, language = 'auto') {
    logger.info('YouTube ingest started', { lessonId, language });

    try {
      await this.safeProgress(lessonId, 'transcribing', 10);
      const normalizedTranscript = await this.transcriptService.fetchYoutubeTranscript(youtubeUrl, language);

      await this.safeProgress(lessonId, 'processing', 40);
      await this.saveTranscriptArtifacts(lessonId, normalizedTranscript, title);
      logger.info('YouTube ingest completed', { lessonId });
    } catch (err) {
      logger.error('YouTube ingest failed', { lessonId, error: err, details: err.details });
      await this.updateLessonStatus(lessonId, {
        status: 'failed',
        progress: 0,
        error: err.message,
        errorDetails: err.details || null,
      }).catch(() => {});
    }
  }

  async runPublicUrlIngest(lessonId, publicMediaUrl, title, language = 'auto') {
    logger.info('URL ingest started', { lessonId, language });

    try {
      await this.safeProgress(lessonId, 'transcribing', 12);
      const transcriptId = await this.transcriptService.submitTranscript(publicMediaUrl, language);
      const rawTranscript = await this.transcriptService.pollTranscriptUntilDone(
        transcriptId,
        (pct) => this.safeProgress(lessonId, 'transcribing', pct),
        15,
        78,
      );

      const normalizedTranscript = this.transcriptService.normalizeAssemblyResult(rawTranscript);
      await this.safeProgress(lessonId, 'processing', 79);
      await this.saveTranscriptArtifacts(lessonId, normalizedTranscript, title, {
        chunkProgress: 82,
        metadataProgress: 88,
        finalProgress: 95,
      });
      logger.info('URL ingest completed', { lessonId });
    } catch (err) {
      logger.error('URL ingest failed', { lessonId, error: err.message });
      await this.updateLessonStatus(lessonId, { status: 'failed', progress: 0, error: err.message }).catch(() => {});
    }
  }

  async runUploadIngest(lessonId, fileBuffer, fileMime, fileName, language, title) {
    logger.info('Upload ingest started', {
      lessonId,
      fileMime,
      fileSize: fileBuffer?.length,
      language,
    });

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

      await this.saveTranscriptArtifacts(lessonId, normalizedTranscript, title, {
        chunkProgress: 82,
        metadataProgress: 88,
        finalProgress: 95,
      });

      logger.info('Upload ingest completed', { lessonId });
    } catch (err) {
      logger.error('Upload ingest failed', { lessonId, error: err.message });
      await this.updateLessonStatus(lessonId, { status: 'failed', progress: 0, error: err.message }).catch(() => {});
    }
  }
}

export default LessonIngestionService;
