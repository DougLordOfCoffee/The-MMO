const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, '..', 'client')));

// Simple in-memory world
const players = {}; // socketId -> {id, x, y, vx, vy, name, lastUpdate}

const WORLD = { width: 4000, height: 4000 }; // big world

// Server tick: authoritative update loop
const TICK_RATE = 20; // 20 ticks/sec
setInterval(() => {
  // Update minimal physics (apply velocities)
  for (const id in players) {
    const p = players[id];
    p.x += p.vx / TICK_RATE;
    p.y += p.vy / TICK_RATE;
    // clamp to world
    p.x = Math.max(0, Math.min(WORLD.width, p.x));
    p.y = Math.max(0, Math.min(WORLD.height, p.y));
    p.lastUpdate = Date.now();
  }
  // Broadcast snapshot
  const snapshot = Object.values(players).map(p => ({
    id: p.id, x: p.x, y: p.y, name: p.name
  }));
  io.emit('snapshot', { players: snapshot, t: Date.now() });
}, 1000 / TICK_RATE);

io.on('connection', socket => {
  console.log('connect', socket.id);

  socket.on('join', (meta) => {
    const spawnX = Math.random() * WORLD.width;
    const spawnY = Math.random() * WORLD.height;
    players[socket.id] = {
      id: socket.id, x: spawnX, y: spawnY, vx:0, vy:0,
      name: meta?.name || 'anon' + socket.id.slice(0,4),
      lastUpdate: Date.now()
    };
    // send initial join ack
    socket.emit('joined', { id: socket.id, x: spawnX, y: spawnY, world: WORLD });
    // let others know (optional instant add)
    io.emit('playerJoined', { id: socket.id, x: spawnX, y: spawnY, name: players[socket.id].name });
  });

  socket.on('input', (input) => {
    // input example: { up: bool, down: bool, left: bool, right: bool, speed: number }
    const p = players[socket.id];
    if (!p) return;
    const speed = input.speed || 200; // px per sec
    let vx = 0, vy = 0;
    if (input.left) vx -= speed;
    if (input.right) vx += speed;
    if (input.up) vy -= speed;
    if (input.down) vy += speed;
    // normalize diagonal
    if (vx !== 0 && vy !== 0) {
      const inv = Math.SQRT1_2;
      vx *= inv; vy *= inv;
    }
    p.vx = vx; p.vy = vy;
  });

  socket.on('chat', (msg) => {
    // Broadcast chat from this player
    const p = players[socket.id];
    io.emit('chat', { id: socket.id, name: p?.name || 'anon', text: String(msg).slice(0,300) });
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    delete players[socket.id];
    io.emit('playerLeft', { id: socket.id });
  });
});

server.listen(PORT, () => {
  console.log('Server listening on', PORT);
});

