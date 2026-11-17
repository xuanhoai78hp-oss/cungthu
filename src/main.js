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
scene.fog = new THREE.Fog("#9cc9ce", 20, 62);

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
const arrows = [];
const particles = [];
const decorations = [];
const startingYaw = Math.PI;
const startingPitch = -0.38;
const maxActiveEnemies = 4;
const aim = {
  yaw: startingYaw,
  pitch: startingPitch,
  targetYaw: startingYaw,
  targetPitch: startingPitch,
};
const maxGateHealth = 8;
const insectColors = ["#6eaa54", "#c94e45", "#d5a333", "#a83b36"];
const shared = {
  sphere: new THREE.SphereGeometry(1, 12, 9),
  smallSphere: new THREE.SphereGeometry(1, 8, 6),
  leg: new THREE.CylinderGeometry(0.035, 0.022, 1, 5),
  wing: new THREE.SphereGeometry(1, 10, 7),
};

let gameState = "ready";
let score = 0;
let kills = 0;
let gateHealth = maxGateHealth;
let wave = 1;
let spawnTimer = 8;
let fireCooldown = 0;
let audioContext = null;
let gyroEnabled = false;
let gyroOrigin = null;
let spriteFrames = null;
let dragging = false;
let lastPointer = null;

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

function createBow() {
  const bow = new THREE.Group();
  const darkWood = new THREE.MeshStandardMaterial({ color: "#292b25", roughness: 0.4, metalness: 0.45 });
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.02, -0.52, 0),
    new THREE.Vector3(-0.2, -0.34, 0),
    new THREE.Vector3(-0.26, 0, 0),
    new THREE.Vector3(-0.2, 0.34, 0),
    new THREE.Vector3(-0.02, 0.52, 0),
  ]);
  bow.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.035, 8, false), darkWood));

  const stringGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.02, -0.52, 0),
    new THREE.Vector3(0.11, 0, 0),
    new THREE.Vector3(-0.02, 0.52, 0),
  ]);
  bow.add(new THREE.Line(stringGeometry, new THREE.LineBasicMaterial({ color: "#e9e5d4" })));

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.22, 8), material("#806343"));
  grip.position.set(-0.25, 0, 0.015);
  bow.add(grip);
  bow.position.set(0.66, -0.42, -1.05);
  camera.add(bow);
  scene.add(camera);
}

function createInsectFallback(type, isMother, flying) {
  const group = new THREE.Group();
  const color = insectColors[type];
  const bodyMaterial = material(color, { roughness: 0.67 });
  const darkMaterial = material("#362b24");
  const head = new THREE.Mesh(shared.smallSphere, bodyMaterial);
  head.scale.set(0.32, 0.25, 0.31);
  head.position.set(0, 0.26, -0.28);
  group.add(head);

  const abdomen = new THREE.Mesh(shared.sphere, bodyMaterial);
  abdomen.scale.set(0.39, 0.28, 0.53);
  abdomen.position.set(0, 0.23, 0.12);
  group.add(abdomen);

  const eyes = new THREE.Mesh(shared.smallSphere, darkMaterial);
  eyes.scale.set(0.045, 0.055, 0.04);
  for (const side of [-1, 1]) {
    const eye = eyes.clone();
    eye.position.set(side * 0.16, 0.3, -0.5);
    group.add(eye);
  }

  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      const leg = new THREE.Mesh(shared.leg, darkMaterial);
      const x = side * 0.3;
      const z = -0.12 + i * 0.23;
      leg.position.set(x + side * 0.1, 0.06, z);
      leg.rotation.z = side * -0.65;
      leg.rotation.x = (i - 1) * 0.2;
      leg.scale.y = isMother ? 0.42 : 0.28;
      group.add(leg);
    }
  }

  const wings = [];
  if (flying && isMother) {
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(
        shared.wing,
        new THREE.MeshStandardMaterial({
          color: "#d9e8c2",
          transparent: true,
          opacity: 0.78,
          roughness: 0.4,
          side: THREE.DoubleSide,
        }),
      );
      wing.scale.set(0.31, 0.045, 0.5);
      wing.position.set(side * 0.34, 0.47, 0.03);
      wing.rotation.z = side * 0.3;
      group.add(wing);
      wings.push(wing);
    }
  }
  group.userData.wings = wings;
  return group;
}

function loadInsectSprites() {
  const image = new Image();
  image.src = "/cungthu.png";
  image.onload = () => {
    const groups = {
      flyingMother: { y: 40, firstColumn: 0 },
      flyingChild: { y: 40, firstColumn: 4 },
      crawlingMother: { y: 80, firstColumn: 0 },
      crawlingChild: { y: 80, firstColumn: 4 },
    };
    const cellWidth = image.width / 8;
    spriteFrames = {};
    for (const [name, group] of Object.entries(groups)) {
      spriteFrames[name] = Array.from({ length: 4 }, (_, frame) => {
        const canvas = document.createElement("canvas");
        canvas.width = 80;
        canvas.height = 80;
        const context = canvas.getContext("2d");
        context.imageSmoothingEnabled = false;
        context.drawImage(
          image,
          (group.firstColumn + frame) * cellWidth,
          group.y,
          cellWidth,
          40,
          0,
          0,
          80,
          80,
        );
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
      });
    }
    enemies.forEach(applySprite);
  };
  image.onerror = () => {
    statusLabel.textContent = "THIẾU ẢNH CÔN TRÙNG";
  };
}

function applySprite(enemy) {
  if (!spriteFrames || enemy.sprite) return;
  const key = `${enemy.flying ? "flying" : "crawling"}${enemy.isMother ? "Mother" : "Child"}`;
  const frames = spriteFrames[key];
  if (!frames) return;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: frames[0],
      transparent: true,
      alphaTest: 0.08,
      depthWrite: false,
    }),
  );
  sprite.scale.set(1.35, 1.35, 1);
  sprite.position.y = 0.42;
  enemy.group.add(sprite);
  enemy.visual.visible = false;
  enemy.sprite = sprite;
  enemy.spriteFrames = frames;
  setSpriteFacing(enemy, enemy.facingLeft ?? false);
}

function setSpriteFacing(enemy, faceLeft) {
  enemy.facingLeft = faceLeft;
  enemy.visual.scale.x = faceLeft ? -1 : 1;
  if (enemy.sprite) enemy.sprite.scale.x = faceLeft ? -0.95 : 0.95;
}

function spawnMother(type, x, z) {
  const flying = type < 2;
  const isMother = true;
  const group = new THREE.Group();
  const visual = createInsectFallback(type, isMother, flying);
  group.add(visual);
  for (const wing of visual.userData.wings ?? []) group.add(wing);
  group.scale.setScalar(1.12);
  group.position.set(x, flying ? 2.05 : 0.11, z);
  scene.add(group);
  const enemy = {
    group,
    visual,
    sprite: null,
    spriteFrames: null,
    type,
    flying,
    isMother,
    alive: true,
    hp: 3,
    maxHp: 3,
    age: Math.random() * 5,
    facingLeft: false,
    speed: flying ? 0 : 0.42,
    baseX: x,
    childrenAlive: 0,
  };
  enemies.push(enemy);
  applySprite(enemy);
  return enemy;
}

function spawnChild(parent, offset = 0) {
  if (!parent.alive) return;
  const flying = parent.flying;
  const type = flying ? 1 : 3;
  const group = new THREE.Group();
  const visual = createInsectFallback(type, false, false);
  group.add(visual);
  group.scale.setScalar(0.6);
  const startY = flying ? parent.group.position.y : 0.13;
  group.position.set(
    THREE.MathUtils.clamp(parent.group.position.x + offset, -6.4, 6.4),
    startY,
    parent.group.position.z,
  );
  scene.add(group);
  const child = {
    group,
    visual,
    sprite: null,
    spriteFrames: null,
    type,
    flying,
    isMother: false,
    alive: true,
    hp: 1,
    maxHp: 1,
    age: 0,
    facingLeft: false,
    speed: (1.25 + Math.random() * 0.35) * 0.3,
    baseX: group.position.x,
    seed: Math.random() * Math.PI * 2 + offset,
    falling: flying,
    startY,
    fallTime: 0,
    parent,
  };
  enemies.push(child);
  parent.childrenAlive += 1;
  applySprite(child);
}

function spawnChildFor(parent) {
  spawnChild(parent, parent.baseX < 0 ? 0.95 : -0.95);
}

function startGame() {
  clearGameObjects();
  score = 0;
  kills = 0;
  gateHealth = maxGateHealth;
  wave = 1;
  spawnTimer = 13;
  fireCooldown = 0;
  aim.yaw = startingYaw;
  aim.targetYaw = startingYaw;
  aim.pitch = startingPitch;
  aim.targetPitch = startingPitch;
  gameState = "playing";
  overlay.classList.add("hidden");
  gameOverOverlay.classList.add("hidden");
  statusLabel.textContent = "PHÒNG THỦ";
  updateHud();
  const flyingMother = spawnMother(0, -3.4, -5.8);
  const crawlingMother = spawnMother(2, 3.4, -6.8);
  spawnChildFor(flyingMother);
  spawnChildFor(crawlingMother);
  unlockAudio();
}

function clearGameObjects() {
  for (const collection of [enemies, arrows, particles]) {
    for (const item of collection) scene.remove(item.group ?? item.mesh);
    collection.length = 0;
  }
}

function endGame() {
  gameState = "over";
  document.querySelector("#final-score").textContent = String(score).padStart(4, "0");
  if (gateHealth <= 0) {
    document.querySelector("#result-title").innerHTML = "Cổng thành<br /><em>đã thất thủ.</em>";
    document.querySelector("#result-copy").textContent = "Đội quân côn trùng đã phá vỡ phòng tuyến.";
  } else {
    document.querySelector("#result-title").innerHTML = "Phòng tuyến<br /><em>đã trụ vững.</em>";
    document.querySelector("#result-copy").textContent = "Bạn đã hoàn thành đợt tấn công.";
  }
  gameOverOverlay.classList.remove("hidden");
  statusLabel.textContent = "KẾT THÚC";
}

function updateHud() {
  scoreLabel.textContent = String(score).padStart(4, "0");
  killsLabel.textContent = String(kills);
  gateFill.style.width = `${Math.max(0, (gateHealth / maxGateHealth) * 100)}%`;
  enemyCountLabel.textContent = `${enemies.filter((enemy) => enemy.alive).length} MỤC TIÊU`;
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
  playTone({ frequency: 570, endFrequency: 130, duration: 0.13, type: "triangle", volume: 0.18 });
  playTone({ frequency: 1250, endFrequency: 380, duration: 0.07, type: "sine", volume: 0.045, delay: 0.015 });
}

function playHitSound() {
  playTone({ frequency: 210, endFrequency: 58, duration: 0.19, type: "sawtooth", volume: 0.17 });
  playTone({ frequency: 740, endFrequency: 180, duration: 0.12, type: "square", volume: 0.045 });
}

function createLightningArrow() {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.026, 0.88, 6),
    new THREE.MeshStandardMaterial({ color: "#d9bd78", emissive: "#c5a447", emissiveIntensity: 0.35 }),
  );
  shaft.rotation.x = Math.PI / 2;
  group.add(shaft);

  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.075, 0.22, 5),
    new THREE.MeshStandardMaterial({
      color: "#d7fbff",
      emissive: "#56e9ff",
      emissiveIntensity: 2.4,
    }),
  );
  tip.rotation.x = Math.PI / 2;
  tip.position.z = -0.53;
  group.add(tip);

  const featherMaterial = new THREE.MeshBasicMaterial({ color: "#80ecff" });
  for (const side of [-1, 1]) {
    const feather = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.18), featherMaterial);
    feather.position.set(side * 0.055, 0, 0.34);
    feather.rotation.y = side * 0.3;
    group.add(feather);
  }

  const lightningMaterial = new THREE.LineBasicMaterial({
    color: "#a9f6ff",
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
  });
  const bolts = [];
  for (const side of [-1, 1]) {
    const points = [
      new THREE.Vector3(0, 0, -0.52),
      new THREE.Vector3(side * 0.09, 0.055, -0.31),
      new THREE.Vector3(-side * 0.065, -0.04, -0.08),
      new THREE.Vector3(side * 0.12, 0.05, 0.12),
      new THREE.Vector3(0, 0, 0.32),
    ];
    const bolt = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      lightningMaterial.clone(),
    );
    group.add(bolt);
    bolts.push(bolt);
  }
  const light = new THREE.PointLight("#69eaff", 1.8, 2.4);
  light.position.z = -0.3;
  group.add(light);
  return { group, bolts, light };
}

function shoot() {
  if (gameState !== "playing" || fireCooldown > 0) return;
  fireCooldown = 0.3;
  playShootSound();
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const position = camera.position.clone().addScaledVector(direction, 0.9);
  const arrowVisual = createLightningArrow();
  arrowVisual.group.position.copy(position);
  arrowVisual.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
  scene.add(arrowVisual.group);
  arrows.push({
    ...arrowVisual,
    velocity: direction.multiplyScalar(31),
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

function removeArrow(index) {
  const [arrow] = arrows.splice(index, 1);
  scene.remove(arrow.group);
}

function removeEnemy(enemy) {
  if (!enemy.alive) return;
  enemy.alive = false;
  scene.remove(enemy.group);
  if (!enemy.isMother && enemy.parent?.alive) {
    enemy.parent.childrenAlive = Math.max(0, enemy.parent.childrenAlive - 1);
    if (enemy.parent.childrenAlive === 0) spawnChildFor(enemy.parent);
  }
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

function updateArrows(delta) {
  for (let i = arrows.length - 1; i >= 0; i -= 1) {
    const arrow = arrows[i];
    arrow.age += delta;
    arrow.previous.copy(arrow.group.position);
    arrow.group.position.addScaledVector(arrow.velocity, delta);
    arrow.group.rotateZ(Math.sin(arrow.age * 22) * 0.008);
    const glow = 1.15 + Math.sin(arrow.age * 38) * 0.5;
    arrow.light.intensity = glow;
    arrow.bolts.forEach((bolt, index) => {
      bolt.material.opacity = 0.55 + Math.sin(arrow.age * 45 + index) * 0.4;
    });

    let hit = false;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const target = enemy.group.position.clone();
      target.y += enemy.isMother ? 0.45 : 0.2;
      const radius = enemy.isMother ? 0.8 : 0.42;
      if (pointSegmentDistance(target, arrow.previous, arrow.group.position) < radius) {
        enemy.hp -= 1;
        playHitSound();
        createBurst(arrow.group.position, insectColors[enemy.type]);
        if (enemy.hp <= 0) {
          score += enemy.isMother ? 250 : 100;
          kills += 1;
          removeEnemy(enemy);
        }
        hit = true;
        break;
      }
    }

    if (hit || arrow.age > 1.8) removeArrow(i);
  }
}

function updateEnemies(delta, elapsed) {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    enemy.age += delta;
    if (enemy.isMother) {
      if (enemy.flying) {
        enemy.group.position.y = 2.05 + Math.sin(enemy.age * 2.3) * 0.16;
        enemy.group.position.x = enemy.baseX + Math.sin(enemy.age * 0.6) * 0.42;
      } else {
        enemy.group.position.z -= enemy.speed * delta;
        enemy.group.position.x = enemy.baseX + Math.sin(enemy.age * 0.9) * 0.32;
        setSpriteFacing(enemy, Math.cos(enemy.age * 0.9) < 0);
      }
      const wings = enemy.visual.userData.wings ?? [];
      wings.forEach((wing, index) => {
        wing.rotation.z = Math.sin(elapsed * 18 + index * Math.PI) * 0.62;
      });
      if (!enemy.flying && enemy.group.position.z < -17.5) {
        gateHealth = Math.max(0, gateHealth - 2);
        createBurst(enemy.group.position, "#d7a348");
        removeEnemy(enemy);
      }
    } else {
      if (enemy.falling) {
        enemy.fallTime += delta;
        const progress = Math.min(1, enemy.fallTime / 0.7);
        enemy.group.position.y = THREE.MathUtils.lerp(enemy.startY, 0.13, progress);
        if (progress === 1) enemy.falling = false;
      }
      enemy.group.position.z -= enemy.speed * delta;
      enemy.group.position.x = THREE.MathUtils.clamp(
        enemy.baseX + Math.sin(enemy.age * 3.3 + enemy.seed) * 1.15,
        -6.8,
        6.8,
      );
      setSpriteFacing(enemy, Math.cos(enemy.age * 3.3 + enemy.seed) < 0);
      enemy.group.rotation.y = Math.sin(enemy.age * 3.3 + enemy.seed) * 0.18;
      if (enemy.spriteFrames && enemy.sprite) {
        enemy.sprite.material.map = enemy.spriteFrames[Math.floor(elapsed * 8) % enemy.spriteFrames.length];
      }
      if (enemy.group.position.z < -17.5) {
        gateHealth = Math.max(0, gateHealth - 1);
        createBurst(enemy.group.position, insectColors[enemy.type]);
        removeEnemy(enemy);
      }
    }
  }
  spawnTimer -= delta;
  if (spawnTimer <= 0) {
    if (enemies.filter((enemy) => enemy.alive).length < maxActiveEnemies) {
      wave += 1;
      const x = (Math.random() * 2 - 1) * 4.1;
      spawnMother(wave % 2 === 0 ? 0 : 2, x, -5 - Math.random() * 4);
    }
    spawnTimer = Math.max(7, 13 - wave * 0.45);
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
  const elapsed = clock.elapsedTime;
  updateAim(delta);
  if (gameState === "playing") {
    fireCooldown = Math.max(0, fireCooldown - delta);
    updateEnemies(delta, elapsed);
    updateArrows(delta);
    updateParticles(delta);
    updateHud();
    if (gateHealth <= 0) endGame();
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
fireButton.addEventListener("click", shoot);
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
    event.preventDefault();
    shoot();
  }
  if (event.code === "ArrowLeft" || event.code === "KeyA") aim.targetYaw += 0.045;
  if (event.code === "ArrowRight" || event.code === "KeyD") aim.targetYaw -= 0.045;
  if (event.code === "ArrowUp" || event.code === "KeyW") aim.targetPitch = Math.min(0.65, aim.targetPitch + 0.035);
  if (event.code === "ArrowDown" || event.code === "KeyS") aim.targetPitch = Math.max(-0.82, aim.targetPitch - 0.035);
});

createScenery();
createBow();
loadInsectSprites();
resize();
animate();
