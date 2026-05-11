import ChatSessionContract from '../contracts/chatSession.contract.js';

class ChatSessionRepository extends ChatSessionContract {
  constructor(dbProvider) {
    super();
    this.dbProvider = dbProvider;
  }

  collection() {
    return this.dbProvider().collection('chatSessions');
  }

  docId(studentId, lessonId, sessionId) {
    return `${studentId}_${lessonId}_${sessionId}`;
  }

  async findBySession(studentId, lessonId, sessionId) {
    const doc = await this.collection().doc(this.docId(studentId, lessonId, sessionId)).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  async findLatestForLesson(studentId, lessonId) {
    const snapshot = await this.collection()
      .where('lessonId', '==', lessonId)
      .where('studentId', '==', studentId)
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get();

    return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  }

  async appendMessages(sessionId, lessonId, studentId, messages, followUps) {
    const docRef = this.collection().doc(this.docId(studentId, lessonId, sessionId));
    const snap = await docRef.get();
    const now = new Date().toISOString();
    const newMessages = [
      { role: 'user', content: messages.user, timestamp: now },
      { role: 'assistant', content: messages.assistant, followUps, timestamp: now },
    ];

    if (snap.exists) {
      const existing = snap.data().messages || [];
      await docRef.update({
        messages: [...existing, ...newMessages].slice(-20),
        updatedAt: now,
      });
    } else {
      await docRef.set({
        sessionId,
        lessonId,
        studentId,
        messages: newMessages,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async deleteBySession(studentId, sessionId) {
    const snapshot = await this.collection()
      .where('sessionId', '==', sessionId)
      .where('studentId', '==', studentId)
      .limit(1)
      .get();

    if (snapshot.empty) return false;
    await snapshot.docs[0].ref.delete();
    return true;
  }
}

export default ChatSessionRepository;
