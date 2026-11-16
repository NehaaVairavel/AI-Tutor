const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  startSession, submitSession,
  getSessionResult, getSessionReview, explainQuestion,
  getMySessions, getMyMistakes, getSessionQuestions,
} = require('../controllers/practice.controller');

router.post('/start',                  protect, startSession);
router.post('/:sessionId/submit',      protect, submitSession);
router.get('/sessions/me',             protect, getMySessions);
router.get('/mistakes/me',             protect, getMyMistakes);
router.get('/:sessionId/questions',    protect, getSessionQuestions);
router.get('/:sessionId/result',       protect, getSessionResult);
// Answer review — completed sessions only; returns snapshots + live supplement
router.get('/:sessionId/review',       protect, getSessionReview);
// AI explanation for a specific question in a completed session
router.post('/:sessionId/explain/:questionIndex', protect, explainQuestion);

module.exports = router;
