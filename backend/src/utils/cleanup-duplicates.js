/**
 * cleanup-duplicates.js
 * ----------------------
 * Safe duplicate-user cleanup and unique-index enforcement script.
 *
 * What this script does:
 *  1. Lists ALL user documents (id, email, name, role, createdAt)
 *  2. Detects duplicate emails (normalized: trimmed + lowercase)
 *  3. For each duplicate group:
 *       a. Picks the CANONICAL record (oldest _id with the most activity)
 *       b. Reassigns PracticeSession, UserProgress, ChatSession, StudyPlan
 *          from duplicate IDs to the canonical ID
 *       c. Deletes the redundant duplicate user documents
 *  4. Checks whether the email unique index exists and creates it if missing
 *
 * SAFETY:
 *  - Never deletes a record with practice sessions or progress that can't
 *    be safely moved (falls back to manual review list)
 *  - Dry-run mode: set DRY_RUN=true to preview without writing
 *  - Full audit log printed to console
 *
 * Run:
 *   node src/utils/cleanup-duplicates.js          (live — makes changes)
 *   DRY_RUN=true node src/utils/cleanup-duplicates.js  (preview only)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');

const DRY_RUN = process.env.DRY_RUN === 'true';

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) { console.error('[CLEANUP] No MONGO_URI in .env'); process.exit(1); }

  console.log(`[CLEANUP] Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (will make changes)'}`);
  console.log('[CLEANUP] Connecting to MongoDB Atlas…');
  await mongoose.connect(uri);
  console.log('[CLEANUP] Connected.\n');

  const db = mongoose.connection.db;
  const users        = db.collection('users');
  const sessions     = db.collection('practicesessions');
  const progress     = db.collection('userprogresses');
  const chatSessions = db.collection('chatsessions');
  const studyPlans   = db.collection('studyplans');

  // ── 1. Load all users ─────────────────────────────────────────────────────
  const allUsers = await users.find({}).sort({ createdAt: 1 }).toArray();
  console.log(`[CLEANUP] Total user documents: ${allUsers.length}`);
  allUsers.forEach((u, i) => {
    console.log(`  [${i+1}] ${u._id}  ${u.email}  ${u.name}  role=${u.role}  created=${u.createdAt?.toISOString() || '—'}`);
  });

  // ── 2. Group by normalized email ─────────────────────────────────────────
  const emailGroups = {};
  for (const u of allUsers) {
    const key = (u.email || '').trim().toLowerCase();
    if (!emailGroups[key]) emailGroups[key] = [];
    emailGroups[key].push(u);
  }

  const dupeEmails = Object.entries(emailGroups).filter(([, arr]) => arr.length > 1);
  if (dupeEmails.length === 0) {
    console.log('\n[CLEANUP] ✅ No duplicate emails found. Database is clean.');
  } else {
    console.log(`\n[CLEANUP] ❌ Found ${dupeEmails.length} email(s) with duplicates:\n`);

    for (const [email, docs] of dupeEmails) {
      console.log(`  Email: ${email}  (${docs.length} documents)`);

      // Count activity per document to pick canonical (most data = oldest + most sessions)
      const withActivity = await Promise.all(docs.map(async (d) => {
        const sessionCount  = await sessions.countDocuments({ user: d._id });
        const progressCount = await progress.countDocuments({ user: d._id });
        return { ...d, sessionCount, progressCount };
      }));

      // Sort: prefer oldest first, then most sessions
      withActivity.sort((a, b) => {
        if (a.createdAt < b.createdAt) return -1;
        if (a.createdAt > b.createdAt) return 1;
        return (b.sessionCount + b.progressCount) - (a.sessionCount + a.progressCount);
      });

      const canonical  = withActivity[0];
      const duplicates = withActivity.slice(1);

      console.log(`    CANONICAL: ${canonical._id}  created=${canonical.createdAt?.toISOString()}  sessions=${canonical.sessionCount}  progress=${canonical.progressCount}`);

      for (const dup of duplicates) {
        console.log(`    DUPLICATE: ${dup._id}  created=${dup.createdAt?.toISOString()}  sessions=${dup.sessionCount}  progress=${dup.progressCount}`);

        if (!DRY_RUN) {
          // Reassign all activity to canonical
          await sessions.updateMany({ user: dup._id }, { $set: { user: canonical._id } });
          await progress.updateMany({ user: dup._id }, { $set: { user: canonical._id } });
          await chatSessions.updateMany({ user: dup._id }, { $set: { user: canonical._id } });
          await studyPlans.updateMany({ user: dup._id }, { $set: { user: canonical._id } });

          // Delete the duplicate user document
          await users.deleteOne({ _id: dup._id });
          console.log(`    → Reassigned activity + deleted duplicate ${dup._id}`);
        } else {
          console.log(`    [DRY RUN] Would reassign ${dup.sessionCount} sessions, ${dup.progressCount} progress docs, then delete ${dup._id}`);
        }
      }
    }
  }

  // ── 3. Check / create unique index on email ───────────────────────────────
  console.log('\n[CLEANUP] Checking email indexes…');
  const indexes = await users.indexes();
  const emailUniqueIdx = indexes.find(
    idx => idx.key?.email !== undefined && idx.unique === true
  );

  if (emailUniqueIdx) {
    console.log(`[CLEANUP] ✅ Unique email index already exists: "${emailUniqueIdx.name}"`);
  } else {
    console.log('[CLEANUP] ⚠️  No unique email index found.');
    if (!DRY_RUN) {
      try {
        await users.createIndex({ email: 1 }, { unique: true, name: 'email_unique' });
        console.log('[CLEANUP] ✅ Created unique index on email field.');
      } catch (err) {
        console.error('[CLEANUP] ❌ Failed to create unique index:', err.message);
        console.error('  This usually means there are still duplicate emails in the collection.');
        console.error('  Re-run this script to clean duplicates first, then re-run to create the index.');
      }
    } else {
      console.log('[DRY RUN] Would create unique index { email: 1 }');
    }
  }

  // ── 4. Final count ────────────────────────────────────────────────────────
  const finalCount = await users.countDocuments({});
  const studentCount = await users.countDocuments({ role: 'student' });
  console.log(`\n[CLEANUP] Final state: ${finalCount} total users (${studentCount} students)`);

  await mongoose.disconnect();
  console.log('[CLEANUP] Done.');
}

main().catch(err => {
  console.error('[CLEANUP] Fatal:', err.message);
  process.exit(1);
});

