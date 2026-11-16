const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const { getTopics, getTopic, createTopic, updateTopic, deleteTopic } = require('../controllers/topic.controller');

router.get('/', getTopics);
router.get('/:id', getTopic);
router.post('/', protect, adminOnly, createTopic);
router.put('/:id', protect, adminOnly, updateTopic);
router.delete('/:id', protect, adminOnly, deleteTopic);

module.exports = router;
