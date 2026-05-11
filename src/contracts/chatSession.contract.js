class ChatSessionContract {
  async findBySession(_studentId, _lessonId, _sessionId) {
    throw new Error('Method not implemented: findBySession');
  }

  async findLatestForLesson(_studentId, _lessonId) {
    throw new Error('Method not implemented: findLatestForLesson');
  }

  async appendMessages(_sessionId, _lessonId, _studentId, _messages, _followUps) {
    throw new Error('Method not implemented: appendMessages');
  }

  async deleteBySession(_studentId, _sessionId) {
    throw new Error('Method not implemented: deleteBySession');
  }
}

export default ChatSessionContract;
