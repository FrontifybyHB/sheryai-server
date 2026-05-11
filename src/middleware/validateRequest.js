import ApiResponse from '../utils/ApiResponse.js';

const validateRequest = (schema, source = 'body') => (req, res, next) => {
  const result = schema.validate(req[source] || {});

  if (!result.valid) {
    return res.status(400).json(ApiResponse.error(result.errors.join(', '), 400));
  }

  req[source] = result.value;
  return next();
};

export default validateRequest;
