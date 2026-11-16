require('dotenv').config();
const http       = require('http');
const app        = require('./app');
const connectDB  = require('./config/db');
const { initIO } = require('./socketio');

const PORT = process.env.PORT || 5000;

// ─── Validate required environment variables ───────────────────────────────
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  console.error('   Please check your .env file.');
  process.exit(1);
}

// ─── Connect to MongoDB, then start HTTP + Socket.IO server ───────────────
connectDB()
  .then(() => {
    // Create a raw http.Server so Socket.IO can attach to it
    const server = http.createServer(app);

    // Initialise Socket.IO (must happen before server.listen)
    initIO(server);

    server.listen(PORT, () => {
      console.log(`\n🚀 AI Tutor Server running on port ${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   URL: http://localhost:${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/api/health`);
      console.log(`   Socket.IO: enabled\n`);
    });

    // ─── Graceful shutdown ───────────────────────────────────────────────
    const shutdown = (signal) => {
      console.log(`\n${signal} received — shutting down gracefully...`);
      server.close(async () => {
        try {
          const mongoose = require('mongoose');
          await mongoose.connection.close();
          console.log('✅ MongoDB connection closed.');
        } catch (_) {}
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
  })
  .catch((err) => {
    console.error('❌ Failed to connect to MongoDB:', err.message);
    console.error('   Verify MONGODB_URI in your .env file and ensure MongoDB is running.');
    process.exit(1);
  });
