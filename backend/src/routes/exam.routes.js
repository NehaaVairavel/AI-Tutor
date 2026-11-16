const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getExams, getExam, createExam, updateExam, deleteExam } = require('../controllers/exam.controller');

router.get('/', getExams);
router.get('/:id', getExam);
router.post('/', protect, adminOnly, createExam);
router.put('/:id', protect, adminOnly, updateExam);
router.delete('/:id', protect, adminOnly, deleteExam);

module.exports = router;
