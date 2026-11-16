const Question = require('../models/Question');
const { createError } = require('../utils/helpers');

// GET /api/questions
const getQuestions = async (req, res, next) => {
  try {
    const { examId, subjectId, topicId, difficulty, source, isApproved, page = 1, limit = 20, search } = req.query;
    const filter = { isActive: true };

    if (examId) filter.exam = examId;
    if (subjectId) filter.subject = subjectId;
    if (topicId) filter.topic = topicId;
    if (difficulty) filter.difficulty = difficulty;
    if (source) filter.source = source;
    if (isApproved !== undefined) filter.isApproved = isApproved === 'true';
    if (search) filter.text = { $regex: search, $options: 'i' };

    const skip = (Number(page) - 1) * Number(limit);
    const [questions, total] = await Promise.all([
      Question.find(filter)
        .populate('subject', 'name')
        .populate('topic', 'name')
        .populate('exam', 'name shortName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Question.countDocuments(filter),
    ]);

    res.json({
      success: true,
      message: 'Questions retrieved.',
      data: {
        questions,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (err) { next(err); }
};

// GET /api/questions/:id
const getQuestion = async (req, res, next) => {
  try {
    const question = await Question.findById(req.params.id).populate('subject topic exam');
    if (!question) return next(createError('Question not found.', 404));
    res.json({ success: true, message: 'Question retrieved.', data: { question } });
  } catch (err) { next(err); }
};

// POST /api/questions (admin)
const createQuestion = async (req, res, next) => {
  try {
    const question = await Question.create({ ...req.body, source: req.body.source || 'admin', isApproved: true });
    res.status(201).json({ success: true, message: 'Question created.', data: { question } });
  } catch (err) { next(err); }
};

// PUT /api/questions/:id (admin)
const updateQuestion = async (req, res, next) => {
  try {
    const question = await Question.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!question) return next(createError('Question not found.', 404));
    res.json({ success: true, message: 'Question updated.', data: { question } });
  } catch (err) { next(err); }
};

// DELETE /api/questions/:id (admin)
const deleteQuestion = async (req, res, next) => {
  try {
    const question = await Question.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!question) return next(createError('Question not found.', 404));
    res.json({ success: true, message: 'Question deactivated.' });
  } catch (err) { next(err); }
};

// POST /api/questions/:id/approve (admin)
const approveQuestion = async (req, res, next) => {
  try {
    const question = await Question.findByIdAndUpdate(
      req.params.id,
      { isApproved: true, approvedBy: req.user._id, approvedAt: new Date() },
      { new: true }
    );
    if (!question) return next(createError('Question not found.', 404));
    res.json({ success: true, message: 'Question approved.', data: { question } });
  } catch (err) { next(err); }
};

module.exports = { getQuestions, getQuestion, createQuestion, updateQuestion, deleteQuestion, approveQuestion };
