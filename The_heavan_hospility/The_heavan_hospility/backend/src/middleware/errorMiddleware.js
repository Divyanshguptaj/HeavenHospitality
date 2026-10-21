const multer = require('multer');

const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Route not found - ${req.method} ${req.originalUrl}`));
};

const errorMiddleware = (err, req, res, next) => {
  let statusCode = err.statusCode || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
  let message = err.message || 'Server Error';
  let errors;

  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  } else if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.fromEntries(
      Object.entries(err.errors).map(([key, value]) => [key, value.message]),
    );
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = field ? `${field} already exists` : 'Duplicate value';
  } else if (err instanceof multer.MulterError) {
    statusCode = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5MB or smaller.' : err.message;
  }

  const response = { success: false, message };
  if (errors) response.errors = errors;
  if (process.env.NODE_ENV !== 'production') response.stack = err.stack;

  res.status(statusCode).json(response);
};

module.exports = { notFound, errorMiddleware };
