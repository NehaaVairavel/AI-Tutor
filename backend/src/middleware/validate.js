const { validationResult } = require('express-validator');

/**
 * Runs after express-validator chains.
 * Returns 422 with all validation errors if any exist.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => e.msg);
    return res.status(422).json({
      success: false,
      message: messages[0],
      errors: messages,
    });
  }
  next();
};

module.exports = validate;
