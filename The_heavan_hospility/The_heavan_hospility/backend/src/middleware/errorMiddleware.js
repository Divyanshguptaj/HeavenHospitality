const multer = require('multer');

const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Route not found - ${req.method} ${req.originalUrl}`));
};

const errorMiddleware = (err, req, res, next) => {
  let statusCode = err.statusCode || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
  let message = err.message || 'Server Error';

  if (err.code === '22P02') {
    statusCode = 400;
    message = 'Invalid value in request';
  } else if (err.code === '23514' || err.code === '23502') {
    statusCode = 400;
    message = 'Validation failed';
  } else if (err.code === '23505') {
    statusCode = 409;
    message = 'Duplicate value';
  } else if (err instanceof multer.MulterError) {
    statusCode = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5MB or smaller.' : err.message;
  }

  const response = { success: false, message };
  if (process.env.NODE_ENV !== 'production') response.stack = err.stack;

  res.status(statusCode).json(response);
};

module.exports = { notFound, errorMiddleware };
