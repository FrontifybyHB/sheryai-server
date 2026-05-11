class TranscriptChunkContract {
  async saveMany(_lessonId, _chunks, _onBatchSaved) {
    throw new Error('Method not implemented: saveMany');
  }

  async findByLessonId(_lessonId) {
    throw new Error('Method not implemented: findByLessonId');
  }
}

export default TranscriptChunkContract;
