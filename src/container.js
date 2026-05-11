import { getDb } from './config/firebase.js';
import { geminiFlash } from './config/gemini.js';
import LessonRepository from './repositories/lesson.repository.js';
import TranscriptChunkRepository from './repositories/transcriptChunk.repository.js';
import ChatSessionRepository from './repositories/chatSession.repository.js';
import TranscriptService from './services/transcript.service.js';
import ChunkingService from './services/chunking.service.js';
import ChunkCacheService from './services/chunkCache.service.js';
import AiMetadataService from './services/aiMetadata.service.js';
import LessonIngestionService from './services/lessonIngestion.service.js';
import VideoStorageService from './services/videoStorage.service.js';
import LessonService from './services/lesson.service.js';
import ChatService from './services/chat.service.js';

class Container {
  constructor() {
    this.lessonRepository = new LessonRepository(getDb);
    this.chunkRepository = new TranscriptChunkRepository(getDb);
    this.chatSessionRepository = new ChatSessionRepository(getDb);

    this.transcriptService = new TranscriptService();
    this.chunkingService = new ChunkingService();
    this.chunkCacheService = new ChunkCacheService(this.chunkRepository);
    this.aiMetadataService = new AiMetadataService(geminiFlash);
    this.videoStorageService = new VideoStorageService();

    this.ingestionService = new LessonIngestionService({
      lessonRepository: this.lessonRepository,
      transcriptService: this.transcriptService,
      chunkingService: this.chunkingService,
      chunkRepository: this.chunkRepository,
      aiMetadataService: this.aiMetadataService,
      chunkCacheService: this.chunkCacheService,
    });

    this.lessonService = new LessonService({
      lessonRepository: this.lessonRepository,
      transcriptService: this.transcriptService,
      ingestionService: this.ingestionService,
      videoStorageService: this.videoStorageService,
      chunkCacheService: this.chunkCacheService,
      aiMetadataService: this.aiMetadataService,
    });

    this.chatService = new ChatService({
      lessonRepository: this.lessonRepository,
      chunkCacheService: this.chunkCacheService,
      chatSessionRepository: this.chatSessionRepository,
      aiClient: geminiFlash,
    });
  }
}

const container = new Container();

export default container;
