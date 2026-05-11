class ApiResponse {
  static success(data = {}, message = 'Success', statusCode = 200) {
    const payload = data && typeof data === 'object' && !Array.isArray(data) ? data : { data };

    return {
      success: true,
      statusCode,
      message,
      data,
      ...payload,
    };
  }

  static error(message = 'Internal Server Error', statusCode = 500) {
    return {
      success: false,
      statusCode,
      code: statusCode,
      error: message,
      message,
    };
  }
}

export default ApiResponse;
