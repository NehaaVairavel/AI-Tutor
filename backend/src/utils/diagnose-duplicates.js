/**
 * diagnose-duplicates.js
 * ----------------------
 * Connects to MongoDB Atlas and reports:
 *  1. All users in the database (id, email, name, role, createdAt)
 *  2. Any email addresses that appear more than once
 *  3. The email unique index status on the users collection
 *
 * Run: node src/utils/diagnose-duplicates.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('[DIAG] ERROR: No MONGO_URI or MONGODB_URI in .env');
    process.exit(1);
  }

  console.log('[DIAG] Connecting to MongoDB Atlas…');
  await mongoose.connect(uri);
  console.log('[DIAG] Connected.\n');

  const db = mongoose.connection.db;
  const users = db.collection('users');

  // ── 1. All users ──────────────────────────────────────────────────────────
  const allUsers = await users.find({}, {
    projection: { _id: 1, email: 1, name: 1, role: 1, createdAt: 1, educationStatus: 1 }
  }).sort({ email: 1, createdAt: 1 }).toArray();

  console.log(`[DIAG] Total documents in users collection: ${allUsers.length}\n`);
  console.log('[DIAG] All user records:');
  allUsers.forEach((u, i) => {
    console.log(
      `  [${i + 1}] _id=${u._id}  email=${u.email}  name=${u.name}` +
      `  role=${u.role}  edu=${u.educationStatus || '—'}  createdAt=${u.createdAt?.toISOString() || '—'}`
    );
  });

  // ── 2. Duplicate email detection ─────────────────────────────────────────
  const emailGroups = {};
  for (const u of allUsers) {
    const normalized = (u.email || '').trim().toLowerCase();
    if (!emailGroups[normalized]) emailGroups[normalized] = [];
    emailGroups[normalized].push(u);
  }

  const duplicates = Object.entries(emailGroups).filter(([, arr]) => arr.length > 1);

  if (duplicates.length === 0) {
    console.log('\n[DIAG] ✅ No duplicate emails found in the database.');
    console.log('[DIAG] The four rows are likely a rendering/display issue, not a DB issue.');
  } else {
    console.log(`\n[DIAG] ❌ Found ${duplicates.length} email(s) with duplicate documents:`);
    for (const [email, docs] of duplicates) {
      console.log(`\n  Email: ${email}  (${docs.length} documents)`);
      docs.forEach(d => {
        console.log(
          `    _id=${d._id}  name=${d.name}  role=${d.role}  createdAt=${d.createdAt?.toISOString() || '—'}`
        );
      });
    }
  }

  // ── 3. Index inspection ───────────────────────────────────────────────────
  console.log('\n[DIAG] Indexes on users collection:');
  const indexes = await users.indexes();
  indexes.forEach(idx => {
    const keys = JSON.stringify(idx.key);
    const flags = [
      idx.unique ? 'UNIQUE' : null,
      idx.sparse ? 'SPARSE' : null,
      idx.background ? 'BACKGROUND' : null,
    ].filter(Boolean).join(', ');
    console.log(`  ${idx.name}  keys=${keys}  ${flags}`);
  });

  // ── 4. Practice sessions per user ────────────────────────────────────────
  console.log('\n[DIAG] Practice sessions per user:');
  const sessions = db.collection('practicesessions');
  for (const u of allUsers) {
    if (u.role === 'admin') continue;
    const count = await sessions.countDocuments({ user: u._id });
    console.log(`  ${u._id}  ${u.email}  sessions=${count}`);
  }

  // ── 5. UserProgress per user ──────────────────────────────────────────────
  console.log('\n[DIAG] UserProgress records per user:');
  const progress = db.collection('userprogresses');
  for (const u of allUsers) {
    if (u.role === 'admin') continue;
    const progs = await progress.find({ user: u._id }).toArray();
    if (progs.length === 0) {
      console.log(`  ${u._id}  ${u.email}  progress=none`);
    } else {
      for (const p of progs) {
        console.log(
          `  ${u._id}  ${u.email}  exam=${p.exam}  ` +
          `q=${p.totalQuestionsAttempted}  acc=${p.overallAccuracy}%  ` +
          `streak=${p.currentStreak}`
        );
      }
    }
  }

  await mongoose.disconnect();
  console.log('\n[DIAG] Done. Disconnected.');
}

main().catch(err => {
  console.error('[DIAG] Fatal error:', err.message);
  process.exit(1);
});

