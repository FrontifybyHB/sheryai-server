import BaseValidator from './base.validator.js';

class ChatValidator extends BaseValidator {
  stream() {
    return {
      validate: (input) => {
        const value = {
          lessonId: this.cleanString(input.lessonId),
          sessionId: this.cleanString(input.sessionId),
          message: this.cleanString(input.message),
          currentTime: this.cleanNumber(input.currentTime, 0),
        };
        const errors = [];

        if (!value.lessonId) errors.push('lessonId is required.');
        if (!value.message) errors.push('message is required.');
        if (value.message.length > 4000) errors.push('message must be 4000 characters or fewer.');

        return this.result(value, errors);
      },
    };
  }

  summary() {
    return {
      validate: (input) => {
        const value = {
          lessonId: this.cleanString(input.lessonId),
          type: this.cleanString(input.type, 'full'),
          startTime: this.cleanNumber(input.startTime, 0),
          endTime: this.cleanNumber(input.endTime, 0),
        };
        const errors = [];

        if (!value.lessonId) errors.push('lessonId is required.');
        if (!['full', 'last5min', 'range'].includes(value.type)) errors.push('type must be full, last5min, or range.');

        return this.result(value, errors);
      },
    };
  }

  quiz() {
    return {
      validate: (input) => {
        const count = Math.min(Math.max(this.cleanNumber(input.count, 10), 1), 15);
        const value = {
          lessonId: this.cleanString(input.lessonId),
          count,
          type: this.cleanString(input.type, 'mcq'),
          difficulty: this.cleanString(input.difficulty, 'mixed'),
        };
        const errors = [];

        if (!value.lessonId) errors.push('lessonId is required.');
        if (!['mcq'].includes(value.type)) errors.push('type must be mcq.');
        if (!['mixed', 'easy', 'medium', 'hard'].includes(value.difficulty)) {
          errors.push('difficulty must be mixed, easy, medium, or hard.');
        }

        return this.result(value, errors);
      },
    };
  }
}

export default ChatValidator;
