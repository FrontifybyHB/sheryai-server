class LessonContract {
  async create(_data) {
    throw new Error('Method not implemented: create');
  }

  async findById(_lessonId) {
    throw new Error('Method not implemented: findById');
  }

  async findAllByCourseId(_courseId) {
    throw new Error('Method not implemented: findAllByCourseId');
  }

  async updateById(_lessonId, _data) {
    throw new Error('Method not implemented: updateById');
  }

  async deleteById(_lessonId) {
    throw new Error('Method not implemented: deleteById');
  }
}

export default LessonContract;
