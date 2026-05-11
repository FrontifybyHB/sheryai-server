class BaseValidator {
  cleanString(value, fallback = '') {
    if (value === undefined || value === null) return fallback;
    return String(value).trim();
  }

  cleanNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  result(value, errors) {
    return {
      valid: errors.length === 0,
      value,
      errors,
    };
  }
}

export default BaseValidator;
