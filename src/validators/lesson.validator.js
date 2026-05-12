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
          language: this.cleanString(input.language, 'auto'),
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

  urlIngest() {
    return {
      validate: (input) => {
        const value = {
          courseId: this.cleanString(input.courseId),
          moduleId: this.cleanString(input.moduleId, 'default'),
          title: this.cleanString(input.title),
          description: this.cleanString(input.description),
          sourceUrl: this.cleanString(input.sourceUrl || input.url || input.videoUrl),
          language: this.cleanString(input.language, 'auto'),
          order: this.cleanNumber(input.order, 0),
        };
        const errors = [];

        if (!value.courseId) errors.push('courseId is required.');
        if (!value.title) errors.push('title is required.');
        if (value.title.length > 200) errors.push('title must be 200 characters or fewer.');
        if (!value.sourceUrl) errors.push('sourceUrl is required.');
        if (value.description.length > 2000) errors.push('description must be 2000 characters or fewer.');

        return this.result(value, errors);
      },
    };
  }

  listQuery() {
    return {
      validate: (input) => {
        const value = {
          courseId: this.cleanString(input.courseId),
          status: this.cleanString(input.status),
          includeFailed: this.cleanString(input.includeFailed, 'false') === 'true',
        };
        const errors = value.courseId ? [] : ['courseId query param required.'];
        if (value.status && !['uploading', 'transcribing', 'processing', 'ready', 'failed'].includes(value.status)) {
          errors.push('status must be uploading, transcribing, processing, ready, or failed.');
        }
        return this.result(value, errors);
      },
    };
  }

  failedQuery() {
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
