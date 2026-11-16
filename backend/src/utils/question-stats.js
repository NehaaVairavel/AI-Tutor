/**
 * question-stats.js
 * Prints a summary of the question bank distribution to the console.
 *
 * Usage (run from the backend directory):
 *   node src/utils/question-stats.js
 *
 * Requires a valid MONGODB_URI in your .env (or environment).
 */

require('dotenv').config();
const mongoose = require('mongoose');

const DEFAULT_DISTRIBUTION = {
  single_choice:    35,
  multiple_select:  15,
  matching:         15,
  statement_based:  10,
  assertion_reason: 10,
  true_false:        5,
  fill_blank:        5,
  passage_based:     5,
};

const TYPE_LABELS = {
  single_choice:    'Single Choice MCQ',
  multiple_select:  'Multiple Select',
  matching:         'Match the Following',
  statement_based:  'Statement Based',
  assertion_reason: 'Assertion & Reason',
  true_false:       'True / False',
  fill_blank:       'Fill in the Blank',
  passage_based:    'Passage Based',
};

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌  MONGODB_URI is not set. Add it to your .env file.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB Atlas…');
  await mongoose.connect(uri);
  console.log('Connected.\n');

  // Lazy-load the Question model (avoids import errors if run standalone)
  let Question;
  try {
    Question = require('../models/Question');
  } catch {
    Question = mongoose.model(
      'Question',
      new mongoose.Schema({}, { strict: false }),
      'questions'
    );
  }

  const total = await Question.countDocuments({ isActive: { $ne: false } });
  console.log(`Total active questions: ${total}\n`);

  if (total === 0) {
    console.log('No questions found in the database.');
    await mongoose.disconnect();
    return;
  }

  // Aggregate by type
  const byTypeAgg = await Question.aggregate([
    { $match: { isActive: { $ne: false } } },
    { $group: { _id: '$questionType', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const byType = {};
  byTypeAgg.forEach(({ _id, count }) => { byType[_id || 'single_choice'] = count; });

  console.log('─── Distribution by Question Type ─────────────────────────');
  const allTypes = Object.keys(DEFAULT_DISTRIBUTION);
  const gaps = [];

  allTypes.forEach(type => {
    const count  = byType[type] || 0;
    const pct    = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
    const target = DEFAULT_DISTRIBUTION[type];
    const met    = parseFloat(pct) >= target;
    const gap    = met ? '' : ` ← BELOW TARGET (${target}%, needs ~${Math.ceil(total * target / 100) - count} more)`;
    const icon   = met ? '✅' : '⚠️ ';
    console.log(`  ${icon} ${(TYPE_LABELS[type] || type).padEnd(24)} ${String(count).padStart(4)} questions  (${String(pct).padStart(5)}%${gap})`);
    if (!met) gaps.push({ type, count, pct: parseFloat(pct), target, needed: Math.ceil(total * target / 100) - count });
  });

  // Types in DB not in our list
  Object.keys(byType).forEach(type => {
    if (!allTypes.includes(type)) {
      console.log(`  ℹ️  ${(type || 'unknown').padEnd(24)} ${String(byType[type]).padStart(4)} questions  (legacy/unknown type)`);
    }
  });

  // Approved vs pending
  const pending  = await Question.countDocuments({ isActive: { $ne: false }, isApproved: false });
  const approved = total - pending;
  console.log('\n─── Approval Status ──────────────────────────────────────');
  console.log(`  ✅ Approved : ${approved}`);
  console.log(`  ⏳ Pending  : ${pending}`);

  // Difficulty breakdown
  const byDiffAgg = await Question.aggregate([
    { $match: { isActive: { $ne: false } } },
    { $group: { _id: '$difficulty', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  console.log('\n─── Difficulty Breakdown ─────────────────────────────────');
  byDiffAgg.forEach(({ _id, count }) => {
    console.log(`  ${(_id || 'unknown').padEnd(10)} ${count}`);
  });

  // Gaps summary
  if (gaps.length > 0) {
    console.log('\n─── Content Gaps (use "Generate with AI" to fill) ────────');
    gaps.forEach(g => {
      console.log(`  ${TYPE_LABELS[g.type].padEnd(24)} needs ~${g.needed} more questions to reach ${g.target}% target`);
    });
  } else {
    console.log('\n✅ All question types meet or exceed their distribution targets.');
  }

  console.log('');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

