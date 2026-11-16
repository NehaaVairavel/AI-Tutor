const jwt = require('jsonwebtoken');

/**
 * Generate a JWT token for a user
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

/**
 * Standard API success response
 */
const sendSuccess = (res, { statusCode = 200, message = 'Success', data = null }) => {
  const payload = { success: true, message };
  if (data !== null) payload.data = data;
  return res.status(statusCode).json(payload);
};

/**
 * Standard API error response
 */
const sendError = (res, { statusCode = 500, message = 'Internal Server Error' }) => {
  return res.status(statusCode).json({ success: false, message });
};

/**
 * Create an AppError that can be passed to next() for centralized handling
 */
const createError = (message, statusCode = 500) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

module.exports = { generateToken, sendSuccess, sendError, createError };
