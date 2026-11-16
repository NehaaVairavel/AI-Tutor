/**
 * create-admin.js
 * ---------------
 * Creates (or resets) the admin account.
 * Safe to run multiple times — uses upsert on email.
 *
 * Usage:
 *   node src/utils/create-admin.js
 *
 * Credentials set here:
 *   Email:    admin@aitutor.com
 *   Password: Admin@1234
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const User     = require('../models/User');
const connectDB = require('../config/db');

const ADMIN_EMAIL    = 'admin@aitutor.com';
const ADMIN_PASSWORD = 'Admin@1234';
const ADMIN_NAME     = 'Super Admin';

async function main() {
  await connectDB();

  const salt   = await bcrypt.genSalt(12);
  const hashed = await bcrypt.hash(ADMIN_PASSWORD, salt);

  const admin = await User.findOneAndUpdate(
    { email: ADMIN_EMAIL },
    {
      $set: {
        name:     ADMIN_NAME,
        email:    ADMIN_EMAIL,
        password: hashed,
        role:     'admin',
        isActive: true,
      },
    },
    { upsert: true, new: true, runValidators: false }
  );

  console.log('\n✅ Admin account ready');
  console.log('────────────────────────────────');
  console.log(`   ID:       ${admin._id}`);
  console.log(`   Name:     ${admin.name}`);
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log(`   Role:     ${admin.role}`);
  console.log('────────────────────────────────');
  console.log('\n   Login at: http://localhost:5173/login');
  console.log('   Admin:    http://localhost:5173/admin\n');

  await mongoose.connection.close();
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Failed to create admin:', err.message);
  process.exit(1);
});
