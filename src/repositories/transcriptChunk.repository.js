import TranscriptChunkContract from '../contracts/transcriptChunk.contract.js';

class TranscriptChunkRepository extends TranscriptChunkContract {
  constructor(dbProvider) {
    super();
    this.dbProvider = dbProvider;
    this.batchSize = 20;
  }

  collection() {
    return this.dbProvider().collection('transcriptChunks');
  }

  async saveMany(lessonId, chunks, onBatchSaved = null) {
    let savedCount = 0;

    for (let index = 0; index < chunks.length; index += this.batchSize) {
      const batch = chunks.slice(index, index + this.batchSize);
      const firestoreBatch = this.dbProvider().batch();

      for (const chunk of batch) {
        const docId = `${lessonId}_${String(chunk.chunkIndex).padStart(5, '0')}`;
        firestoreBatch.set(this.collection().doc(docId), {
          lessonId,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          startLabel: chunk.startLabel,
          endLabel: chunk.endLabel,
          createdAt: new Date().toISOString(),
        });
      }

      await firestoreBatch.commit();
      savedCount += batch.length;
      if (onBatchSaved) await onBatchSaved(savedCount);
    }

    return savedCount;
  }

  async findByLessonId(lessonId) {
    let snapshot;

    try {
      snapshot = await this.collection()
        .where('lessonId', '==', lessonId)
        .orderBy('chunkIndex', 'asc')
        .get();
    } catch {
      snapshot = await this.collection()
        .where('lessonId', '==', lessonId)
        .get();
    }

    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
  }
}

export default TranscriptChunkRepository;
