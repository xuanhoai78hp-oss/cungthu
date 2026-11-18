import * as THREE from "three";
import "./style.css";

const viewport = document.querySelector("#viewport");
const scoreLabel = document.querySelector("#score");
const killsLabel = document.querySelector("#kills");
const gateFill = document.querySelector("#gate-fill");
const statusLabel = document.querySelector("#status");
const enemyCountLabel = document.querySelector("#enemy-count");
const overlay = document.querySelector("#overlay");
const gameOverOverlay = document.querySelector("#game-over");
const startButton = document.querySelector("#start-button");
const restartButton = document.querySelector("#restart-button");
const gyroButton = document.querySelector("#gyro-button");
const recenterButton = document.querySelector("#recenter-button");
const fireButton = document.querySelector("#fire-button");
const aimZoom = document.querySelector("#aim-zoom");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#9cc9ce");
scene.fog = new THREE.Fog("#9cc9ce", 25, 95);

const camera = new THREE.PerspectiveCamera(67, 1, 0.1, 100);
camera.position.set(0, 8.4, -18.5);
camera.rotation.order = "YXZ";
const zoomCamera = new THREE.PerspectiveCamera(12, 1, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
viewport.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const enemies = [];
const bullets = [];
const bugs = [];
const particles = [];
const decorations = [];
const startingYaw = Math.PI;
const startingPitch = -0.16;
const maxActiveEnemies = 4;
const aim = {
  yaw: startingYaw,
  pitch: startingPitch,
  targetYaw: startingYaw,
  targetPitch: startingPitch,
};
const maxGateHealth = 8;
const aircraftColors = ["#566c68", "#8a5948"];
const aircraftAltitude = 20;
const barrels = [];
let machineGun = null;
let nextBarrel = 0;
let gunRecoil = 0;
const shared = {
  sphere: new THREE.SphereGeometry(1, 12, 9),
};

let gameState = "ready";
let score = 0;
let kills = 0;
let gateHealth = maxGateHealth;
let wave = 1;
let spawnTimer = 2.8;
let fireCooldown = 0;
let fireHeld = false;
let audioContext = null;
let gyroEnabled = false;
let gyroOrigin = null;
let dragging = false;
let lastPointer = null;

// ==========================================
// CẤU HÌNH & TẢI SPRITE CÔN TRÙNG TỪ cungthu.png
// ==========================================
const TILE_SIZE = 40;
const BUG_TYPES = {
  MANTIS_GREEN: { name: 'Bọ ngựa xanh', row: 1, colStart: 0, frames: 4, hp: 1, speed: 5.5, score: 100 },
  MANTIS_RED:   { name: 'Bọ ngựa đỏ',   row: 1, colStart: 4, frames: 4, hp: 2, speed: 7, score: 180 },
  SCORPION_YEL: { name: 'Bọ cạp vàng',  row: 2, colStart: 0, frames: 4, hp: 2, speed: 4.8, score: 150 },
  SCORPION_RED: { name: 'Bọ cạp đỏ',    row: 2, colStart: 4, frames: 4, hp: 3, speed: 6.2, score: 250 },
};
const BUG_KEYS = Object.keys(BUG_TYPES);
let bugTextures = {};

async function loadBugSpriteTextures() {
  const img = new Image();
  img.src = './cungthu.png';
  try {
    await img.decode();
  } catch (e) {
    console.warn("Không thể tải cungthu.png, sử dụng fallback hình khối.", e);
    return;
  }

  for (const key of BUG_KEYS) {
    const cfg = BUG_TYPES[key];
    bugTextures[key] = [];

    for (let f = 0; f < cfg.frames; f++) {
      const canvas = document.createElement('canvas');
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      const ctx = canvas.getContext('2d');

      const sx = (cfg.colStart + f) * TILE_SIZE;
      const sy = cfg.row * TILE_SIZE;
      ctx.drawImage(img, sx, sy, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE);

      // Xóa nền trắng (R>240, G>240, B>240 -> alpha = 0)
      const imgData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) {
          d[i + 3] = 0;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      bugTextures[key].push(texture);
    }
  }
}
loadBugSpriteTextures();

// ==========================================
// HỆ THỐNG TỐC ĐỘ BẮN & QUA CỬA
// ==========================================
let playerKillsForFireRate = 0;
let fireRatePercent = 20; // Bắt đầu ở 20%
const baseFireInterval = 0.10; // Khoảng thời gian giữa 2 phát đạn ở 100%

function getCurrentFireInterval() {
  return baseFireInterval / (fireRatePercent / 100);
}

function registerPlayerKillForFireRate() {
  playerKillsForFireRate += 1;
  const bonusSteps = Math.floor(playerKillsForFireRate / 10);
  fireRatePercent = Math.min(100, 20 + bonusSteps * 5);
  updateFireRateHud();

  if (fireRatePercent >= 100) {
    endGame(true); // Đạt 100% -> Qua cửa chiến thắng!
  }
}

// Bổ sung thêm dòng hiển thị Tốc độ bắn & Đã hạ trong HUD nếu có
function updateFireRateHud() {
  const frEl = document.querySelector("#fire-rate");
  if (frEl) frEl.textContent = `${fireRatePercent}%`;
}

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.78, ...options });

function addBox(width, height, depth, position, color, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(color, options));
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addCylinder(radiusTop, radiusBottom, height, position, color, segments = 10) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material(color),
  );
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function createScenery() {
  scene.add(new THREE.HemisphereLight("#e3f3e7", "#30412e", 2.05));
  const sun = new THREE.DirectionalLight("#fff1d2", 3.1);
  sun.position.set(-8, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), material("#527849"));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  scene.add(ground);

  const path = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 37), material("#a79365"));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.005, -8.5);
  path.receiveShadow = true;
  scene.add(path);

  const pathEdgeMaterial = material("#c8b787");
  for (const x of [-2.85, 2.85]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 37), pathEdgeMaterial);
    edge.position.set(x, 0.035, -8.5);
    edge.receiveShadow = true;
    scene.add(edge);
  }

  for (let i = 0; i < 21; i += 1) {
    const z = 9 - i * 1.45;
    if (z < -18) break;
    for (const side of [-1, 1]) {
      const x = side * (4.4 + (i % 3) * 1.3);
      const tuft = new THREE.Mesh(
        new THREE.ConeGeometry(0.65 + (i % 2) * 0.25, 1.1 + (i % 4) * 0.22, 5),
        material(i % 2 ? "#365f43" : "#47734a"),
      );
      tuft.position.set(x, 0.55, z);
      tuft.rotation.y = side * 0.25;
      tuft.castShadow = true;
      scene.add(tuft);
      decorations.push(tuft);
    }
  }

  createAncientTree();
  createCastleGate();
}

function createAncientTree() {
  const treeX = -6.2;
  const treeZ = -5.8;
  addCylinder(0.38, 0.83, 7.3, [treeX, 3.55, treeZ], "#62472f", 12);

  const branchMaterial = material("#6b4c32");
  const addBranch = (from, to, radius) => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.58, radius, direction.length(), 8),
      branchMaterial,
    );
    branch.position.copy(start.add(end).multiplyScalar(0.5));
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    branch.castShadow = true;
    scene.add(branch);
  };
  addBranch([treeX, 4.7, treeZ], [-8.7, 7.1, treeZ - 0.5], 0.34);
  addBranch([treeX, 5.3, treeZ], [-3.6, 7.5, treeZ + 0.4], 0.32);
  addBranch([treeX, 5.1, treeZ], [treeX - 0.1, 8.6, treeZ], 0.37);
  addBranch([treeX, 4.4, treeZ], [-7.3, 5.9, treeZ + 1.4], 0.26);
  addBranch([treeX, 4.9, treeZ], [-4.7, 6.1, treeZ - 1.2], 0.25);

  const leafColors = ["#315e42", "#3d714b", "#4b7e4c", "#547d48"];
  const crowns = [
    [-7.8, 7.7, treeZ - 0.2, 2.7],
    [-5.7, 8.6, treeZ, 3.15],
    [-3.7, 7.8, treeZ + 0.4, 2.7],
    [-6.9, 6.6, treeZ + 1.1, 2.2],
    [-4.9, 6.7, treeZ - 1, 2.2],
  ];
  crowns.forEach(([x, y, z, size], index) => {
    const crown = new THREE.Mesh(shared.sphere, material(leafColors[index % leafColors.length], { roughness: 1 }));
    crown.position.set(x, y, z);
    crown.scale.set(size, size * 0.78, size * 0.88);
    crown.castShadow = true;
    crown.receiveShadow = true;
    scene.add(crown);
  });
}

function createCastleGate() {
  const wallColor = "#b9a783";
  addBox(11.5, 4.2, 1.05, [-7.15, 2.1, -20], wallColor);
  addBox(11.5, 4.2, 1.05, [7.15, 2.1, -20], wallColor);
  addBox(5.5, 1.2, 1.05, [0, 5.35, -20], "#a9936c");
  addBox(4.5, 3.4, 0.36, [0, 1.7, -19.38], "#463e31");

  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(2.28, 0.32, 8, 28, Math.PI),
    material("#e1cc9c"),
  );
  arch.position.set(0, 3.15, -19.42);
  arch.castShadow = true;
  scene.add(arch);

  for (const x of [-12.5, 12.5]) {
    addBox(2.15, 8, 2, [x, 4, -20], "#9c8966");
    addBox(2.4, 0.42, 2.25, [x, 8.2, -20], "#776849");
    for (let i = -1; i <= 1; i += 1) {
      addBox(0.42, 0.7, 0.45, [x + i * 0.66, 8.7, -20], "#776849");
    }
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i += 1) {
      addBox(0.42, 0.58, 0.42, [side * (4.5 + i * 1.4), 4.55, -20], "#9d8966");
    }
  }
}

function createMachineGun() {
  machineGun = new THREE.Group();
  const gun = machineGun;
  const gunMetal = material("#343b39", { metalness: 0.7, roughness: 0.32 });
  const gripMaterial = material("#5c4635");
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.18, 0.55), gunMetal);
  receiver.position.set(0, 0, 0.05);
  gun.add(receiver);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.18), gunMetal);
  sight.position.set(0, 0.13, -0.12);
  gun.add(sight);
  for (const side of [-1, 1]) {
    const barrel = new THREE.Group();
    barrel.position.set(side * 0.2, 0.045, -0.08);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.82, 10), gunMetal);
    tube.rotation.x = Math.PI / 2;
    tube.position.z = -0.38;
    barrel.add(tube);

    const muzzle = new THREE.Group();
    muzzle.position.z = -0.8;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.052, 0.012, 6, 12),
      material("#a5aaa1", { metalness: 0.8, roughness: 0.25 }),
    );
    muzzle.add(rim);

    const flash = new THREE.Group();
    const outerFlare = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.4, 8),
      new THREE.MeshBasicMaterial({ color: "#ff762e", transparent: true, opacity: 0.9 }),
    );
    outerFlare.rotation.x = -Math.PI / 2;
    outerFlare.position.z = -0.17;
    flash.add(outerFlare);
    const innerFlare = new THREE.Mesh(
      new THREE.ConeGeometry(0.065, 0.28, 8),
      new THREE.MeshBasicMaterial({ color: "#fff1a1", transparent: true, opacity: 0.95 }),
    );
    innerFlare.rotation.x = -Math.PI / 2;
    innerFlare.position.z = -0.12;
    flash.add(innerFlare);
    flash.visible = false;
    muzzle.add(flash);
    const light = new THREE.PointLight("#ff9a42", 0, 2.8);
    light.position.z = -0.1;
    muzzle.add(light);
    barrel.add(muzzle);
    gun.add(barrel);
    barrels.push({ group: barrel, muzzle, flash, light, kick: 0, flashTime: 0 });

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.23, 0.14), gripMaterial);
    grip.position.set(side * 0.2, -0.19, 0.16);
    grip.rotation.x = -0.18;
    gun.add(grip);
  }
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.28), gunMetal);
  stock.position.z = 0.42;
  gun.add(stock);
  gun.position.set(0.28, -0.48, -1.05);
  camera.add(gun);
  scene.add(camera);
}

function updateMachineGun(delta) {
  if (!machineGun) return;
  gunRecoil *= Math.exp(-delta * 20);
  machineGun.position.z = -1.05 + gunRecoil;
  machineGun.rotation.x = -gunRecoil * 0.35;
  for (const barrel of barrels) {
    barrel.kick *= Math.exp(-delta * 26);
    barrel.group.position.z = -0.08 + barrel.kick;
    barrel.flashTime = Math.max(0, barrel.flashTime - delta);
    const intensity = barrel.flashTime / 0.075;
    barrel.flash.visible = intensity > 0;
    barrel.flash.scale.setScalar(0.72 + intensity * 0.45);
    barrel.light.intensity = intensity * 2.8;
  }
}

function createAircraft(type) {
  const group = new THREE.Group();
  const bodyColor = aircraftColors[type];
  const bodyMaterial = material(bodyColor, { metalness: 0.35, roughness: 0.55 });
  const wingMaterial = material(type === 0 ? "#9aa28e" : "#776b60", { metalness: 0.25 });
  const cockpitMaterial = material("#83c5cb", { metalness: 0.55, roughness: 0.2 });
  const addPart = (geometry, partMaterial, position, rotation = [0, 0, 0]) => {
    const part = new THREE.Mesh(geometry, partMaterial);
    part.position.set(...position);
    part.rotation.set(...rotation);
    part.castShadow = true;
    part.receiveShadow = true;
    group.add(part);
    return part;
  };
  addPart(new THREE.CylinderGeometry(0.12, type === 0 ? 0.24 : 0.3, 2.05, 8), bodyMaterial, [0, 0, 0], [-Math.PI / 2, 0, 0]);
  addPart(new THREE.ConeGeometry(0.2, 0.62, 8), bodyMaterial, [0, 0, -1.27], [-Math.PI / 2, 0, 0]);
  addPart(new THREE.BoxGeometry(type === 0 ? 2.6 : 3.1, 0.1, 0.64), wingMaterial, [0, -0.02, 0.08], [0, 0, type === 0 ? -0.06 : 0.04]);
  addPart(new THREE.BoxGeometry(type === 0 ? 0.98 : 1.3, 0.08, 0.38), bodyMaterial, [0, 0.03, 0.82]);
  addPart(new THREE.BoxGeometry(0.1, 0.48, 0.42), bodyMaterial, [0, 0.23, 0.82]);
  const cockpit = addPart(new THREE.SphereGeometry(0.19, 10, 7), cockpitMaterial, [0, 0.2, -0.35]);
  cockpit.scale.set(0.8, 0.75, 1.3);

  if (type === 0) {
    addPart(new THREE.CylinderGeometry(0.035, 0.035, 0.62, 8), bodyMaterial, [0, 0, -1.83], [0, 0, Math.PI / 2]);
  } else {
    for (const side of [-1, 1]) {
      const engine = addPart(new THREE.CylinderGeometry(0.13, 0.16, 0.55, 8), bodyMaterial, [side * 0.83, -0.08, 0.02], [-Math.PI / 2, 0, 0]);
      engine.scale.set(1, 1, 0.75);
    }
  }
  group.scale.setScalar(type === 0 ? 1 : 1.14);
  return group;
}

function spawnAircraft(type, x, z, path) {
  const group = createAircraft(type);
  group.position.set(x, aircraftAltitude, z);
  scene.add(group);
  const enemy = {
    group,
    type,
    color: aircraftColors[type],
    alive: true,
    hp: type === 0 ? 2 : 3,
    age: 0,
    speed: type === 0 ? 5.4 : 4.5,
    startX: x,
    path,
    seed: Math.random() * Math.PI * 2,
    startZ: z,
    bombTimer: 1.4 + Math.random() * 1.8,
  };
  enemies.push(enemy);
  return enemy;
}

// Thay thế Bom bằng Côn trùng nhảy dù
function spawnBugFromAircraft(enemy) {
  const keys = BUG_KEYS;
  const randomKey = keys[Math.floor(Math.random() * keys.length)];
  const config = BUG_TYPES[randomKey];

  const planePos = enemy.group.position;
  const spriteMat = new THREE.SpriteMaterial({
    map: bugTextures[randomKey] ? bugTextures[randomKey][0] : null,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(1.4, 1.4, 1);
  sprite.position.copy(planePos);
  sprite.position.y -= 0.6;
  scene.add(sprite);

  const bugObj = {
    mesh: sprite,
    typeKey: randomKey,
    config,
    hp: config.hp,
    state: 'PARACHUTE', // 'PARACHUTE' | 'CRAWLING' | 'DEAD'
    velocity: new THREE.Vector3(0, -3.2, -enemy.speed * 0.6),
    x: planePos.x,
    y: planePos.y - 0.6,
    z: planePos.z,
    animTimer: 0,
    frameIndex: 0,
    alive: true
  };
  bugs.push(bugObj);
}

function startGame() {
  clearGameObjects();
  score = 0;
  kills = 0;
  gateHealth = maxGateHealth;
  playerKillsForFireRate = 0;
  fireRatePercent = 20;
  wave = 1;
  spawnTimer = 2.8;
  fireCooldown = 0;
  fireHeld = false;
  aim.yaw = startingYaw;
  aim.targetYaw = startingYaw;
  aim.pitch = startingPitch;
  aim.targetPitch = startingPitch;
  gameState = "playing";
  overlay.classList.add("hidden");
  gameOverOverlay.classList.add("hidden");
  statusLabel.textContent = "PHÒNG KHÔNG";
  updateHud();
  updateFireRateHud();
  spawnAircraft(Math.floor(Math.random() * 2), -3.6, 48, 0);
  spawnAircraft(Math.floor(Math.random() * 2), 3.6, 57, 2);
  unlockAudio();
}

function clearGameObjects() {
  for (const collection of [enemies, bullets, bugs, particles]) {
    for (const item of collection) scene.remove(item.group ?? item.mesh);
    collection.length = 0;
  }
}

function endGame(isVictory = false) {
  gameState = "over";
  document.querySelector("#final-score").textContent = String(score).padStart(4, "0");
  if (isVictory) {
    document.querySelector("#result-title").innerHTML = "Chiến thắng!<br /><em>Đã đạt 100% tốc độ.</em>";
    document.querySelector("#result-copy").textContent = "Bạn đã tiêu diệt đủ lượng côn trùng và qua cửa thành công!";
  } else if (gateHealth <= 0) {
    document.querySelector("#result-title").innerHTML = "Cổng thành<br /><em>đã thất thủ.</em>";
    document.querySelector("#result-copy").textContent = "Côn trùng địch đã phá vỡ phòng tuyến thành công.";
  } else {
    document.querySelector("#result-title").innerHTML = "Phòng tuyến<br /><em>đã trụ vững.</em>";
    document.querySelector("#result-copy").textContent = "Bạn đã chặn đứng đợt tấn công.";
  }
  gameOverOverlay.classList.remove("hidden");
  statusLabel.textContent = "KẾT THÚC";
}

function updateHud() {
  scoreLabel.textContent = String(score).padStart(4, "0");
  killsLabel.textContent = String(kills);
  gateFill.style.width = `${Math.max(0, (gateHealth / maxGateHealth) * 100)}%`;
  enemyCountLabel.textContent = `${enemies.filter((e) => e.alive).length + bugs.filter((b) => b.alive).length} MỤC TIÊU`;
}

function ensureAudio() {
  if (audioContext) return audioContext;
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType) return null;
  audioContext = new AudioContextType();
  return audioContext;
}

function unlockAudio() {
  const context = ensureAudio();
  if (context?.state === "suspended") void context.resume();
}

function playTone({ frequency, endFrequency, duration, type, volume, delay = 0 }) {
  const context = ensureAudio();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playShootSound() {
  playTone({ frequency: 210, endFrequency: 72, duration: 0.075, type: "square", volume: 0.07 });
  playTone({ frequency: 860, endFrequency: 280, duration: 0.045, type: "triangle", volume: 0.025, delay: 0.008 });
}

function playHitSound() {
  playTone({ frequency: 210, endFrequency: 58, duration: 0.19, type: "sawtooth", volume: 0.17 });
  playTone({ frequency: 740, endFrequency: 180, duration: 0.12, type: "square", volume: 0.045 });
}

function shoot() {
  if (gameState !== "playing" || fireCooldown > 0) return;
  fireCooldown = getCurrentFireInterval(); // Sử dụng tốc độ bắn theo % hiện tại
  playShootSound();
  const barrel = barrels[nextBarrel];
  nextBarrel = (nextBarrel + 1) % barrels.length;
  barrel.kick = 0.11;
  barrel.flashTime = 0.075;
  gunRecoil = 0.065;
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  camera.updateMatrixWorld(true);
  const position = barrel.muzzle.getWorldPosition(new THREE.Vector3()).addScaledVector(direction, 0.08);
  const bullet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.52, 6),
    new THREE.MeshBasicMaterial({ color: "#ffe59a" }),
  );
  bullet.position.copy(position);
  bullet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  scene.add(bullet);
  bullets.push({
    group: bullet,
    velocity: direction.multiplyScalar(80),
    age: 0,
    previous: position.clone(),
  });
}

function pointSegmentDistance(point, start, end) {
  const segment = end.clone().sub(start);
  const lengthSquared = segment.lengthSq();
  if (lengthSquared === 0) return point.distanceTo(start);
  const t = THREE.MathUtils.clamp(point.clone().sub(start).dot(segment) / lengthSquared, 0, 1);
  return point.distanceTo(start.addScaledVector(segment, t));
}

function removeBullet(index) {
  const [bullet] = bullets.splice(index, 1);
  scene.remove(bullet.group);
}

function removeEnemy(enemy) {
  if (!enemy.alive) return;
  enemy.alive = false;
  scene.remove(enemy.group);
}

function createBurst(position, color) {
  const palette = [color, "#ffe68a", "#ffae6c", "#a7f4ff", "#fff4d5"];
  for (let i = 0; i < 30; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.045 + Math.random() * 0.045, 5, 5),
      new THREE.MeshBasicMaterial({
        color: palette[i % palette.length],
        transparent: true,
        blending: THREE.AdditiveBlending,
      }),
    );
    mesh.position.copy(position);
    scene.add(mesh);
    const direction = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 1.7,
      Math.random() * 2 - 1,
    ).normalize();
    particles.push({
      mesh,
      velocity: direction.multiplyScalar(2 + Math.random() * 5),
      age: 0,
      life: 0.65 + Math.random() * 0.5,
    });
  }
  const flash = new THREE.PointLight("#ffe08a", 5, 5);
  flash.position.copy(position);
  scene.add(flash);
  particles.push({ mesh: flash, velocity: new THREE.Vector3(), age: 0, life: 0.18 });
}

function updateBullets(delta) {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];
    bullet.age += delta;
    bullet.previous.copy(bullet.group.position);
    bullet.group.position.addScaledVector(bullet.velocity, delta);
    let hit = false;

    // 1. Kiểm tra trúng máy bay trên không
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const target = enemy.group.position.clone();
      const radius = enemy.type === 0 ? 1.15 : 1.35;
      if (pointSegmentDistance(target, bullet.previous, bullet.group.position) < radius) {
        enemy.hp -= 1;
        playHitSound();
        createBurst(bullet.group.position, enemy.color);
        if (enemy.hp <= 0) {
          score += enemy.type === 0 ? 250 : 350;
          kills += 1;
          removeEnemy(enemy);
        }
        hit = true;
        break;
      }
    }

    // 2. Kiểm tra trúng côn trùng (cả đang nhảy dù lẫn đang bò)
    if (!hit) {
      for (const bug of bugs) {
        if (!bug.alive) continue;
        const target = bug.mesh.position.clone();
        if (pointSegmentDistance(target, bullet.previous, bullet.group.position) < 0.9) {
          bug.hp -= 1;
          playHitSound();
          createBurst(bug.mesh.position, "#9cf273");
          if (bug.hp <= 0) {
            bug.alive = false;
            scene.remove(bug.mesh);
            score += bug.config.score;
            kills += 1;
            registerPlayerKillForFireRate(); // Cộng tiến độ tốc độ bắn!
          }
          hit = true;
          break;
        }
      }
    }

    if (hit || bullet.age > 1.3) removeBullet(i);
  }
}

function updateEnemies(delta) {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    enemy.age += delta;
    enemy.group.position.z -= enemy.speed * delta;
    const progress = THREE.MathUtils.clamp((enemy.startZ - enemy.group.position.z) / (enemy.startZ + 20), 0, 1);
    if (enemy.path === 0) {
      enemy.group.position.x = enemy.startX;
    } else if (enemy.path === 1) {
      enemy.group.position.x = THREE.MathUtils.lerp(enemy.startX, -enemy.startX, progress);
    } else if (enemy.path === 2) {
      enemy.group.position.x = enemy.startX + Math.sin(progress * Math.PI * 2 + enemy.seed) * 3;
    } else {
      enemy.group.position.x = enemy.startX + Math.sin(progress * Math.PI * 4 + enemy.seed) * 1.6;
    }
    enemy.group.position.y = aircraftAltitude + Math.sin(enemy.age * 1.6 + enemy.seed) * 0.3;
    enemy.group.rotation.z = enemy.path === 1 ? Math.sign(-enemy.startX) * 0.08 : Math.sin(enemy.age * 1.5) * 0.035;
    
    // Thả côn trùng thay cho bom
    enemy.bombTimer -= delta;
    if (enemy.bombTimer <= 0) {
      spawnBugFromAircraft(enemy);
      enemy.bombTimer = 2.4 + Math.random() * 1.8;
    }
    if (enemy.group.position.z < -22) {
      removeEnemy(enemy);
    }
  }
  spawnTimer -= delta;
  if (spawnTimer <= 0) {
    if (enemies.filter((enemy) => enemy.alive).length < maxActiveEnemies) {
      wave += 1;
      const x = (Math.random() * 2 - 1) * 4.8;
      spawnAircraft(Math.floor(Math.random() * 2), x, 48 + Math.random() * 12, Math.floor(Math.random() * 4));
    }
    spawnTimer = Math.max(1.6, 3.8 - wave * 0.12);
  }
}

// Cập nhật logic côn trùng nhảy dù và bò vào thành
function updateBugs(delta) {
  const gatePos = new THREE.Vector3(0, 0, -19); // Vị trí cổng thành

  for (let i = bugs.length - 1; i >= 0; i -= 1) {
    const bug = bugs[i];
    if (!bug.alive) continue;

    // Animation chuyển frame sprite
    bug.animTimer += delta;
    if (bug.animTimer >= 0.12) {
      bug.animTimer = 0;
      bug.frameIndex = (bug.frameIndex + 1) % bug.config.frames;
      const textures = bugTextures[bug.typeKey];
      if (textures && textures[bug.frameIndex]) {
        bug.mesh.material.map = textures[bug.frameIndex];
      }
    }

    if (bug.state === 'PARACHUTE') {
      // Rơi từ trên trời xuống
      bug.y -= 3.5 * delta;
      bug.x += Math.sin(performance.now() * 0.003 + bug.z) * 0.5 * delta;
      bug.mesh.position.set(bug.x, bug.y, bug.z);

      // Chạm đất (y <= 0)
      if (bug.y <= 0) {
        bug.y = 0;
        const distToGate = Math.hypot(bug.x - gatePos.x, bug.z - gatePos.z);

        // Khoảng cách > 80 đơn vị so với tâm (ở đây quy đổi tọa độ game tương ứng vùng an toàn)
        // Nếu rẽ nhánh đúng yêu cầu: Rơi trong vòng 80 đơn vị -> tự tiêu diệt khi tiếp đất; ngoài 80 -> bò vào thành
        // (Bán kính bản đồ từ 0 đến cổng -20 là khoảng 20 đơn vị, ta áp dụng ngưỡng 80 đơn vị như yêu cầu của bạn)
        if (distToGate <= 80) {
          // Tiếp đất trong vòng 80 đơn vị -> Hệ thống tự động tiêu diệt ngay!
          bug.alive = false;
          scene.remove(bug.mesh);
          createBurst(bug.mesh.position, "#ffae42");
        } else {
          // Bò vào thành
          bug.state = 'CRAWLING';
        }
      }
    } else if (bug.state === 'CRAWLING') {
      // Tiến về phía cổng thành
      const dx = gatePos.x - bug.x;
      const dz = gatePos.z - bug.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= 1.2) {
        // Côn trùng bò tới được cổng thành -> Trừ máu cổng thành
        bug.alive = false;
        scene.remove(bug.mesh);
        createBurst(bug.mesh.position, "#ff4242");
        gateHealth = Math.max(0, gateHealth - 1);
      } else {
        bug.x += (dx / dist) * bug.config.speed * delta;
        bug.z += (dz / dist) * bug.config.speed * delta;
        bug.mesh.position.set(bug.x, 0.35, bug.z);
      }
    }

    if (!bug.alive) {
      bugs.splice(i, 1);
    }
  }
}

function updateParticles(delta) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.age += delta;
    if (particle.age >= particle.life) {
      scene.remove(particle.mesh);
      particle.mesh.geometry?.dispose();
      if (particle.mesh.material?.dispose) particle.mesh.material.dispose();
      particles.splice(i, 1);
      continue;
    }
    particle.mesh.position.addScaledVector(particle.velocity, delta);
    particle.velocity.y -= 5.2 * delta;
    const fade = 1 - particle.age / particle.life;
    if (particle.mesh.material?.opacity !== undefined) particle.mesh.material.opacity = fade;
    if (particle.mesh.isPointLight) particle.mesh.intensity = fade * 5;
    particle.mesh.scale.setScalar(Math.max(0.05, fade));
  }
}

function updateAim(delta) {
  const blend = 1 - Math.exp(-delta * 12);
  aim.yaw += (aim.targetYaw - aim.yaw) * blend;
  aim.pitch += (aim.targetPitch - aim.pitch) * blend;
  camera.rotation.y = aim.yaw;
  camera.rotation.x = THREE.MathUtils.clamp(aim.pitch, -0.85, 0.7);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.04);
  updateAim(delta);
  updateMachineGun(delta);
  if (gameState === "playing") {
    fireCooldown = Math.max(0, fireCooldown - delta);
    if (fireHeld && fireCooldown <= 0) shoot();
    updateEnemies(delta);
    updateBugs(delta);
    updateBullets(delta);
    updateParticles(delta);
    updateHud();
    if (gateHealth <= 0) endGame(false);
  } else {
    updateParticles(delta);
  }
  renderScene();
}

function renderScene() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, width, height);
  renderer.render(scene, camera);

  const zoomBounds = aimZoom.getBoundingClientRect();
  const viewportBounds = viewport.getBoundingClientRect();
  const inset = 2;
  const zoomWidth = Math.max(1, zoomBounds.width - inset * 2);
  const zoomHeight = Math.max(1, zoomBounds.height - inset * 2);
  const zoomLeft = zoomBounds.left - viewportBounds.left + inset;
  const zoomBottom = viewportBounds.bottom - zoomBounds.bottom + inset;

  zoomCamera.aspect = zoomWidth / zoomHeight;
  zoomCamera.position.copy(camera.position);
  zoomCamera.quaternion.copy(camera.quaternion);
  zoomCamera.updateProjectionMatrix();

  renderer.setViewport(zoomLeft, zoomBottom, zoomWidth, zoomHeight);
  renderer.setScissor(zoomLeft, zoomBottom, zoomWidth, zoomHeight);
  renderer.setScissorTest(true);
  renderer.render(scene, zoomCamera);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, width, height);
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onPointerDown(event) {
  if (event.target.closest("button")) return;
  dragging = true;
  lastPointer = { x: event.clientX, y: event.clientY };
  renderer.domElement.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (!dragging || gyroEnabled || !lastPointer) return;
  const deltaX = event.clientX - lastPointer.x;
  const deltaY = event.clientY - lastPointer.y;
  lastPointer = { x: event.clientX, y: event.clientY };
  aim.targetYaw -= deltaX * 0.004;
  aim.targetPitch = THREE.MathUtils.clamp(aim.targetPitch - deltaY * 0.0035, -0.82, 0.65);
}

function onPointerUp() {
  dragging = false;
  lastPointer = null;
}

function angleDifference(value, origin) {
  return ((value - origin + 540) % 360) - 180;
}

function onDeviceOrientation(event) {
  if (!gyroEnabled || event.alpha === null || event.beta === null) return;
  if (!gyroOrigin) {
    gyroOrigin = { alpha: event.alpha, beta: event.beta, yaw: aim.targetYaw, pitch: aim.targetPitch };
    return;
  }
  aim.targetYaw = gyroOrigin.yaw + (angleDifference(event.alpha, gyroOrigin.alpha) * Math.PI) / 180;
  aim.targetPitch = THREE.MathUtils.clamp(
    gyroOrigin.pitch + ((event.beta - gyroOrigin.beta) * Math.PI) / 180,
    -0.82,
    0.65,
  );
}

async function enableGyro() {
  if (!("DeviceOrientationEvent" in window)) {
    statusLabel.textContent = "THIẾT BỊ KHÔNG CÓ GYRO";
    return;
  }
  const orientationEvent = window.DeviceOrientationEvent;
  if (typeof orientationEvent.requestPermission === "function") {
    const permission = await orientationEvent.requestPermission();
    if (permission !== "granted") {
      statusLabel.textContent = "GYRO CHƯA ĐƯỢC CẤP QUYỀN";
      return;
    }
  }
  gyroEnabled = true;
  gyroOrigin = null;
  window.addEventListener("deviceorientation", onDeviceOrientation);
  gyroButton.textContent = "GYRO ĐANG BẬT";
  recenterButton.disabled = false;
  statusLabel.textContent = "NGẮM BẰNG GYRO";
}

function recenterGyro() {
  gyroOrigin = null;
  statusLabel.textContent = "ĐÃ ĐẶT LẠI TÂM";
}

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);
fireButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  fireButton.setPointerCapture(event.pointerId);
  fireHeld = true;
  shoot();
});
fireButton.addEventListener("pointerup", () => {
  fireHeld = false;
});
fireButton.addEventListener("pointercancel", () => {
  fireHeld = false;
});
gyroButton.addEventListener("click", () => {
  enableGyro().catch((error) => {
    statusLabel.textContent = "KHÔNG THỂ BẬT GYRO";
    console.error("Could not enable device orientation controls.", error);
  });
});
recenterButton.addEventListener("click", recenterGyro);
window.addEventListener("resize", resize);
renderer.domElement.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event