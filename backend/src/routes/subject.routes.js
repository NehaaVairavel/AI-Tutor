const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getSubjects, getSubject, createSubject, updateSubject, deleteSubject } = require('../controllers/subject.controller');

router.get('/', getSubjects);
router.get('/:id', getSubject);
router.post('/', protect, adminOnly, createSubject);
router.put('/:id', protect, adminOnly, updateSubject);
router.delete('/:id', protect, adminOnly, deleteSubject);

module.exports = router;
