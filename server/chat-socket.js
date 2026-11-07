import { Server } from 'socket.io';
export function attachChatSocket(server, { authService, chatService, corsOrigins }) {
  const io = new Server(server, { cors: { origin: corsOrigins, credentials: false }, maxHttpBufferSize: 16384,
    allowRequest: (req, done) => done(null, !req.headers.origin || corsOrigins.includes(req.headers.origin)) });
  const room = id => `user:${id}`;
  io.use(async (socket, next) => {
    try { socket.data.identity = await authService.authenticate(socket.handshake.auth?.token); next(); }
    catch { next(new Error('Phiên đăng nhập không hợp lệ')); }
  });
  // Validate recipients as well as senders: an idle invalidated socket cannot keep receiving.
  chatService.setPublisher((recipients, event, payload) => {
    for (const id of recipients) for (const socket of io.sockets.sockets.values()) {
      if (socket.data.identity.id !== id) continue;
      void authService.authenticate(socket.handshake.auth?.token).then(() => {
        if (socket.connected) socket.emit(event, payload);
      }, () => socket.disconnect(true));
    }
  });
  io.on('connection', socket => {
    socket.join(room(socket.data.identity.id));
    let count = 0, start = Date.now();
    const action = (event, handler) => socket.on(event, async (body, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        if (Date.now() - start >= 60000) { start = Date.now(); count = 0; }
        if (++count > 120) { reply({ success: false, message: 'Quá nhiều yêu cầu' }); return; }
        const identity = await authService.authenticate(socket.handshake.auth?.token);
        reply({ success: true, data: await handler(identity, body) });
      } catch (error) {
        reply({ success: false, message: error.status ? error.message : 'Không thể xử lý tin nhắn' });
        if ([401, 403].includes(error.status)) socket.disconnect(true);
      }
    });
    action('conversation:join', (identity, body) => chatService.member(identity, body?.conversationId).then(() => null));
    action('message:send', (identity, body) => chatService.send(identity, body?.conversationId, body));
    action('message:read', (identity, body) => chatService.read(identity, body?.conversationId, body).then(() => null));
    const timer = setInterval(() => { void authService.authenticate(socket.handshake.auth?.token).catch(() => socket.disconnect(true)); }, 15000);
    timer.unref();
    socket.on('disconnect', () => clearInterval(timer));
  });
  return io;
}
