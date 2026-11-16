const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');

// GET /api/users/:id (admin or self)
router.get('/:id', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).populate('targetExam', 'name shortName category');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    res.json({ success: true, message: 'User retrieved.', data: { user: user.toSafeObject() } });
  } catch (err) { next(err); }
});

module.exports = router;
