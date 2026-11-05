export class AppError extends Error {
  constructor(status, message, code = 'app_error') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message) {
    super(400, message, 'validation_error');
    this.name = 'ValidationError';
  }
}

export class AuthError extends AppError {
  constructor(message = 'Not authenticated') {
    super(401, message, 'unauthorized');
    this.name = 'AuthError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, message, 'not_found');
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(429, message, 'rate_limited');
    this.name = 'RateLimitError';
  }
}
