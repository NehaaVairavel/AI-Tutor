/**
 * socketio.js
 * -----------
 * Initialises Socket.IO on the HTTP server, authenticates connections via JWT,
 * and exposes getIO() so controllers can emit events without circular imports.
 *
 * Security model:
 *  - Every connection must supply a valid JWT as `auth.token` or query `?token=`.
 *  - Clients whose user.role === 'admin' are joined to 'admin-room'.
 *  - Normal users cannot join admin-room or subscribe to admin:* events.
 */

const { Server } = require('socket.io');
const jwt        = require('jsonwebtoken');
const User       = require('./models/User');

let _io = null;

/**
 * Initialise Socket.IO on an existing http.Server instance.
 * Call once from server.js after app.listen().
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
function initIO(httpServer) {
  _io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // ── JWT authentication middleware ────────────────────────────────────────────
  _io.use(async (socket, next) => {
    try {
      // Accept token from socket auth object or query string
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Authentication required.'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('_id name role isActive');

      if (!user)           return next(new Error('User no longer exists.'));
      if (!user.isActive)  return next(new Error('Account deactivated.'));

      socket.user = { _id: user._id, name: user.name, role: user.role };
      next();
    } catch (err) {
      next(new Error('Invalid or expired token.'));
    }
  });

  // ── Connection handler ───────────────────────────────────────────────────────
  _io.on('connection', (socket) => {
    const { _id, name, role } = socket.user;

    if (role === 'admin') {
      socket.join('admin-room');
      console.log(`[Socket] Admin connected: ${name} (${_id})`);
    } else {
      // Students get a personal room only — they cannot join admin-room
      socket.join(`user:${_id}`);
    }

    socket.on('disconnect', () => {
      if (role === 'admin') {
        console.log(`[Socket] Admin disconnected: ${name}`);
      }
    });
  });

  return _io;
}

/**
 * Return the initialised Socket.IO instance, or null if not yet started.
 * Safe to call from any module.
 * @returns {import('socket.io').Server|null}
 */
function getIO() {
  return _io;
}

module.exports = { initIO, getIO };
