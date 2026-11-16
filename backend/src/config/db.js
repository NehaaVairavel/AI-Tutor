const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set.');
  }

  // Log the host only — never log credentials or the full URI
  const host = uri.includes('@')
    ? uri.split('@')[1].split('/')[0]
    : uri.replace('mongodb://', '').split('/')[0];

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    console.log(`   Database: ${conn.connection.name}`);
    return conn;
  } catch (err) {
    // Safe error — no URI or credentials in the message
    const isLocalhost = uri.includes('localhost') || uri.includes('127.0.0.1');
    if (isLocalhost) {
      console.error(`❌ Cannot connect to local MongoDB at ${host}`);
      console.error('   Make sure mongod is running (use start.bat or run mongod manually).');
    } else {
      console.error(`❌ Cannot connect to MongoDB at ${host}`);
      console.error('   Check network access, Atlas IP whitelist, and credentials in .env');
    }
    throw err;
  }
};

// Handle post-connection events
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  console.error(`❌ MongoDB error: ${err.message}`);
});

module.exports = connectDB;
