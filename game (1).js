// ============================================================
// SUBWAY DASH — a Subway-Surfers-style endless lane runner
// Pure HTML5 Canvas + vanilla JS, no dependencies.
// ============================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const W = canvas.width;   // 400
const H = canvas.height;  // 700

const LANE_COUNT = 3;
const LANE_WIDTH = W / LANE_COUNT;
const GROUND_Y = H - 120;

// ---------- Persistent best score (falls back gracefully) ----------
let bestScore = 0;
try {
  bestScore = parseInt(localStorage.getItem('subwayDashBest') || '0', 10) || 0;
} catch (e) {
  bestScore = 0;
}
document.getElementById('best').textContent = bestScore;

function saveBest(score) {
  bestScore = Math.max(bestScore, score);
  try { localStorage.setItem('subwayDashBest', String(bestScore)); } catch (e) { /* ignore */ }
}

// ---------- Game state ----------
let state = 'menu'; // 'menu' | 'playing' | 'gameover'
let lastTime = 0;
let elapsed = 0;

let speed = 300;          // px/sec, world scroll speed
const BASE_SPEED = 300;
const MAX_SPEED = 780;

let distance = 0;
let coinsCollected = 0;
let score = 0;

let spawnTimer = 0;
let spawnInterval = 1.05; // seconds, shrinks over time

let obstacles = []; // {type, lane, y, w, h, hit, isCoin}
let particles = []; // simple crash / coin particles

// ---------- Player ----------
const player = {
  lane: 1,
  x: 0,           // current x (eased toward target lane)
  targetLaneX: 0,
  y: GROUND_Y,
  w: 46,
  h: 70,
  jumpZ: 0,       // visual height offset while jumping
  isJumping: false,
  isSliding: false,
  slideTimer: 0,
  runFrame: 0,
  laneSwitchCooldown: 0,
};

function laneCenterX(lane) {
  return LANE_WIDTH * lane + LANE_WIDTH / 2;
}

function resetPlayer() {
  player.lane = 1;
  player.x = laneCenterX(1);
  player.targetLaneX = player.x;
  player.y = GROUND_Y;
  player.jumpZ = 0;
  player.isJumping = false;
  player.isSliding = false;
  player.slideTimer = 0;
  player.laneSwitchCooldown = 0;
}

// ---------- Cop (chaser) ----------
const COP_OFFSET_START = 130; // how far behind the player, in px, at run start
const COP_OFFSET_DANGER = 58; // how close the cop gets once the chase heats up
const COP_OFFSET_CAUGHT = 6;  // how close the cop gets when it catches you

const cop = {
  x: 0,
  y: 0,
  offsetY: COP_OFFSET_START,
  bob: 0,
};

function resetCop() {
  cop.offsetY = COP_OFFSET_START;
  cop.x = player.x;
  cop.y = player.y + cop.offsetY;
  cop.bob = 0;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function updateCop(dt) {
  if (state === 'menu') return;

  // The cop drifts toward the player's lane a little slower than the player
  // itself moves, which is what sells the "chasing" feel.
  cop.x += (player.x - cop.x) * Math.min(1, dt * 6);
  cop.bob += dt * 9;

  if (state === 'playing') {
    // The longer you survive (and the faster you go), the closer the cop gets.
    const dangerProgress = Math.min(1, elapsed / 25);
    const targetOffset = lerp(COP_OFFSET_START, COP_OFFSET_DANGER, dangerProgress);
    cop.offsetY += (targetOffset - cop.offsetY) * Math.min(1, dt * 1.5);
  } else if (state === 'gameover') {
    // Busted — the cop rushes in and grabs you.
    cop.offsetY += (COP_OFFSET_CAUGHT - cop.offsetY) * Math.min(1, dt * 9);
  }

  cop.y = player.y + cop.offsetY + Math.sin(cop.bob) * 3;
}

// ---------- Track scroll visuals ----------
let trackScroll = 0;

// ---------- Input ----------
function moveLane(dir) {
  if (state !== 'playing') return;
  const newLane = player.lane + dir;
  if (newLane < 0 || newLane >= LANE_COUNT) return;
  player.lane = newLane;
  player.targetLaneX = laneCenterX(newLane);
}

const JUMP_GRAVITY = 2200;
const JUMP_VELOCITY = -820;
let jumpVel = 0;

function doJump() {
  if (state !== 'playing') return;
  if (player.isSliding) return;
  if (!player.isJumping) {
    player.isJumping = true;
    jumpVel = JUMP_VELOCITY;
  }
}

function jumpPhysics(dt) {
  if (!player.isJumping) return;
  jumpVel += JUMP_GRAVITY * dt;
  player.jumpZ -= jumpVel * dt;
  if (player.jumpZ <= 0) {
    player.jumpZ = 0;
    player.isJumping = false;
    jumpVel = 0;
  }
}

function doSlide() {
  if (state !== 'playing') return;
  if (player.isJumping) return;
  if (!player.isSliding) {
    player.isSliding = true;
    player.slideTimer = 0.55;
  }
}

window.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowLeft':
    case 'a':
    case 'A':
      moveLane(-1);
      break;
    case 'ArrowRight':
    case 'd':
    case 'D':
      moveLane(1);
      break;
    case 'ArrowUp':
    case 'w':
    case 'W':
    case ' ':
      e.preventDefault();
      doJump();
      break;
    case 'ArrowDown':
    case 's':
    case 'S':
      doSlide();
      break;
  }
});

document.getElementById('btn-left').addEventListener('click', () => moveLane(-1));
document.getElementById('btn-right').addEventListener('click', () => moveLane(1));
document.getElementById('btn-jump').addEventListener('click', doJump);
document.getElementById('btn-slide').addEventListener('click', doSlide);

// Swipe support
let touchStartX = null, touchStartY = null;
canvas.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
}, { passive: true });

canvas.addEventListener('touchend', (e) => {
  if (touchStartX === null) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
    moveLane(dx > 0 ? 1 : -1);
  } else if (dy < -30) {
    doJump();
  } else if (dy > 30) {
    doSlide();
  }
  touchStartX = null;
  touchStartY = null;
}, { passive: true });

// ---------- Spawning ----------
function spawnWave() {
  const roll = Math.random();

  if (roll < 0.22) {
    // Coin arc across one lane
    const lane = Math.floor(Math.random() * LANE_COUNT);
    const coinCount = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < coinCount; i++) {
      obstacles.push({
        type: 'coin',
        lane,
        y: -60 - i * 42,
        w: 22,
        h: 22,
        hit: false,
      });
    }
  } else if (roll < 0.45) {
    // Single low barrier (jump over) in one lane
    const lane = Math.floor(Math.random() * LANE_COUNT);
    obstacles.push({ type: 'barrier', lane, y: -40, w: LANE_WIDTH - 30, h: 34, hit: false });
  } else if (roll < 0.68) {
    // Overhead bar (must slide under) in one lane
    const lane = Math.floor(Math.random() * LANE_COUNT);
    obstacles.push({ type: 'overhead', lane, y: -40, w: LANE_WIDTH - 30, h: 34, hit: false });
  } else if (roll < 0.9) {
    // Full-height train blocking 1 or 2 lanes — must dodge to a free lane
    const blockedCount = Math.random() < 0.5 ? 1 : 2;
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5).slice(0, blockedCount);
    lanes.forEach((lane) => {
      obstacles.push({ type: 'train', lane, y: -180, w: LANE_WIDTH - 20, h: 160, hit: false });
    });
  } else {
    // Mixed: train in one lane + coins in an open lane
    const trainLane = Math.floor(Math.random() * LANE_COUNT);
    obstacles.push({ type: 'train', lane: trainLane, y: -180, w: LANE_WIDTH - 20, h: 160, hit: false });
    const openLanes = [0, 1, 2].filter((l) => l !== trainLane);
    const coinLane = openLanes[Math.floor(Math.random() * openLanes.length)];
    for (let i = 0; i < 4; i++) {
      obstacles.push({ type: 'coin', lane: coinLane, y: -260 - i * 40, w: 22, h: 22, hit: false });
    }
  }
}

// ---------- Collision ----------
function playerBounds() {
  let h = player.h;
  let y = player.y - player.jumpZ;
  if (player.isSliding) {
    h = 36;
    y = player.y + (player.h - h);
  }
  return {
    x: player.x - player.w / 2,
    y: y - h,
    w: player.w,
    h: h,
  };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function checkCollisions() {
  const pb = playerBounds();
  for (const ob of obstacles) {
    if (ob.hit) continue;
    if (ob.lane !== player.lane) continue;

    const obRect = { x: LANE_WIDTH * ob.lane + (LANE_WIDTH - ob.w) / 2, y: ob.y, w: ob.w, h: ob.h };

    if (ob.type === 'coin') {
      if (rectsOverlap(pb, obRect)) {
        ob.hit = true;
        coinsCollected++;
        spawnCoinParticles(obRect.x + obRect.w / 2, obRect.y);
      }
      continue;
    }

    // For obstacles, only register collision near player's ground zone (obstacle reaches player)
    const playerZone = { x: LANE_WIDTH * player.lane, y: GROUND_Y - 90, w: LANE_WIDTH, h: 110 };
    if (!rectsOverlap(obRect, playerZone)) continue;

    if (ob.type === 'barrier') {
      // Must be jumping (feet above the barrier top) to avoid
      const clearedHeight = player.jumpZ > ob.h + 6;
      if (!clearedHeight && rectsOverlap(pb, obRect)) {
        triggerGameOver();
        return;
      }
    } else if (ob.type === 'overhead') {
      if (!player.isSliding && rectsOverlap(pb, obRect)) {
        triggerGameOver();
        return;
      }
    } else if (ob.type === 'train') {
      if (rectsOverlap(pb, obRect)) {
        triggerGameOver();
        return;
      }
    }
  }
}

// ---------- Particles ----------
function spawnCoinParticles(x, y) {
  for (let i = 0; i < 6; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 160,
      vy: -Math.random() * 180 - 40,
      life: 0.5,
      color: '#ffd93d',
      size: 3 + Math.random() * 2,
    });
  }
}

function spawnCrashParticles(x, y) {
  for (let i = 0; i < 24; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 420,
      vy: (Math.random() - 1) * 420,
      life: 0.9,
      color: Math.random() < 0.5 ? '#ff5c5c' : '#ffb84d',
      size: 3 + Math.random() * 4,
    });
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 700 * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
}

// ---------- Game flow ----------
function startGame() {
  state = 'playing';
  distance = 0;
  coinsCollected = 0;
  score = 0;
  speed = BASE_SPEED;
  spawnTimer = 0;
  spawnInterval = 1.05;
  obstacles = [];
  particles = [];
  trackScroll = 0;
  resetPlayer();
  resetCop();

  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('gameover-screen').classList.add('hidden');
  updateHUD();
}

function triggerGameOver() {
  if (state !== 'playing') return;
  state = 'gameover';
  spawnCrashParticles(player.x, player.y - player.h / 2);
  const finalScore = Math.floor(score);
  const isNewBest = finalScore > bestScore;
  saveBest(finalScore);

  document.getElementById('final-score-text').textContent = `Score: ${finalScore}  •  🪙 ${coinsCollected}`;
  document.getElementById('new-best-text').classList.toggle('hidden', !isNewBest);
  document.getElementById('best').textContent = bestScore;

  setTimeout(() => {
    document.getElementById('gameover-screen').classList.remove('hidden');
  }, 400);
}

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

function updateHUD() {
  document.getElementById('score').textContent = Math.floor(score);
  document.getElementById('coins').textContent = coinsCollected;
  document.getElementById('best').textContent = bestScore;
}

// ---------- Update ----------
function update(dt) {
  if (state !== 'playing') return;

  elapsed += dt;
  speed = Math.min(MAX_SPEED, BASE_SPEED + elapsed * 9);
  distance += speed * dt * 0.05;
  score = distance + coinsCollected * 10;

  trackScroll = (trackScroll + speed * dt) % 80;

  // Lane easing
  player.x += (player.targetLaneX - player.x) * Math.min(1, dt * 14);

  player.runFrame += dt * 10;

  // Slide timer
  if (player.isSliding) {
    player.slideTimer -= dt;
    if (player.slideTimer <= 0) player.isSliding = false;
  }

  // Spawn logic
  spawnTimer += dt;
  const currentInterval = Math.max(0.55, spawnInterval - elapsed * 0.01);
  if (spawnTimer >= currentInterval) {
    spawnTimer = 0;
    spawnWave();
  }

  // Move obstacles
  for (const ob of obstacles) {
    ob.y += speed * dt;
  }
  obstacles = obstacles.filter((ob) => ob.y < H + 200 && !(ob.hit && ob.type === 'coin'));

  updateParticles(dt);
  checkCollisions();
  updateHUD();
}

// ---------- Draw ----------
function drawBackground() {
  // Sky
  ctx.fillStyle = '#87ceeb';
  ctx.fillRect(0, 0, W, GROUND_Y - 80);

  // Distant buildings silhouette
  ctx.fillStyle = '#a9c6d9';
  for (let i = 0; i < 6; i++) {
    const bw = 50;
    const bx = (i * 70 - (trackScroll % 70));
    const bh = 60 + (i % 3) * 30;
    ctx.fillRect(bx, GROUND_Y - 80 - bh, bw, bh);
  }

  // Ground / track base
  ctx.fillStyle = '#3d4658';
  ctx.fillRect(0, GROUND_Y - 80, W, H - (GROUND_Y - 80));

  // Lane separators (ties)
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 4;
  for (let i = 1; i < LANE_COUNT; i++) {
    ctx.beginPath();
    ctx.moveTo(LANE_WIDTH * i, GROUND_Y - 80);
    ctx.lineTo(LANE_WIDTH * i, H);
    ctx.stroke();
  }

  // Scrolling track ties
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 6;
  for (let y = -80 + (trackScroll % 40); y < H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y - 80 + y);
    ctx.lineTo(W, GROUND_Y - 80 + y);
    ctx.stroke();
  }
}

function drawPlayer() {
  const bounceY = state === 'playing' ? Math.sin(player.runFrame) * 4 : 0;
  let h = player.h;
  let y = player.y - player.jumpZ + (player.isJumping ? 0 : bounceY);
  if (player.isSliding) h = 36;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + 6, player.w / 2, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = '#ff5c5c';
  roundRect(ctx, player.x - player.w / 2, y - h, player.w, h, 10);
  ctx.fill();

  // Head
  ctx.fillStyle = '#ffd6b0';
  ctx.beginPath();
  ctx.arc(player.x, y - h - 12, 14, 0, Math.PI * 2);
  ctx.fill();

  // Cap
  ctx.fillStyle = '#3d7dff';
  ctx.beginPath();
  ctx.arc(player.x, y - h - 16, 14, Math.PI, 0);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawObstacles() {
  for (const ob of obstacles) {
    if (ob.hit) continue;
    const cx = LANE_WIDTH * ob.lane + LANE_WIDTH / 2;

    if (ob.type === 'coin') {
      ctx.fillStyle = '#ffd93d';
      ctx.beginPath();
      ctx.arc(cx, ob.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#c98f00';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (ob.type === 'barrier') {
      ctx.fillStyle = '#f5a623';
      roundRect(ctx, cx - ob.w / 2, ob.y, ob.w, ob.h, 6);
      ctx.fill();
    } else if (ob.type === 'overhead') {
      ctx.fillStyle = '#7d5fff';
      roundRect(ctx, cx - ob.w / 2, ob.y, ob.w, ob.h, 6);
      ctx.fill();
    } else if (ob.type === 'train') {
      ctx.fillStyle = '#4a5568';
      roundRect(ctx, cx - ob.w / 2, ob.y, ob.w, ob.h, 8);
      ctx.fill();
      ctx.fillStyle = '#2d3748';
      ctx.fillRect(cx - ob.w / 2 + 8, ob.y + 12, ob.w - 16, 30);
      ctx.strokeStyle = '#1a202c';
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - ob.w / 2, ob.y, ob.w, ob.h);
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawCop() {
  const bounceY = Math.sin(cop.bob) * 4;
  const y = cop.y - bounceY;
  const w = player.w;
  const h = player.h;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cop.x, cop.y + 6, w / 2, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body (navy uniform)
  ctx.fillStyle = '#2b3a67';
  roundRect(ctx, cop.x - w / 2, y - h, w, h, 10);
  ctx.fill();

  // Badge
  ctx.fillStyle = '#ffd93d';
  ctx.beginPath();
  ctx.arc(cop.x - 10, y - h + 20, 4, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#e8b48c';
  ctx.beginPath();
  ctx.arc(cop.x, y - h - 12, 14, 0, Math.PI * 2);
  ctx.fill();

  // Cap
  ctx.fillStyle = '#1a2547';
  ctx.beginPath();
  ctx.arc(cop.x, y - h - 17, 14.5, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(cop.x - 16, y - h - 17, 32, 4);
  ctx.fillStyle = '#ffd93d';
  ctx.beginPath();
  ctx.arc(cop.x, y - h - 20, 3, 0, Math.PI * 2);
  ctx.fill();

  // Siren light on top of cap, flashes red/blue
  const flashOn = Math.floor(cop.bob * 3) % 2 === 0;
  ctx.fillStyle = flashOn ? '#ff3b3b' : '#3b82ff';
  ctx.beginPath();
  ctx.arc(cop.x, y - h - 27, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawSirenGlow() {
  // Subtle full-screen tint that intensifies as the cop closes in, for tension.
  const closeness = 1 - Math.min(1, (cop.offsetY - COP_OFFSET_CAUGHT) / (COP_OFFSET_START - COP_OFFSET_CAUGHT));
  if (closeness <= 0) return;
  const flashOn = Math.floor(cop.bob * 3) % 2 === 0;
  ctx.fillStyle = flashOn ? `rgba(255,59,59,${closeness * 0.10})` : `rgba(59,130,255,${closeness * 0.10})`;
  ctx.fillRect(0, 0, W, H);
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  drawObstacles();
  if (state !== 'menu') {
    drawCop();
    drawPlayer();
    drawSirenGlow();
  }
  drawParticles();
}

// ---------- Main loop ----------
function loop(t) {
  const dt = Math.min(0.033, (t - lastTime) / 1000 || 0);
  lastTime = t;

  if (state === 'playing') {
    jumpPhysics(dt);
    update(dt);
  } else {
    updateParticles(dt);
  }
  updateCop(dt);

  draw();
  requestAnimationFrame(loop);
}

resetPlayer();
resetCop();
requestAnimationFrame(loop);
