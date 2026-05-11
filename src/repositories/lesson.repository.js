import LessonContract from '../contracts/lesson.contract.js';

class LessonRepository extends LessonContract {
  constructor(dbProvider) {
    super();
    this.dbProvider = dbProvider;
  }

  collection() {
    return this.dbProvider().collection('lessons');
  }

  async create(data) {
    await this.collection().doc(data.lessonId).set(data);
    return data;
  }

  async findById(lessonId) {
    const doc = await this.collection().doc(lessonId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  async findAllByCourseId(courseId) {
    const snapshot = await this.collection()
      .where('courseId', '==', courseId)
      .orderBy('order', 'asc')
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async updateById(lessonId, data) {
    const updateData = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await this.collection().doc(lessonId).update(updateData);
    return this.findById(lessonId);
  }
}

export default LessonRepository;
