const Subject = require('../models/Subject');
const { createError } = require('../utils/helpers');

const getSubjects = async (req, res, next) => {
  try {
    const { examId } = req.query;
    const filter = { isActive: true };
    if (examId) filter.exam = examId;
    const subjects = await Subject.find(filter).populate('exam', 'name shortName').sort({ order: 1, name: 1 });
    res.json({ success: true, message: 'Subjects retrieved.', data: { subjects } });
  } catch (err) { next(err); }
};

const getSubject = async (req, res, next) => {
  try {
    const subject = await Subject.findById(req.params.id).populate('exam', 'name shortName');
    if (!subject) return next(createError('Subject not found.', 404));
    res.json({ success: true, message: 'Subject retrieved.', data: { subject } });
  } catch (err) { next(err); }
};

const createSubject = async (req, res, next) => {
  try {
    const subject = await Subject.create(req.body);
    res.status(201).json({ success: true, message: 'Subject created.', data: { subject } });
  } catch (err) { next(err); }
};

const updateSubject = async (req, res, next) => {
  try {
    const subject = await Subject.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!subject) return next(createError('Subject not found.', 404));
    res.json({ success: true, message: 'Subject updated.', data: { subject } });
  } catch (err) { next(err); }
};

const deleteSubject = async (req, res, next) => {
  try {
    const subject = await Subject.findByIdAndDelete(req.params.id);
    if (!subject) return next(createError('Subject not found.', 404));
    res.json({ success: true, message: 'Subject deleted.' });
  } catch (err) { next(err); }
};

module.exports = { getSubjects, getSubject, createSubject, updateSubject, deleteSubject };
