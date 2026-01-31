
class ApiError extends Error {
  constructor(statusCode, message, isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode; // HTTP status code
    this.isOperational = isOperational; // True if error is known/predicted

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor); // Capture stack trace
    }
  }
}

export default ApiError;