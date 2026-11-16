const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    // Optional structured data from AI
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: null,
    },
    tokensUsed: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const chatSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      default: 'New Chat',
    },
    // Context for AI personalization
    context: {
      exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', default: null },
      subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
      topic: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', default: null },
      questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', default: null },
      practiceSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'PracticeSession', default: null },
    },
    messages: [chatMessageSchema],
    isActive: { type: Boolean, default: true },
    totalTokensUsed: { type: Number, default: 0 },
  },
  { timestamps: true }
);

chatSessionSchema.index({ user: 1, createdAt: -1 });
chatSessionSchema.index({ user: 1, isActive: 1 });

module.exports = mongoose.model('ChatSession', chatSessionSchema);
