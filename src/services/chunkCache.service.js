class ChunkCacheService {
  constructor(chunkRepository, { ttlMs = 2 * 60 * 60 * 1000, maxSize = 100 } = {}) {
    this.chunkRepository = chunkRepository;
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  async getChunks(lessonId) {
    const cached = this.cache.get(lessonId);
    const now = Date.now();

    if (cached && now - cached.loadedAt < this.ttlMs) {
      return cached.chunks;
    }

    const chunks = await this.chunkRepository.findByLessonId(lessonId);

    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(lessonId, { chunks, loadedAt: now });
    return chunks;
  }

  invalidate(lessonId) {
    this.cache.delete(lessonId);
  }

  stats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlHours: this.ttlMs / 3600000,
      keys: Array.from(this.cache.keys()),
    };
  }
}

export default ChunkCacheService;
