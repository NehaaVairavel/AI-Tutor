/**
 * exam.controller.js
 * ------------------
 * CRUD operations for Exams.
 *
 * Deletion strategy — safe archive, not hard-delete:
 *   An exam cannot be safely hard-deleted if any of the following exist:
 *     • Practice sessions that reference it
 *     • Student users who have it as their targetExam
 *     • UserProgress records tied to it
 *
 *   When any dependency is found the exam is ARCHIVED (isActive = false)
 *   instead of deleted.  This preserves all historical student data while
 *   immediately hiding the exam from student-facing dropdowns and new
 *   practice-session creation.
 *
 *   A truly unused exam (zero dependencies) is hard-deleted.
 *
 * The response always includes an `action` field:
 *   'archived'  — exam deactivated; historical data preserved
 *   'deleted'   — no dependencies; hard-deleted from the database
 */

const Exam            = require('../models/Exam');
const Question        = require('../models/Question');
const PracticeSession = require('../models/PracticeSession');
const UserProgress    = require('../models/UserProgress');
const User            = require('../models/User');
const { createError } = require('../utils/helpers');

// GET /api/exams
const getExams = async (req, res, next) => {
  try {
    const { category, isActive } = req.query;
    const filter = {};
    if (category) filter.category = category;
    // Default: return only active exams; pass isActive=all to return all
    if (isActive !== 'all') {
      filter.isActive = isActive === 'false' ? false : true;
    }

    const exams = await Exam.find(filter).sort({ order: 1, name: 1 });
    res.json({ success: true, message: 'Exams retrieved.', data: { exams } });
  } catch (err) { next(err); }
};

// GET /api/exams/:id
const getExam = async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return next(createError('Exam not found.', 404));
    res.json({ success: true, message: 'Exam retrieved.', data: { exam } });
  } catch (err) { next(err); }
};

// POST /api/exams (admin)
const createExam = async (req, res, next) => {
  try {
    const exam = await Exam.create(req.body);
    res.status(201).json({ success: true, message: 'Exam created.', data: { exam } });
  } catch (err) { next(err); }
};

// PUT /api/exams/:id (admin)
const updateExam = async (req, res, next) => {
  try {
    const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!exam) return next(createError('Exam not found.', 404));
    res.json({ success: true, message: 'Exam updated.', data: { exam } });
  } catch (err) { next(err); }
};

// DELETE /api/exams/:id (admin)
// Safe delete: archives if dependencies exist, hard-deletes if unused.
const deleteExam = async (req, res, next) => {
  try {
    const { id } = req.params;
    const exam = await Exam.findById(id);
    if (!exam) return next(createError('Exam not found.', 404));

    // ── Dependency check (parallel) ─────────────────────────────────────────
    const [sessionCount, userCount, progressCount, questionCount] = await Promise.all([
      PracticeSession.countDocuments({ exam: id }),
      User.countDocuments({ targetExam: id }),
      UserProgress.countDocuments({ exam: id }),
      Question.countDocuments({ exam: id }),
    ]);

    const hasDependencies = sessionCount > 0 || userCount > 0 || progressCount > 0;

    if (hasDependencies) {
      // Soft-delete: mark inactive so it disappears from student-facing views
      // but all historical student records remain intact.
      await Exam.findByIdAndUpdate(id, { isActive: false });

      return res.json({
        success: true,
        action: 'archived',
        message: `Exam archived (not deleted). ${sessionCount} session(s), ${userCount} student target(s), and ${progressCount} progress record(s) reference this exam — historical data is preserved.`,
        data: {
          examId: id,
          dependencies: { sessionCount, userCount, progressCount, questionCount },
        },
      });
    }

    // No dependencies — safe to hard-delete the exam.
    // Also clean up orphaned questions that belong only to this exam.
    await Promise.all([
      Exam.findByIdAndDelete(id),
      Question.deleteMany({ exam: id }),
    ]);

    res.json({
      success: true,
      action: 'deleted',
      message: 'Exam permanently deleted (no historical student data was affected).',
      data: { examId: id, questionsRemoved: questionCount },
    });
  } catch (err) { next(err); }
};

module.exports = { getExams, getExam, createExam, updateExam, deleteExam };
