const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getQuestions, getQuestion, createQuestion, updateQuestion, deleteQuestion, approveQuestion } = require('../controllers/question.controller');
const { generateQuestions, getQuestionStats } = require('../controllers/questionGenerate.controller');

// NOTE: /stats and /generate MUST be registered before /:id to avoid
// Express matching the literal strings "stats"/"generate" as an ObjectId.
router.get('/stats', protect, adminOnly, getQuestionStats);
router.post('/generate', protect, adminOnly, generateQuestions);

router.get('/', protect, getQuestions);
router.get('/:id', protect, getQuestion);
router.post('/', protect, adminOnly, createQuestion);
router.put('/:id', protect, adminOnly, updateQuestion);
router.delete('/:id', protect, adminOnly, deleteQuestion);
router.post('/:id/approve', protect, adminOnly, approveQuestion);

module.exports = router;
