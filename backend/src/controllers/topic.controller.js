const Topic = require('../models/Topic');
const { createError } = require('../utils/helpers');

const getTopics = async (req, res, next) => {
  try {
    const { subjectId, examId } = req.query;
    const filter = { isActive: true };
    if (subjectId) filter.subject = subjectId;
    if (examId) filter.exam = examId;
    const topics = await Topic.find(filter)
      .populate('subject', 'name')
      .populate('exam', 'name shortName')
      .sort({ order: 1, name: 1 });
    res.json({ success: true, message: 'Topics retrieved.', data: { topics } });
  } catch (err) { next(err); }
};

const getTopic = async (req, res, next) => {
  try {
    const topic = await Topic.findById(req.params.id).populate('subject exam');
    if (!topic) return next(createError('Topic not found.', 404));
    res.json({ success: true, message: 'Topic retrieved.', data: { topic } });
  } catch (err) { next(err); }
};

const createTopic = async (req, res, next) => {
  try {
    const topic = await Topic.create(req.body);
    res.status(201).json({ success: true, message: 'Topic created.', data: { topic } });
  } catch (err) { next(err); }
};

const updateTopic = async (req, res, next) => {
  try {
    const topic = await Topic.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!topic) return next(createError('Topic not found.', 404));
    res.json({ success: true, message: 'Topic updated.', data: { topic } });
  } catch (err) { next(err); }
};

const deleteTopic = async (req, res, next) => {
  try {
    const topic = await Topic.findByIdAndDelete(req.params.id);
    if (!topic) return next(createError('Topic not found.', 404));
    res.json({ success: true, message: 'Topic deleted.' });
  } catch (err) { next(err); }
};

module.exports = { getTopics, getTopic, createTopic, updateTopic, deleteTopic };
