class TranscriptChunkContract {
  async saveMany(_lessonId, _chunks, _onBatchSaved) {
    throw new Error('Method not implemented: saveMany');
  }

  async findByLessonId(_lessonId) {
    throw new Error('Method not implemented: findByLessonId');
  }

  async deleteByLessonId(_lessonId) {
    throw new Error('Method not implemented: deleteByLessonId');
  }
}

export default TranscriptChunkContract;
