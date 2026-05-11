import BaseValidator from './base.validator.js';

class LessonValidator extends BaseValidator {
  youtubeIngest() {
    return {
      validate: (input) => {
        const value = {
          courseId: this.cleanString(input.courseId),
          moduleId: this.cleanString(input.moduleId, 'default'),
          title: this.cleanString(input.title),
          description: this.cleanString(input.description),
          youtubeUrl: this.cleanString(input.youtubeUrl),
          order: this.cleanNumber(input.order, 0),
        };
        const errors = [];

        if (!value.courseId) errors.push('courseId is required.');
        if (!value.title) errors.push('title is required.');
        if (value.title.length > 200) errors.push('title must be 200 characters or fewer.');
        if (!value.youtubeUrl) errors.push('youtubeUrl is required.');
        if (value.description.length > 2000) errors.push('description must be 2000 characters or fewer.');

        return this.result(value, errors);
      },
    };
  }

  upload() {
    return {
      validate: (input) => {
        const value = {
          courseId: this.cleanString(input.courseId),
          moduleId: this.cleanString(input.moduleId, 'default'),
          title: this.cleanString(input.title),
          description: this.cleanString(input.description),
          language: this.cleanString(input.language, 'auto'),
          order: this.cleanNumber(input.order, 0),
        };
        const errors = [];

        if (!value.courseId) errors.push('courseId is required.');
        if (!value.title) errors.push('title is required.');
        if (value.title.length > 200) errors.push('title must be 200 characters or fewer.');
        if (value.description.length > 2000) errors.push('description must be 2000 characters or fewer.');

        return this.result(value, errors);
      },
    };
  }

  listQuery() {
    return {
      validate: (input) => {
        const value = { courseId: this.cleanString(input.courseId) };
        const errors = value.courseId ? [] : ['courseId query param required.'];
        return this.result(value, errors);
      },
    };
  }
}

export default LessonValidator;
