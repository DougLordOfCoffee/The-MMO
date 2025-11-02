const socket = io(); // assumes same origin (served by server)
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let W = canvas.width = innerWidth;
let H = canvas.height = innerHeight;
addEventListener('resize', () => { W = canvas.width = innerWidth; H = canvas.height = innerHeight; });

const ui = {
  logEl: document.getElementById('log'),
  joinBtn: document.getElementById('joinBtn'),
  nameInput: document.getElementById('nameInput'),
  chatBox: document.getElementById('chatBox')
};
function log(msg){ const d=document.createElement('div'); d.textContent=msg; ui.logEl.appendChild(d); ui.logEl.scrollTop = ui.logEl.scrollHeight; }

// networking state
let clientId = null;
let world = { width:2000, height:2000 };
const players = {}; // id -> {id,x,y,name, renderX,renderY}

// camera
const camera = { x:0, y:0, zoom:1 };

let keys = { up:false, down:false, left:false, right:false };
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'w') keys.up = true;
  if (e.key === 'ArrowDown' || e.key === 's') keys.down = true;
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = true;

  if (e.key === 'Enter' && document.activeElement === ui.chatBox) {
    const txt = ui.chatBox.value.trim();
    if (txt) { socket.emit('chat', txt); ui.chatBox.value = ''; }
  }
});
addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp' || e.key === 'w') keys.up = false;
  if (e.key === 'ArrowDown' || e.key === 's') keys.down = false;
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
});

// send input at a fast rate
setInterval(() => {
  socket.emit('input', { up: keys.up, down: keys.down, left: keys.left, right: keys.right, speed: 220 });
}, 50); // 20Hz

// server messages
socket.on('connect', () => log('connected to server'));
socket.on('joined', (data) => {
  clientId = data.id;
  world = data.world || world;
  log('joined as ' + clientId);
});
socket.on('snapshot', (snap) => {
  // update players store; keep previous positions for interpolation
  const now = Date.now();
  for (const p of snap.players) {
    if (!players[p.id]) players[p.id] = { id: p.id, x:p.x, y:p.y, renderX:p.x, renderY:p.y, name:p.name };
    else {
      players[p.id].x = p.x;
      players[p.id].y = p.y;
    }
  }
  // remove players that disappeared
  const ids = new Set(snap.players.map(p=>p.id));
  for (const id in players) if (!ids.has(id)) delete players[id];
});

// simple events
socket.on('chat', (m) => log(`${m.name}: ${m.text}`));
socket.on('playerJoined', p => log(`+ ${p.name} joined`));
socket.on('playerLeft', p => log(`- player left ${p.id}`));

// join action
ui.joinBtn.addEventListener('click', () => {
  const name = ui.nameInput.value.trim() || undefined;
  socket.emit('join', { name });
});

// render loop with interpolation
let last = performance.now();
function frame(t) {
  const dt = (t - last) / 1000; last = t;

  // simple camera follow
  const me = players[clientId];
  if (me) {
    camera.x += (me.x - camera.x) * 0.1;
    camera.y += (me.y - camera.y) * 0.1;
  }

  // clear
  ctx.clearRect(0,0,W,H);

  // draw background
  ctx.fillStyle = '#071024';
  ctx.fillRect(0,0,W,H);

  // draw grid for scale
  const gridSize = 64;
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.beginPath();
  const offsetX = - (camera.x % gridSize);
  const offsetY = - (camera.y % gridSize);
  for (let x = offsetX; x < W; x += gridSize) { ctx.moveTo(x,0); ctx.lineTo(x,H); }
  for (let y = offsetY; y < H; y += gridSize) { ctx.moveTo(0,y); ctx.lineTo(W,y); }
  ctx.stroke();

  // update render positions (lerp) and draw players
  for (const id in players) {
    const p = players[id];
    // simple lerp
    p.renderX += (p.x - p.renderX) * 0.2;
    p.renderY += (p.y - p.renderY) * 0.2;

    // screen pos
    const sx = (p.renderX - camera.x) + W/2;
    const sy = (p.renderY - camera.y) + H/2;

    // draw circle
    ctx.beginPath();
    ctx.fillStyle = (id === clientId) ? '#7c3aed' : '#2dd4bf';
    ctx.arc(sx, sy, 14, 0, Math.PI*2);
    ctx.fill();

    // name
    ctx.fillStyle = '#fff';
    ctx.font = '12px Inter, Arial';
    ctx.textAlign = 'center';
    ctx.fillText(p.name || 'anon', sx, sy - 22);
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

