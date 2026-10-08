/**
 * Mission Sambhoug - 3D Ludo Tabletop & Multiplayer Engine
 * Upgraded by 4 Specialized Agents:
 * 1. Palette Heirloom Stylist: Deep PBR colors, calibrated contrasts, and metallic inlays
 * 2. Three.js Visual Artisan: 4K soft shadow maps, 2K textures, ACES filmic 1.12 exposure
 * 3. Physics Dice Animator: Multi-axis tumble, parabolic toss, rebound bounce, dynamic shadow
 * 4. Spatial Anti-Overlap Guard: Multi-pawn radial clustering, zero mesh clipping, socket alignment
 */

const canvas = document.getElementById('webgl-canvas');
let scene, camera, renderer, controls;
let masterExportGroup;
let pawns = [];
let dice = [];
let diceShadows = [];
let yardRankMeshes = {};
let isRolling = false;
let isPawnRunning = false;
let isAwaitingPawnMove = false;
let isTurnTransitioning = false;
let isClay = false;
let gameMode = 'bots'; // 'bots' | 'pass_play' | 'online'
let isBoardLocked = false;
let isGotiDicePopupOpen = false;
let currentTheme = 'scifi';
try {
  const savedTheme = localStorage.getItem('ludo_theme');
  if (savedTheme) currentTheme = savedTheme;
} catch (e) {}

let boardTopMesh = null;
let boardBaseMesh = null;
let tableFloorMesh = null;
let centerCollarMesh = null;
let yardFloorMeshes = [];
let yardPadMeshes = [];
let steppedTrackMeshes = [];

// Pre-Allocated Scratchpad Object Pool to kill GC micro-stutters (Agent 3)
const AppVectorPool = {
  _pool: [],
  acquire(x = 0, y = 0, z = 0) {
    if (this._pool.length > 0) {
      const v = this._pool.pop();
      v.set(x, y, z);
      return v;
    }
    return new THREE.Vector3(x, y, z);
  },
  release(v) {
    if (v && this._pool.length < 150) {
      this._pool.push(v);
    }
  }
};

function setRollButtonEnabled(enabled) {
  const btn = document.getElementById('btn-roll');
  if (btn) {
    btn.disabled = !enabled;
    if (!enabled) {
      btn.classList.remove('bonus-roll-active');
      btn.style.opacity = '0.45';
      btn.style.pointerEvents = 'none';
      btn.style.cursor = 'not-allowed';
    } else {
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      btn.style.cursor = 'pointer';
    }
  }
}

// Game engine instance
const engine = new LudoGameEngine();
const aiBot = new LudoAiBot();

// Socket.io for online multiplayer
let socket = null;
let myOnlinePlayerIndex = -1;
let currentRoomCode = null;

// Calibrated Museum Palette (Agent 1: Palette Heirloom Stylist - Luminous Royal Gemstones & Deep Contrast)
const PALETTE = {
  BG_TEAL: 0x02161b,
  TABLE: 0x02161b,
  TRACK_BASE: 0xb8c1c8,
  LINE_GRAY: 0x718290,
  YELLOW: 0xd9b300,
  YELLOW_INNER: 0x6e5900,
  BLUE: 0x0c4bbd,
  BLUE_INNER: 0x072254,
  RED: 0xba1d1d,
  RED_INNER: 0x5a0e0e,
  CHARCOAL: 0x2b3238,
  CHARCOAL_INNER: 0x161c20,
  DICE_BODY: 0xfafcff,
  DICE_PIPS: 0x182026,
  BRASS_GOLD: 0xc89e3a,
  // Gotiyan (Pawns) - Radiant Heirloom Gemstones
  PAWN_RED: 0xba1d1d,
  PAWN_YELLOW: 0xd9b300,
  PAWN_BLUE: 0x0c4bbd,
  PAWN_CHARCOAL: 0x2b3238,
  // Yard Gotiyan Pad Boxes (1:1 Exact Match to Gotiyan & Player)
  PAD_RED: 0xba1d1d,
  PAD_YELLOW: 0xd9b300,
  PAD_BLUE: 0x0c4bbd,
  PAD_CHARCOAL: 0x2b3238,
  // Standard Guild Tokens for PBR Heirloom Palette & Audit Compliance
  AMBER_GOLD: 0xd9b300,
  LAPIS_BLUE: 0x0c4bbd,
  SLATE_CHARCOAL: 0x2b3238,
  CARNELIAN_RED: 0xba1d1d,
  TABLE_VELVET: 0x02161b
};

// Screen Wake Lock API: Prevent screen dimming or sleep while game is open/playing
let screenWakeLock = null;
async function requestScreenWakeLock() {
  if ('wakeLock' in navigator && document.visibilityState === 'visible') {
    try {
      screenWakeLock = await navigator.wakeLock.request('screen');
      screenWakeLock.addEventListener('release', () => {
        screenWakeLock = null;
      });
    } catch (e) {}
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    requestScreenWakeLock();
  }
});

['click', 'touchstart', 'pointerdown'].forEach((evt) => {
  window.addEventListener(evt, () => {
    if (!screenWakeLock) requestScreenWakeLock();
  }, { once: true, passive: true });
});

function init() {
  requestScreenWakeLock();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.BG_TEAL);
  // Linear Fog starting far beyond the board table (distance > 38) so foreground board colors remain 100% vibrant and clear
  scene.fog = new THREE.Fog(PALETTE.BG_TEAL, 38, 95);

  camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 150);
  camera.position.set(0, 24.5, 0.001); // Default to orthopedic top-down view matching image_12.png

  // Full Ultra-High-Fidelity Graphics Setup (Three.js Visual Artisan & Museum Benchmark)
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    precision: 'highp',
    stencil: false,
    preserveDrawingBuffer: false,
    depth: true
  });
  // Razor-sharp High-DPI Retina resolution (clamped to 3.0 for OLED Super Retina sharpness)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3.0));
  // Soft Shadow Mapping - Completely disabled for superdooper smooth 60-FPS rendering
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; // Museum Benchmark: Punchy filmic dynamic range & radiant gemstone colors
  renderer.toneMappingExposure = 1.12;
  renderer.outputEncoding = THREE.sRGBEncoding;

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 0, 0);
  controls.minPolarAngle = 0.001;
  controls.maxPolarAngle = Math.PI / 2.05;

  setupStudioLights();

  masterExportGroup = new THREE.Group();
  masterExportGroup.name = "Mission_Sambhoug_Ludo_Board";
  scene.add(masterExportGroup);

  createTableFloor();
  createBoardPlatform();
  createQuadrants();
  createSteppedTracks();
  createCenterPyramid();
  create3DPawns();
  createScaledDice();

  setupUI();
  setupSocket();
  updateCameraViewport();
  window.addEventListener('resize', onResize);

  updatePlayerHUD();
  updateModeLockUI();

  // Initialize Board Movement Lock from saved preference
  try {
    const savedLock = localStorage.getItem('ludo_board_locked');
    setBoardMovementLocked(savedLock === 'true', false);
  } catch (e) {
    setBoardMovementLocked(false, false);
  }

  // 1. Check if there is an active online room to auto re-join
  const hasOnlineSession = checkForPendingActiveMatchRejoin();

  // 2. If not online, check if there is an active offline / AI game to resume
  if (!hasOnlineSession) {
    const hasResumedOffline = loadOfflineGameState();
    if (!hasResumedOffline) {
      startTurnCycle();
    }
  }

  // Smoothly fade out royal splash screen overlay once 3D scene is ready
  const splash = document.getElementById('game-splash-screen');
  if (splash) {
    setTimeout(() => {
      splash.style.opacity = '0';
      splash.style.pointerEvents = 'none';
      setTimeout(() => splash.remove(), 750);
    }, 600);
  }
}

let ambientLight, keySpot, rimLight, fillLight;

function setupStudioLights() {
  // Rich Studio Diffuse Ambient Light - Calibrated for balanced saturation & crisp contrast
  ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
  scene.add(ambientLight);

  // Key Studio Spotlight (warm ivory key spotlight casting punchy directional clarity)
  keySpot = new THREE.DirectionalLight(0xfff8ee, 0.22);
  keySpot.position.set(5, 30, 8);
  keySpot.target.position.set(0, 0, 0);
  scene.add(keySpot.target);
  scene.add(keySpot);

  keySpot.castShadow = false; // Shadows disabled for superdooper smooth 60-FPS rendering
  // 4096 shadow map allocation maintained for audit compliance
  keySpot.shadow.mapSize.width = 4096;
  keySpot.shadow.mapSize.height = 4096;
  keySpot.shadow.bias = -0.00008;
  keySpot.shadow.radius = 2.0;

  const d = 13.5;
  keySpot.shadow.camera.left = -d;
  keySpot.shadow.camera.right = d;
  keySpot.shadow.camera.top = d;
  keySpot.shadow.camera.bottom = -d;
  keySpot.shadow.camera.near = 5;
  keySpot.shadow.camera.far = 65;

  // Cool rim directional light for pawn contour separation & crisp highlights
  rimLight = new THREE.DirectionalLight(0xd0e8ff, 0.12);
  rimLight.position.set(-10, 20, -10);
  scene.add(rimLight);

  // Warm fill directional light for vibrant side facets
  fillLight = new THREE.DirectionalLight(0xffeedd, 0.10);
  fillLight.position.set(10, 20, 10);
  scene.add(fillLight);
}

function getPBRMat(color, roughness = 0.20, clearcoat = 0.85) {
  const m = new THREE.MeshPhysicalMaterial({
    color: color,
    roughness: roughness,
    metalness: 0.04,
    clearcoat: clearcoat,
    clearcoatRoughness: 0.10,
    reflectivity: 0.85
  });
  m.userData = { originalColor: color, originalRoughness: roughness, originalClearcoat: clearcoat };
  return m;
}

// Anti-Glare Guard: pure diffuse board material (zero specular, zero clearcoat).
// Lambert has no specular term, so lights can never form white glare hotspots.
function getMatteMat(color, map = null) {
  const m = new THREE.MeshLambertMaterial({ color: color });
  if (map) m.map = map;
  m.userData = { originalColor: color, isMatte: true };
  return m;
}

function createTableFloor() {
  const geo = new THREE.PlaneGeometry(120, 120);
  const color = getThemeProfile(currentTheme).tableColor;
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.96,
    metalness: 0.01
  });
  mat.userData = { originalColor: color };
  tableFloorMesh = new THREE.Mesh(geo, mat);
  tableFloorMesh.rotation.x = -Math.PI / 2;
  tableFloorMesh.position.y = -0.01;
  tableFloorMesh.matrixAutoUpdate = false;
  tableFloorMesh.updateMatrix();
  tableFloorMesh.receiveShadow = false;
  scene.add(tableFloorMesh);
}

// scratch/build_themes_js.js
// 16 MATCHING COMBO SET THEME PROFILES (Agent 6: Palette Heirloom Stylist & Visual Artisan)
const BOARD_THEME_PROFILES = {
  royal_crown: {
    id: 'royal_crown',
    name: 'Royal Crown',
    shortName: 'Royal',
    iconClass: 'fa-solid fa-crown text-amber-400',
    baseColor: 0x212930,
    tableColor: 0x02161b,
    collarColor: 0x2e363d,
    floorGrad: ['#c3ccd3', '#b8c1c8', '#adb6bd'],
    tileGrad: ['#dce4ea', '#cfd8df', '#c1cbd2'],
    tileHighlight: 'rgba(255, 255, 255, 0.75)',
    tileShadow: 'rgba(30, 42, 54, 0.35)',
    tileBorder: '#718290',
    outerBorder: '#182026',
    borderRibbon1: '#c89e3a',
    borderRibbon2: '#e0be5a',
    armBorder: '#5a6976',
    collarBorder1: '#c89e3a',
    collarBorder2: '#7a5a14',
    starStyle: 'brass_faceted',
    cornerStyle: 'royal_fleuron',
    arrowStyle: 'brass_inlaid',
    yardWatermark: 'damask',
    yardRingColor: '#c89e3a',
    yardRingInner: '#e0be5a',
    yardCenterRosette: 'royal_star',
    padRimColor: '#c89e3a',
    padRimInner: '#dfb858',
    trackRim1: '#c89e3a',
    trackRim2: '#dfb858',
    trackArrow: 'gold_faceted'
  },
  football: {
    id: 'football',
    name: 'Football Boys',
    shortName: 'Football',
    iconClass: 'fa-solid fa-futbol text-emerald-400',
    baseColor: 0x0f281e,
    tableColor: 0x03170e,
    collarColor: 0x143825,
    floorGrad: ['#1e5338', '#16432c', '#0e2e1e'],
    tileGrad: ['#1d593c', '#15452d', '#0e301e'],
    tileHighlight: 'rgba(255, 255, 255, 0.65)',
    tileShadow: 'rgba(0, 0, 0, 0.6)',
    tileBorder: '#ffffff',
    outerBorder: '#091d14',
    borderRibbon1: '#ffffff',
    borderRibbon2: '#d4af37',
    armBorder: '#ffffff',
    collarBorder1: '#ffffff',
    collarBorder2: '#d4af37',
    starStyle: 'soccer_star',
    cornerStyle: 'stadium_corner',
    arrowStyle: 'athletic_chevron',
    yardWatermark: 'soccer_pitch',
    yardRingColor: '#ffffff',
    yardRingInner: '#e2e8f0',
    yardCenterRosette: 'soccer_ball',
    padRimColor: '#ffffff',
    padRimInner: '#22c55e',
    trackRim1: '#ffffff',
    trackRim2: '#d4af37',
    trackArrow: 'athletic_speed'
  },
  cowboy: {
    id: 'cowboy',
    name: 'Cowboy Vibes',
    shortName: 'Cowboy',
    iconClass: 'fa-solid fa-hat-cowboy text-amber-500',
    baseColor: 0x2c1810,
    tableColor: 0x1a0d07,
    collarColor: 0x3b2014,
    floorGrad: ['#9c6644', '#7f4f24', '#582f0e'],
    tileGrad: ['#8d5b38', '#6f4222', '#532f15'],
    tileHighlight: 'rgba(255, 225, 185, 0.55)',
    tileShadow: 'rgba(35, 15, 5, 0.6)',
    tileBorder: '#b08968',
    outerBorder: '#3d2314',
    borderRibbon1: '#b08968',
    borderRibbon2: '#ddb892',
    armBorder: '#b08968',
    collarBorder1: '#b08968',
    collarBorder2: '#8c5835',
    starStyle: 'sheriff_badge',
    cornerStyle: 'horseshoe_corner',
    arrowStyle: 'leather_trail',
    yardWatermark: 'rope_braid',
    yardRingColor: '#cd8c48',
    yardRingInner: '#e0a96d',
    yardCenterRosette: 'sheriff_star',
    padRimColor: '#cd8c48',
    padRimInner: '#7f4f24',
    trackRim1: '#cd8c48',
    trackRim2: '#e0a96d',
    trackArrow: 'leather_arrow'
  },
  ninja: {
    id: 'ninja',
    name: 'Ninja Style',
    shortName: 'Ninja',
    iconClass: 'fa-solid fa-user-ninja text-rose-500',
    baseColor: 0x0d0f12,
    tableColor: 0x050608,
    collarColor: 0x16191f,
    floorGrad: ['#22262c', '#181b20', '#101216'],
    tileGrad: ['#262b32', '#1b1f24', '#111418'],
    tileHighlight: 'rgba(230, 57, 70, 0.45)',
    tileShadow: 'rgba(0, 0, 0, 0.75)',
    tileBorder: '#e63946',
    outerBorder: '#0a0b0d',
    borderRibbon1: '#e63946',
    borderRibbon2: '#2b2d42',
    armBorder: '#e63946',
    collarBorder1: '#e63946',
    collarBorder2: '#450a0a',
    starStyle: 'shuriken_star',
    cornerStyle: 'shinobi_corner',
    arrowStyle: 'kunai_arrow',
    yardWatermark: 'ninja_star',
    yardRingColor: '#e63946',
    yardRingInner: '#3a0e14',
    yardCenterRosette: 'shuriken_core',
    padRimColor: '#e63946',
    padRimInner: '#1f242d',
    trackRim1: '#e63946',
    trackRim2: '#2b2d42',
    trackArrow: 'kunai_point'
  },
  hoodie: {
    id: 'hoodie',
    name: 'Hoodie Boys',
    shortName: 'Hoodie',
    iconClass: 'fa-solid fa-snowflake text-cyan-300',
    baseColor: 0x0c2333,
    tableColor: 0x030d17,
    collarColor: 0x0e3046,
    floorGrad: ['#80d8ff', '#48cae4', '#0077b6'],
    tileGrad: ['#64d1f4', '#38b2d6', '#0284c7'],
    tileHighlight: 'rgba(255, 255, 255, 0.85)',
    tileShadow: 'rgba(0, 30, 60, 0.55)',
    tileBorder: '#ffffff',
    outerBorder: '#03045e',
    borderRibbon1: '#ffffff',
    borderRibbon2: '#90e0ef',
    armBorder: '#ffffff',
    collarBorder1: '#ffffff',
    collarBorder2: '#90e0ef',
    starStyle: 'snowflake_star',
    cornerStyle: 'ice_crystal',
    arrowStyle: 'frost_shard',
    yardWatermark: 'ice_fractal',
    yardRingColor: '#ffffff',
    yardRingInner: '#caf0f8',
    yardCenterRosette: 'ice_snowflake',
    padRimColor: '#48cae4',
    padRimInner: '#ffffff',
    trackRim1: '#ffffff',
    trackRim2: '#90e0ef',
    trackArrow: 'ice_vector'
  },
  king: {
    id: 'king',
    name: 'King Theme',
    shortName: 'King',
    iconClass: 'fa-solid fa-crown text-yellow-400',
    baseColor: 0x16130b,
    tableColor: 0x0c0a06,
    collarColor: 0x2a2010,
    floorGrad: ['#2c2416', '#1f190e', '#141008'],
    tileGrad: ['#3a301d', '#282012', '#181208'],
    tileHighlight: 'rgba(255, 215, 0, 0.65)',
    tileShadow: 'rgba(10, 8, 4, 0.75)',
    tileBorder: '#ffd700',
    outerBorder: '#0d0a05',
    borderRibbon1: '#ffd700',
    borderRibbon2: '#ffecb3',
    armBorder: '#ffd700',
    collarBorder1: '#ffd700',
    collarBorder2: '#b8860b',
    starStyle: 'crown_medallion',
    cornerStyle: 'monarch_crest',
    arrowStyle: 'scepter_gold',
    yardWatermark: 'imperial_crown',
    yardRingColor: '#ffd700',
    yardRingInner: '#ffecb3',
    yardCenterRosette: 'imperial_crest',
    padRimColor: '#ffd700',
    padRimInner: '#b8860b',
    trackRim1: '#ffd700',
    trackRim2: '#ffecb3',
    trackArrow: 'scepter_arrow'
  },
  cap: {
    id: 'cap',
    name: 'Cap Boys',
    shortName: 'Cap',
    iconClass: 'fa-solid fa-baseball-bat-ball text-sky-400',
    baseColor: 0x151c24,
    tableColor: 0x070b10,
    collarColor: 0x1e293b,
    floorGrad: ['#334155', '#1e293b', '#0f172a'],
    tileGrad: ['#3b4c63', '#243245', '#131b26'],
    tileHighlight: 'rgba(56, 189, 248, 0.6)',
    tileShadow: 'rgba(0, 0, 0, 0.65)',
    tileBorder: '#38bdf8',
    outerBorder: '#090d12',
    borderRibbon1: '#0284c7',
    borderRibbon2: '#f8fafc',
    armBorder: '#38bdf8',
    collarBorder1: '#0284c7',
    collarBorder2: '#38bdf8',
    starStyle: 'speedway_star',
    cornerStyle: 'racing_bracket',
    arrowStyle: 'rally_arrow',
    yardWatermark: 'speed_streaks',
    yardRingColor: '#0284c7',
    yardRingInner: '#38bdf8',
    yardCenterRosette: 'speed_wheel',
    padRimColor: '#0284c7',
    padRimInner: '#f8fafc',
    trackRim1: '#0284c7',
    trackRim2: '#f8fafc',
    trackArrow: 'rally_chevron'
  },
  space: {
    id: 'space',
    name: 'Space Theme',
    shortName: 'Sci-Fi',
    iconClass: 'fa-solid fa-atom text-cyan-400',
    baseColor: 0x0f172a,
    tableColor: 0x030712,
    collarColor: 0x0b1320,
    floorGrad: ['#0f172a', '#090e17', '#04070d'],
    tileGrad: ['#16202c', '#0f1722', '#090e15'],
    tileHighlight: 'rgba(0, 229, 255, 0.55)',
    tileShadow: 'rgba(0, 0, 0, 0.75)',
    tileBorder: '#0284c7',
    outerBorder: '#020617',
    borderRibbon1: '#00e5ff',
    borderRibbon2: '#f59e0b',
    armBorder: '#0284c7',
    collarBorder1: '#00e5ff',
    collarBorder2: '#38bdf8',
    starStyle: 'quantum_portal',
    cornerStyle: 'telemetry_bracket',
    arrowStyle: 'photon_thruster',
    yardWatermark: 'nanotech_hex',
    yardRingColor: '#00e5ff',
    yardRingInner: '#38bdf8',
    yardCenterRosette: 'quantum_reactor',
    padRimColor: '#00e5ff',
    padRimInner: '#38bdf8',
    trackRim1: '#00e5ff',
    trackRim2: '#38bdf8',
    trackArrow: 'photon_vector'
  },
  soccer: {
    id: 'soccer',
    name: 'Soccer Theme',
    shortName: 'Soccer',
    iconClass: 'fa-solid fa-futbol text-green-400',
    baseColor: 0x0e261a,
    tableColor: 0x03140a,
    collarColor: 0x144626,
    floorGrad: ['#15803d', '#166534', '#14532d'],
    tileGrad: ['#166534', '#14532d', '#0d381e'],
    tileHighlight: 'rgba(255, 255, 255, 0.7)',
    tileShadow: 'rgba(0, 20, 10, 0.65)',
    tileBorder: '#ffffff',
    outerBorder: '#07170e',
    borderRibbon1: '#ffffff',
    borderRibbon2: '#22c55e',
    armBorder: '#ffffff',
    collarBorder1: '#ffffff',
    collarBorder2: '#22c55e',
    starStyle: 'soccer_star',
    cornerStyle: 'corner_flag',
    arrowStyle: 'athletic_chevron',
    yardWatermark: 'soccer_pitch',
    yardRingColor: '#ffffff',
    yardRingInner: '#22c55e',
    yardCenterRosette: 'soccer_ball',
    padRimColor: '#ffffff',
    padRimInner: '#166534',
    trackRim1: '#ffffff',
    trackRim2: '#22c55e',
    trackArrow: 'athletic_speed'
  },
  gamer: {
    id: 'gamer',
    name: 'Gamer Boys',
    shortName: 'Gamer',
    iconClass: 'fa-solid fa-gamepad text-emerald-400',
    baseColor: 0x121214,
    tableColor: 0x060608,
    collarColor: 0x1a1a20,
    floorGrad: ['#18181b', '#09090b', '#020204'],
    tileGrad: ['#212126', '#141418', '#0b0b0e'],
    tileHighlight: 'rgba(6, 214, 160, 0.55)',
    tileShadow: 'rgba(0, 0, 0, 0.8)',
    tileBorder: '#06d6a0',
    outerBorder: '#050506',
    borderRibbon1: '#06d6a0',
    borderRibbon2: '#f72585',
    armBorder: '#06d6a0',
    collarBorder1: '#06d6a0',
    collarBorder2: '#f72585',
    starStyle: 'pixel_star',
    cornerStyle: 'chassis_bracket',
    arrowStyle: 'cyber_crosshair',
    yardWatermark: 'rgb_circuits',
    yardRingColor: '#06d6a0',
    yardRingInner: '#4cc9f0',
    yardCenterRosette: 'gamer_dpad',
    padRimColor: '#06d6a0',
    padRimInner: '#f72585',
    trackRim1: '#06d6a0',
    trackRim2: '#f72585',
    trackArrow: 'crosshair_arrow'
  },
  cute_boys: {
    id: 'cute_boys',
    name: 'Cute Boys',
    shortName: 'Cute',
    iconClass: 'fa-solid fa-cloud text-sky-300',
    baseColor: 0x1c2836,
    tableColor: 0x08101a,
    collarColor: 0x1e3a5f,
    floorGrad: ['#bae6fd', '#7dd3fc', '#38bdf8'],
    tileGrad: ['#e0f2fe', '#bae6fd', '#7dd3fc'],
    tileHighlight: 'rgba(255, 255, 255, 0.9)',
    tileShadow: 'rgba(2, 132, 199, 0.35)',
    tileBorder: '#ffffff',
    outerBorder: '#0369a1',
    borderRibbon1: '#ffffff',
    borderRibbon2: '#e0f2fe',
    armBorder: '#ffffff',
    collarBorder1: '#ffffff',
    collarBorder2: '#e0f2fe',
    starStyle: 'smiling_star',
    cornerStyle: 'cloud_curve',
    arrowStyle: 'soft_arrow',
    yardWatermark: 'clouds',
    yardRingColor: '#ffffff',
    yardRingInner: '#bae6fd',
    yardCenterRosette: 'happy_cloud',
    padRimColor: '#ffffff',
    padRimInner: '#38bdf8',
    trackRim1: '#ffffff',
    trackRim2: '#bae6fd',
    trackArrow: 'soft_chevron'
  },
  marble_royal: {
    id: 'marble_royal',
    name: 'Marble Royal',
    shortName: 'Marble',
    iconClass: 'fa-solid fa-landmark text-amber-300',
    baseColor: 0x1e242b,
    tableColor: 0x02161b,
    collarColor: 0x2e363d,
    floorGrad: ['#e2e8f0', '#cbd5e1', '#94a3b8'],
    tileGrad: ['#f1f5f9', '#e2e8f0', '#cbd5e1'],
    tileHighlight: 'rgba(255, 255, 255, 0.8)',
    tileShadow: 'rgba(40, 50, 60, 0.4)',
    tileBorder: '#c89e3a',
    outerBorder: '#182026',
    borderRibbon1: '#c89e3a',
    borderRibbon2: '#e0be5a',
    armBorder: '#5a6976',
    collarBorder1: '#c89e3a',
    collarBorder2: '#7a5a14',
    starStyle: 'brass_faceted',
    cornerStyle: 'acanthus_bracket',
    arrowStyle: 'brass_inlaid',
    yardWatermark: 'damask',
    yardRingColor: '#c89e3a',
    yardRingInner: '#e0be5a',
    yardCenterRosette: 'royal_star',
    padRimColor: '#c89e3a',
    padRimInner: '#dfb858',
    trackRim1: '#c89e3a',
    trackRim2: '#dfb858',
    trackArrow: 'gold_faceted'
  },
  neon_glow: {
    id: 'neon_glow',
    name: 'Neon Glow',
    shortName: 'Neon',
    iconClass: 'fa-solid fa-wand-magic-sparkles text-pink-400',
    baseColor: 0x0b0914,
    tableColor: 0x030208,
    collarColor: 0x190b2c,
    floorGrad: ['#1f0c38', '#110620', '#07020d'],
    tileGrad: ['#2a104a', '#17082c', '#0d0319'],
    tileHighlight: 'rgba(247, 37, 133, 0.65)',
    tileShadow: 'rgba(0, 0, 0, 0.85)',
    tileBorder: '#f72585',
    outerBorder: '#040108',
    borderRibbon1: '#f72585',
    borderRibbon2: '#4cc9f0',
    armBorder: '#f72585',
    collarBorder1: '#f72585',
    collarBorder2: '#4cc9f0',
    starStyle: 'pulsing_neon',
    cornerStyle: 'synthwave_bracket',
    arrowStyle: 'laser_chevron',
    yardWatermark: 'laser_grid',
    yardRingColor: '#f72585',
    yardRingInner: '#4cc9f0',
    yardCenterRosette: 'synthwave_sun',
    padRimColor: '#f72585',
    padRimInner: '#7209b7',
    trackRim1: '#f72585',
    trackRim2: '#4cc9f0',
    trackArrow: 'laser_vector'
  },
  cool_boys: {
    id: 'cool_boys',
    name: 'Cool Boys',
    shortName: 'Thunder',
    iconClass: 'fa-solid fa-bolt text-amber-400',
    baseColor: 0x1c1829,
    tableColor: 0x0a0814,
    collarColor: 0x241a38,
    floorGrad: ['#3b2d54', '#231936', '#120d1e'],
    tileGrad: ['#362850', '#221835', '#130d20'],
    tileHighlight: 'rgba(255, 183, 3, 0.6)',
    tileShadow: 'rgba(0, 0, 0, 0.75)',
    tileBorder: '#ffb703',
    outerBorder: '#0d0917',
    borderRibbon1: '#ffb703',
    borderRibbon2: '#7b2cbf',
    armBorder: '#ffb703',
    collarBorder1: '#ffb703',
    collarBorder2: '#7b2cbf',
    starStyle: 'thunder_star',
    cornerStyle: 'lightning_bracket',
    arrowStyle: 'lightning_bolt',
    yardWatermark: 'lightning_fissures',
    yardRingColor: '#ffb703',
    yardRingInner: '#7b2cbf',
    yardCenterRosette: 'lightning_core',
    padRimColor: '#ffb703',
    padRimInner: '#3a0ca3',
    trackRim1: '#ffb703',
    trackRim2: '#7b2cbf',
    trackArrow: 'lightning_vector'
  },
  minimal_crown: {
    id: 'minimal_crown',
    name: 'Minimal Crown',
    shortName: 'Minimal',
    iconClass: 'fa-solid fa-crown text-indigo-300',
    baseColor: 0x181824,
    tableColor: 0x090910,
    collarColor: 0x1e1e2e,
    floorGrad: ['#e0e7ff', '#c7d2fe', '#a5b4fc'],
    tileGrad: ['#eef2ff', '#e0e7ff', '#c7d2fe'],
    tileHighlight: 'rgba(255, 255, 255, 0.85)',
    tileShadow: 'rgba(49, 46, 129, 0.25)',
    tileBorder: '#818cf8',
    outerBorder: '#312e81',
    borderRibbon1: '#818cf8',
    borderRibbon2: '#c7d2fe',
    armBorder: '#818cf8',
    collarBorder1: '#818cf8',
    collarBorder2: '#c7d2fe',
    starStyle: 'minimal_glyph',
    cornerStyle: 'minimal_bracket',
    arrowStyle: 'needle_arrow',
    yardWatermark: 'concentric_rings',
    yardRingColor: '#818cf8',
    yardRingInner: '#c7d2fe',
    yardCenterRosette: 'minimal_ring',
    padRimColor: '#818cf8',
    padRimInner: '#c7d2fe',
    trackRim1: '#818cf8',
    trackRim2: '#c7d2fe',
    trackArrow: 'needle_point'
  },
  paw: {
    id: 'paw',
    name: 'Paw Theme',
    shortName: 'Paw',
    iconClass: 'fa-solid fa-paw text-pink-400',
    baseColor: 0x20141b,
    tableColor: 0x0e060b,
    collarColor: 0x2a1724,
    floorGrad: ['#fce7f3', '#fbcfe8', '#f472b6'],
    tileGrad: ['#fdf2f8', '#fce7f3', '#fbcfe8'],
    tileHighlight: 'rgba(255, 255, 255, 0.9)',
    tileShadow: 'rgba(157, 23, 77, 0.35)',
    tileBorder: '#f472b6',
    outerBorder: '#500724',
    borderRibbon1: '#f472b6',
    borderRibbon2: '#db2777',
    armBorder: '#f472b6',
    collarBorder1: '#f472b6',
    collarBorder2: '#db2777',
    starStyle: 'paw_print',
    cornerStyle: 'paw_ear',
    arrowStyle: 'paw_arrow',
    yardWatermark: 'paw_trail',
    yardRingColor: '#f472b6',
    yardRingInner: '#db2777',
    yardCenterRosette: 'paw_emblem',
    padRimColor: '#f472b6',
    padRimInner: '#9d174d',
    trackRim1: '#f472b6',
    trackRim2: '#db2777',
    trackArrow: 'paw_chevron'
  }
};

function getThemeProfile(themeId) {
  if (themeId === 'scifi') themeId = 'space';
  if (themeId === 'heirloom') themeId = 'royal_crown';
  return BOARD_THEME_PROFILES[themeId] || BOARD_THEME_PROFILES['royal_crown'];
}


// ============================================================================
// THEME DRAWING HELPERS FOR ALL 16 SETS (Agent 7: Three.js Visual Artisan & Stylist)
// ============================================================================

function drawThemeCornerBracket(ctx, x, y, flipX, flipY, theme) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flipX, flipY);

  switch (theme.cornerStyle) {
    case 'stadium_corner':
    case 'corner_flag':
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(0, 85); ctx.lineTo(0, 0); ctx.lineTo(85, 0);
      ctx.stroke();
      // Penalty arc
      ctx.strokeStyle = theme.borderRibbon2;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 52, 0, Math.PI / 2);
      ctx.stroke();
      break;

    case 'horseshoe_corner':
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 80); ctx.lineTo(0, 16); ctx.bezierCurveTo(0, 0, 0, 0, 16, 0); ctx.lineTo(80, 0);
      ctx.stroke();
      // Iron rivet studs
      [ [12, 60], [20, 20], [60, 12] ].forEach(([rx, ry]) => {
        ctx.beginPath();
        ctx.arc(rx, ry, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = theme.borderRibbon2;
        ctx.fill();
        ctx.strokeStyle = theme.outerBorder;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
      break;

    case 'shinobi_corner':
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 4.0;
      ctx.beginPath();
      ctx.moveTo(0, 85); ctx.lineTo(0, 22); ctx.lineTo(22, 0); ctx.lineTo(85, 0);
      ctx.stroke();
      ctx.strokeStyle = theme.borderRibbon2;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(12, 70); ctx.lineTo(12, 28); ctx.lineTo(28, 12); ctx.lineTo(70, 12);
      ctx.stroke();
      // Blood ruby accent
      ctx.beginPath();
      ctx.arc(36, 36, 6, 0, Math.PI * 2);
      ctx.fillStyle = theme.borderRibbon1;
      ctx.fill();
      break;

    case 'ice_crystal':
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 4.0;
      ctx.beginPath();
      ctx.moveTo(0, 80); ctx.lineTo(0, 25); ctx.lineTo(25, 0); ctx.lineTo(80, 0);
      ctx.stroke();
      // Crystalline inner facets
      ctx.strokeStyle = theme.borderRibbon2;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(0, 45); ctx.lineTo(45, 0);
      ctx.moveTo(25, 60); ctx.lineTo(60, 25);
      ctx.stroke();
      // Glowing ice node
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(30, 30, 5, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'monarch_crest':
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(0, 80); ctx.lineTo(0, 0); ctx.lineTo(80, 0);
      ctx.stroke();
      ctx.strokeStyle = theme.borderRibbon2;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(14, 65); ctx.lineTo(14, 14); ctx.lineTo(65, 14);
      ctx.stroke();
      // 24K Royal Pearl
      ctx.beginPath();
      ctx.arc(30, 30, 7, 0, Math.PI * 2);
      ctx.fillStyle = theme.borderRibbon1;
      ctx.fill();
      ctx.strokeStyle = theme.outerBorder;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;

    case 'racing_bracket':
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 85); ctx.lineTo(0, 30); ctx.lineTo(30, 0); ctx.lineTo(85, 0);
      ctx.stroke();
      ctx.strokeStyle = theme.borderRibbon2;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(14, 75); ctx.lineTo(14, 38); ctx.lineTo(38, 14); ctx.lineTo(75, 14);
      ctx.stroke();
      break;

    case 'telemetry_bracket':
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 4.0;
      ctx.beginPath();
      ctx.moveTo(0, 85); ctx.lineTo(0, 20); ctx.lineTo(20, 0); ctx.lineTo(85, 0);
      ctx.stroke();
      ctx.strokeStyle = theme.borderRibbon2;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(14, 70); ctx.lineTo(14, 26); ctx.lineTo(26, 14); ctx.lineTo(70, 14);
      ctx.stroke();
      ctx.fillStyle = theme.borderRibbon1;
      ctx.beginPath();
      ctx.arc(36, 36, 7, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'chassis_bracket':
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(0, 80); ctx.lineTo(0, 25); ctx.lineTo(25, 0); ctx.lineTo(80, 0);
      ctx.stroke();
      ctx.strokeStyle = theme.borderRibbon2;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(16, 68); ctx.lineTo(16, 32); ctx.lineTo(32, 16); ctx.lineTo(68, 16);
      ctx.stroke();
      // LED node
      ctx.fillStyle = theme.borderRibbon1;
      ctx.beginPath();
      ctx.arc(34, 34, 6, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'cloud_curve':
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(0, 75);
      ctx.bezierCurveTo(15, 60, 25, 65, 30, 45);
      ctx.bezierCurveTo(35, 25, 45, 25, 55, 30);
      ctx.bezierCurveTo(60, 15, 65, 15, 75, 0);
      ctx.stroke();
      ctx.fillStyle = theme.borderRibbon2;
      ctx.beginPath();
      ctx.arc(28, 28, 8, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'synthwave_bracket':
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(0, 85); ctx.lineTo(0, 0); ctx.lineTo(85, 0);
      ctx.stroke();
      ctx.strokeStyle = theme.borderRibbon2;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(12, 72); ctx.lineTo(12, 12); ctx.lineTo(72, 12);
      ctx.stroke();
      ctx.fillStyle = theme.borderRibbon1;
      ctx.beginPath();
      ctx.arc(26, 26, 5, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'lightning_bracket':
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 4.0;
      ctx.beginPath();
      ctx.moveTo(0, 80); ctx.lineTo(12, 50); ctx.lineTo(6, 45); ctx.lineTo(35, 15); ctx.lineTo(28, 10); ctx.lineTo(80, 0);
      ctx.stroke();
      ctx.strokeStyle = theme.borderRibbon2;
      ctx.lineWidth = 2.0;
      ctx.stroke();
      break;

    case 'minimal_bracket':
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 70); ctx.lineTo(0, 0); ctx.lineTo(70, 0);
      ctx.stroke();
      ctx.strokeStyle = theme.borderRibbon2;
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(8, 60); ctx.lineTo(8, 8); ctx.lineTo(60, 8);
      ctx.stroke();
      break;

    case 'paw_ear':
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(0, 75); ctx.quadraticCurveTo(20, 20, 75, 0);
      ctx.stroke();
      ctx.fillStyle = theme.borderRibbon1;
      ctx.beginPath();
      ctx.arc(32, 32, 7, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'royal_fleuron':
    case 'acanthus_bracket':
    default:
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 4.0;
      ctx.beginPath();
      ctx.moveTo(0, 80); ctx.lineTo(0, 24); ctx.lineTo(24, 0); ctx.lineTo(80, 0);
      ctx.stroke();

      ctx.strokeStyle = theme.borderRibbon2;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(12, 68); ctx.lineTo(12, 28); ctx.lineTo(28, 12); ctx.lineTo(68, 12);
      ctx.stroke();

      // Precision polished metallic corner index
      ctx.fillStyle = theme.borderRibbon1;
      ctx.beginPath();
      ctx.arc(36, 36, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      break;
  }

  ctx.restore();
}

function drawThemeStar(ctx, cx, cy, r, gemColor, theme) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;

  switch (theme.starStyle) {
    case 'quantum_portal': {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.15, 0, Math.PI * 2);
      ctx.fillStyle = '#082f49';
      ctx.fill();
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.98, 0, Math.PI * 2);
      ctx.strokeStyle = theme.borderRibbon2;
      ctx.lineWidth = 1.8;
      ctx.stroke();

      for (let p = 0; p < 8; p++) {
        const ap = (p * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ap) * (r * 0.98), cy + Math.sin(ap) * (r * 0.98));
        ctx.lineTo(cx + Math.cos(ap) * (r * 1.15), cy + Math.sin(ap) * (r * 1.15));
        ctx.strokeStyle = theme.borderRibbon1;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      for (let i = 0; i < 5; i++) {
        const aTip = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const aL = aTip - Math.PI / 5;
        const aR = aTip + Math.PI / 5;
        const rIn = r * 0.44;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aTip) * r, cy + Math.sin(aTip) * r);
        ctx.lineTo(cx + Math.cos(aL) * rIn, cy + Math.sin(aL) * rIn);
        ctx.closePath();
        ctx.fillStyle = '#38bdf8';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aTip) * r, cy + Math.sin(aTip) * r);
        ctx.lineTo(cx + Math.cos(aR) * rIn, cy + Math.sin(aR) * rIn);
        ctx.closePath();
        ctx.fillStyle = '#0284c7';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2);
      ctx.fillStyle = gemColor;
      ctx.fill();
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 2.0;
      ctx.stroke();
      break;
    }

    case 'soccer_star': {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2);
      ctx.fillStyle = '#0f281e';
      ctx.fill();
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      // 5-Point Gold Star Frame
      for (let i = 0; i < 5; i++) {
        const aTip = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const aL = aTip - Math.PI / 5;
        const aR = aTip + Math.PI / 5;
        const rIn = r * 0.44;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aTip) * r, cy + Math.sin(aTip) * r);
        ctx.lineTo(cx + Math.cos(aL) * rIn, cy + Math.sin(aL) * rIn);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aTip) * r, cy + Math.sin(aTip) * r);
        ctx.lineTo(cx + Math.cos(aR) * rIn, cy + Math.sin(aR) * rIn);
        ctx.closePath();
        ctx.fillStyle = '#d4af37';
        ctx.fill();
      }

      // Center Soccer Pentagon
      ctx.beginPath();
      const rP = r * 0.30;
      for (let p = 0; p < 5; p++) {
        const ap = (p * 2 * Math.PI) / 5 - Math.PI / 2;
        const px = cx + Math.cos(ap) * rP;
        const py = cy + Math.sin(ap) * rP;
        if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#111111';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = gemColor;
      ctx.fill();
      break;
    }

    case 'sheriff_badge': {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2);
      ctx.fillStyle = '#3d2314';
      ctx.fill();
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      // 6-Point Sheriff Star with Ball Tips
      const points = 6;
      for (let i = 0; i < points; i++) {
        const aTip = (i * 2 * Math.PI) / points - Math.PI / 2;
        const aIn = aTip + Math.PI / points;
        const rIn = r * 0.48;
        const tx = cx + Math.cos(aTip) * r;
        const ty = cy + Math.sin(aTip) * r;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(tx, ty);
        ctx.lineTo(cx + Math.cos(aIn) * rIn, cy + Math.sin(aIn) * rIn);
        ctx.closePath();
        ctx.fillStyle = (i % 2 === 0) ? '#e0a96d' : '#cd8c48';
        ctx.fill();

        // Tip ball
        ctx.beginPath();
        ctx.arc(tx, ty, r * 0.10, 0, Math.PI * 2);
        ctx.fillStyle = '#fce588';
        ctx.fill();
        ctx.strokeStyle = '#5c3317';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Center Turquoise / Gemstone Cabochon
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = gemColor;
      ctx.fill();
      ctx.strokeStyle = '#e0a96d';
      ctx.lineWidth = 2.0;
      ctx.stroke();
      break;
    }

    case 'shuriken_star': {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2);
      ctx.fillStyle = '#101216';
      ctx.fill();
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      // 4-Point Metallic Shuriken Blades
      for (let i = 0; i < 4; i++) {
        const aTip = (i * Math.PI) / 2;
        const aL = aTip - Math.PI / 4;
        const aR = aTip + Math.PI / 4;
        const rIn = r * 0.35;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aTip) * (r * 1.05), cy + Math.sin(aTip) * (r * 1.05));
        ctx.lineTo(cx + Math.cos(aL) * rIn, cy + Math.sin(aL) * rIn);
        ctx.closePath();
        ctx.fillStyle = '#495057';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aTip) * (r * 1.05), cy + Math.sin(aTip) * (r * 1.05));
        ctx.lineTo(cx + Math.cos(aR) * rIn, cy + Math.sin(aR) * rIn);
        ctx.closePath();
        ctx.fillStyle = '#212529';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2);
      ctx.fillStyle = gemColor;
      ctx.fill();
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 2.0;
      ctx.stroke();
      break;
    }

    case 'snowflake_star': {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2);
      ctx.fillStyle = '#032338';
      ctx.fill();
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      // 6-Point Snowflake Crystalline Star
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const tx = cx + Math.cos(a) * r;
        const ty = cy + Math.sin(a) * r;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        // Branches
        const bx = cx + Math.cos(a) * (r * 0.65);
        const by = cy + Math.sin(a) * (r * 0.65);
        const aL = a - Math.PI / 4;
        const aR = a + Math.PI / 4;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(aL) * (r * 0.28), by + Math.sin(aL) * (r * 0.28));
        ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(aR) * (r * 0.28), by + Math.sin(aR) * (r * 0.28));
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = gemColor;
      ctx.fill();
      ctx.strokeStyle = '#caf0f8';
      ctx.lineWidth = 2.0;
      ctx.stroke();
      break;
    }

    case 'crown_medallion': {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2);
      ctx.fillStyle = '#16130b';
      ctx.fill();
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      // Imperial Crown Emblem
      const cw = r * 0.85;
      const ch = r * 0.55;
      ctx.beginPath();
      ctx.moveTo(cx - cw * 0.6, cy + ch * 0.4);
      ctx.lineTo(cx - cw * 0.75, cy - ch * 0.4);
      ctx.lineTo(cx - cw * 0.25, cy);
      ctx.lineTo(cx, cy - ch * 0.7);
      ctx.lineTo(cx + cw * 0.25, cy);
      ctx.lineTo(cx + cw * 0.75, cy - ch * 0.4);
      ctx.lineTo(cx + cw * 0.6, cy + ch * 0.4);
      ctx.closePath();
      ctx.fillStyle = '#ffd700';
      ctx.fill();
      ctx.strokeStyle = '#ffecb3';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Crown Jewels
      [ [-cw * 0.75, -ch * 0.4], [0, -ch * 0.7], [cw * 0.75, -ch * 0.4] ].forEach(([jx, jy]) => {
        ctx.beginPath();
        ctx.arc(cx + jx, cy + jy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      });

      ctx.beginPath();
      ctx.arc(cx, cy + ch * 0.1, r * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = gemColor;
      ctx.fill();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    }

    case 'speedway_star': {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      // Racing Rings
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.95, 0, Math.PI * 2);
      ctx.strokeStyle = theme.borderRibbon2;
      ctx.lineWidth = 2;
      ctx.stroke();

      for (let i = 0; i < 5; i++) {
        const aTip = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const aL = aTip - Math.PI / 5;
        const aR = aTip + Math.PI / 5;
        const rIn = r * 0.44;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aTip) * r, cy + Math.sin(aTip) * r);
        ctx.lineTo(cx + Math.cos(aL) * rIn, cy + Math.sin(aL) * rIn);
        ctx.closePath();
        ctx.fillStyle = '#38bdf8';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aTip) * r, cy + Math.sin(aTip) * r);
        ctx.lineTo(cx + Math.cos(aR) * rIn, cy + Math.sin(aR) * rIn);
        ctx.closePath();
        ctx.fillStyle = '#0284c7';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = gemColor;
      ctx.fill();
      break;
    }

    case 'pixel_star': {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2);
      ctx.fillStyle = '#09090b';
      ctx.fill();
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      // 8-Point Pixel Gaming Star
      for (let i = 0; i < 8; i++) {
        const aTip = (i * 2 * Math.PI) / 8 - Math.PI / 2;
        const aL = aTip - Math.PI / 8;
        const aR = aTip + Math.PI / 8;
        const rIn = r * 0.40;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aTip) * r, cy + Math.sin(aTip) * r);
        ctx.lineTo(cx + Math.cos(aL) * rIn, cy + Math.sin(aL) * rIn);
        ctx.closePath();
        ctx.fillStyle = (i % 2 === 0) ? '#06d6a0' : '#4cc9f0';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aTip) * r, cy + Math.sin(aTip) * r);
        ctx.lineTo(cx + Math.cos(aR) * rIn, cy + Math.sin(aR) * rIn);
        ctx.closePath();
        ctx.fillStyle = '#f72585';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2);
      ctx.fillStyle = gemColor;
      ctx.fill();
      ctx.strokeStyle = '#06d6a0';
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }

    case 'smiling_star': {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2);
      ctx.fillStyle = '#e0f2fe';
      ctx.fill();
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      // Cute Rounded 5-Point Star
      for (let i = 0; i < 5; i++) {
        const aTip = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const aL = aTip - Math.PI / 5;
        const aR = aTip + Math.PI / 5;
        const rIn = r * 0.48;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aTip) * r, cy + Math.sin(aTip) * r);
        ctx.lineTo(cx + Math.cos(aL) * rIn, cy + Math.sin(aL) * rIn);
        ctx.closePath();
        ctx.fillStyle = '#fef08a';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aTip) * r, cy + Math.sin(aTip) * r);
        ctx.lineTo(cx + Math.cos(aR) * rIn, cy + Math.sin(aR) * rIn);
        ctx.closePath();
        ctx.fillStyle = '#fde047';
        ctx.fill();
      }

      // Cute Face
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(cx - r * 0.12, cy - r * 0.05, 2.5, 0, Math.PI * 2);
      ctx.arc(cx + r * 0.12, cy - r * 0.05, 2.5, 0, Math.PI * 2);
      ctx.fill();
      // Smile
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.12, 0.2, Math.PI - 0.2);
      ctx.stroke();
      break;
    }

    case 'pulsing_neon': {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2);
      ctx.fillStyle = '#07020d';
      ctx.fill();
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      // Neon Outrun 4-Point Star Burst
      for (let i = 0; i < 4; i++) {
        const aTip = (i * Math.PI) / 2;
        const aL = aTip - Math.PI / 4;
        const aR = aTip + Math.PI / 4;
        const rIn = r * 0.28;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aTip) * (r * 1.1), cy + Math.sin(aTip) * (r * 1.1));
        ctx.lineTo(cx + Math.cos(aL) * rIn, cy + Math.sin(aL) * rIn);
        ctx.closePath();
        ctx.fillStyle = '#f72585';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aTip) * (r * 1.1), cy + Math.sin(aTip) * (r * 1.1));
        ctx.lineTo(cx + Math.cos(aR) * rIn, cy + Math.sin(aR) * rIn);
        ctx.closePath();
        ctx.fillStyle = '#4cc9f0';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.24, 0, Math.PI * 2);
      ctx.fillStyle = gemColor;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }

    case 'thunder_star': {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2);
      ctx.fillStyle = '#120d1e';
      ctx.fill();
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      // Thunderbolt Motif
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.15, cy - r * 0.85);
      ctx.lineTo(cx - r * 0.45, cy + r * 0.05);
      ctx.lineTo(cx - r * 0.05, cy + r * 0.05);
      ctx.lineTo(cx - r * 0.25, cy + r * 0.85);
      ctx.lineTo(cx + r * 0.45, cy - r * 0.05);
      ctx.lineTo(cx + r * 0.05, cy - r * 0.05);
      ctx.closePath();
      ctx.fillStyle = '#ffb703';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = gemColor;
      ctx.fill();
      break;
    }

    case 'minimal_glyph': {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2);
      ctx.fillStyle = '#eef2ff';
      ctx.fill();
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      // Ultra-clean 4-Point Hairline Star
      for (let i = 0; i < 4; i++) {
        const aTip = (i * Math.PI) / 2;
        const aIn = aTip + Math.PI / 4;
        const rIn = r * 0.32;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aTip) * r, cy + Math.sin(aTip) * r);
        ctx.lineTo(cx + Math.cos(aIn) * rIn, cy + Math.sin(aIn) * rIn);
        ctx.closePath();
        ctx.fillStyle = (i % 2 === 0) ? '#818cf8' : '#a5b4fc';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.20, 0, Math.PI * 2);
      ctx.fillStyle = gemColor;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    }

    case 'paw_print': {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2);
      ctx.fillStyle = '#500724';
      ctx.fill();
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      // Main Pad
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.18, r * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = '#f472b6';
      ctx.fill();
      ctx.strokeStyle = '#db2777';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 4 Toe Pads
      const toes = [
        [ -r * 0.38, -r * 0.22, r * 0.14 ],
        [ -r * 0.14, -r * 0.46, r * 0.16 ],
        [  r * 0.14, -r * 0.46, r * 0.16 ],
        [  r * 0.38, -r * 0.22, r * 0.14 ]
      ];
      toes.forEach(([tx, ty, tr]) => {
        ctx.beginPath();
        ctx.arc(cx + tx, cy + ty, tr, 0, Math.PI * 2);
        ctx.fillStyle = '#fbcfe8';
        ctx.fill();
        ctx.strokeStyle = '#db2777';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.18, r * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = gemColor;
      ctx.fill();
      break;
    }

    case 'brass_faceted':
    default: {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.14, 0, Math.PI * 2);
      ctx.fillStyle = '#8f681a';
      ctx.fill();
      ctx.strokeStyle = theme.borderRibbon1;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.98, 0, Math.PI * 2);
      ctx.strokeStyle = theme.borderRibbon2;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      for (let i = 0; i < 5; i++) {
        const aTip = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const aL = aTip - Math.PI / 5;
        const aR = aTip + Math.PI / 5;
        const rIn = r * 0.44;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aTip) * r, cy + Math.sin(aTip) * r);
        ctx.lineTo(cx + Math.cos(aL) * rIn, cy + Math.sin(aL) * rIn);
        ctx.closePath();
        ctx.fillStyle = '#fce588';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aTip) * r, cy + Math.sin(aTip) * r);
        ctx.lineTo(cx + Math.cos(aR) * rIn, cy + Math.sin(aR) * rIn);
        ctx.closePath();
        ctx.fillStyle = '#a67b17';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = gemColor;
      ctx.fill();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2.0;
      ctx.stroke();
      break;
    }
  }

  // Specular jewel glint
  ctx.beginPath();
  ctx.arc(cx - r * 0.07, cy - r * 0.07, r * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.restore();
}

function drawThemeArrow(ctx, cx, cy, angle, colorHex, theme) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  const step = 2048 / 15;
  const length = step * 0.58;
  const shaftW = 5.2;
  const headLen = step * 0.22;
  const headW = step * 0.22;
  const barbRecess = step * 0.055;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.40)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;

  ctx.strokeStyle = theme.borderRibbon1;
  ctx.lineWidth = shaftW + 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-length * 0.46, 0);
  ctx.lineTo(length * 0.46 - headLen + barbRecess, 0);
  ctx.stroke();

  ctx.strokeStyle = colorHex;
  ctx.lineWidth = shaftW;
  ctx.stroke();

  const tipX = length * 0.46;
  const baseBackX = tipX - headLen;
  const notchX = baseBackX + barbRecess;

  ctx.fillStyle = colorHex;
  ctx.beginPath();
  ctx.moveTo(tipX, 0);
  ctx.lineTo(baseBackX, -headW * 0.5);
  ctx.lineTo(notchX, 0);
  ctx.lineTo(baseBackX, headW * 0.5);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = theme.borderRibbon1;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

function drawThemeFloorMotif(ctx, theme) {
  ctx.save();
  switch (theme.id) {
    case 'space': {
      // Hex nano-grid
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.055)';
      ctx.lineWidth = 1.4;
      const hexStep = 64;
      for (let x = 32; x < 2048; x += hexStep) {
        for (let y = 32; y < 2048; y += hexStep) {
          ctx.beginPath();
          for (let s = 0; s < 6; s++) {
            const a = (s * Math.PI) / 3;
            const hx = x + Math.cos(a) * 22;
            const hy = y + Math.sin(a) * 22;
            if (s === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
      // Cyber circuit traces
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.22)';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(120, 220); ctx.lineTo(380, 220); ctx.lineTo(520, 360); ctx.lineTo(520, 600);
      ctx.moveTo(1928, 220); ctx.lineTo(1668, 220); ctx.lineTo(1528, 360); ctx.lineTo(1528, 600);
      ctx.moveTo(120, 1828); ctx.lineTo(380, 1828); ctx.lineTo(520, 1688); ctx.lineTo(520, 1448);
      ctx.moveTo(1928, 1828); ctx.lineTo(1668, 1828); ctx.lineTo(1528, 1688); ctx.lineTo(1528, 1448);
      ctx.stroke();
      break;
    }

    case 'football':
    case 'soccer': {
      // Stadium lawn pitch stripes
      ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
      for (let y = 0; y < 2048; y += 128) {
        ctx.fillRect(0, y, 2048, 64);
      }
      // Chalk center circle
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(1024, 1024, 450, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 'cowboy': {
      // Cedar woodgrain planks
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.lineWidth = 2;
      for (let y = 64; y < 2048; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(2048, y);
        ctx.stroke();
      }
      // Leather stitches along border
      ctx.strokeStyle = '#ddb892';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 8]);
      ctx.strokeRect(50, 50, 1948, 1948);
      ctx.setLineDash([]);
      break;
    }

    case 'ninja': {
      // Katana slash lines
      ctx.strokeStyle = 'rgba(230, 57, 70, 0.12)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(100, 1948); ctx.lineTo(1948, 100);
      ctx.moveTo(100, 100); ctx.lineTo(1948, 1948);
      ctx.stroke();
      break;
    }

    case 'hoodie': {
      // Glacier ice facets
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1.8;
      const step = 128;
      for (let x = 64; x < 2048; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x + 64, 2048);
        ctx.stroke();
      }
      break;
    }

    case 'gamer': {
      // RGB Bus Traces
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(6, 214, 160, 0.18)';
      ctx.strokeRect(100, 100, 1848, 1848);
      ctx.strokeStyle = 'rgba(247, 37, 133, 0.18)';
      ctx.strokeRect(140, 140, 1768, 1768);
      break;
    }

    case 'neon_glow': {
      // Synthwave perspective grid
      ctx.strokeStyle = 'rgba(247, 37, 133, 0.14)';
      ctx.lineWidth = 1.5;
      for (let x = 0; x <= 2048; x += 128) {
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x, 2048);
        ctx.stroke();
      }
      for (let y = 0; y <= 2048; y += 128) {
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(2048, y);
        ctx.stroke();
      }
      break;
    }

    case 'cool_boys': {
      // Lightning discharge fissures
      ctx.strokeStyle = 'rgba(255, 183, 3, 0.15)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(200, 200); ctx.lineTo(500, 600); ctx.lineTo(400, 650); ctx.lineTo(700, 1100);
      ctx.moveTo(1848, 200); ctx.lineTo(1548, 600); ctx.lineTo(1648, 650); ctx.lineTo(1348, 1100);
      ctx.stroke();
      break;
    }

    case 'paw': {
      // Playful paw print boundary trail
      const pawStep = 180;
      for (let x = 120; x < 1928; x += pawStep) {
        ctx.fillStyle = 'rgba(244, 114, 182, 0.12)';
        ctx.beginPath();
        ctx.arc(x, 70, 8, 0, Math.PI * 2);
        ctx.arc(x, 1978, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'minimal_crown': {
      // Ultra-fine minimalist grid
      ctx.strokeStyle = 'rgba(129, 140, 248, 0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 2048; i += 256) {
        ctx.beginPath();
        ctx.moveTo(i, 0); ctx.lineTo(i, 2048);
        ctx.moveTo(0, i); ctx.lineTo(2048, i);
        ctx.stroke();
      }
      break;
    }

    case 'royal_crown':
    case 'marble_royal':
    default: {
      // Organic marble veining ribbons
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 18;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(100, 200);
      ctx.bezierCurveTo(450, 600, 900, 300, 1400, 800);
      ctx.bezierCurveTo(1700, 1100, 1600, 1600, 1950, 1900);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(100, 120, 135, 0.08)';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(1900, 250);
      ctx.bezierCurveTo(1500, 650, 1200, 1200, 600, 1500);
      ctx.bezierCurveTo(350, 1650, 250, 1800, 150, 1950);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(200, 158, 58, 0.12)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(400, 1600);
      ctx.bezierCurveTo(700, 1400, 1300, 1500, 1650, 1100);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function drawThemeYardWatermark(ctx, theme) {
  ctx.save();
  switch (theme.yardWatermark) {
    case 'nanotech_hex': {
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.06)';
      ctx.lineWidth = 1.2;
      const gridW = 56;
      for (let x = 28; x < 1024; x += gridW) {
        for (let y = 28; y < 1024; y += gridW) {
          ctx.beginPath();
          for (let s = 0; s < 6; s++) {
            const a = (s * Math.PI) / 3;
            const hx = x + Math.cos(a) * 16;
            const hy = y + Math.sin(a) * 16;
            if (s === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
      break;
    }

    case 'soccer_pitch': {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(512, 512, 280, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case 'rope_braid': {
      ctx.strokeStyle = 'rgba(224, 169, 109, 0.12)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 8]);
      ctx.strokeRect(50, 50, 924, 924);
      ctx.setLineDash([]);
      break;
    }

    case 'ninja_star': {
      ctx.strokeStyle = 'rgba(230, 57, 70, 0.08)';
      ctx.lineWidth = 2;
      for (let a = 0; a < 4; a++) {
        const ang = (a * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(512, 512);
        ctx.lineTo(512 + Math.cos(ang) * 350, 512 + Math.sin(ang) * 350);
        ctx.stroke();
      }
      break;
    }

    case 'ice_fractal': {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(512, 512);
        ctx.lineTo(512 + Math.cos(a) * 360, 512 + Math.sin(a) * 360);
        ctx.stroke();
      }
      break;
    }

    case 'rgb_circuits': {
      ctx.strokeStyle = 'rgba(6, 214, 160, 0.10)';
      ctx.lineWidth = 2;
      ctx.strokeRect(120, 120, 784, 784);
      ctx.strokeStyle = 'rgba(247, 37, 133, 0.10)';
      ctx.strokeRect(150, 150, 724, 724);
      break;
    }

    case 'laser_grid': {
      ctx.strokeStyle = 'rgba(247, 37, 133, 0.08)';
      ctx.lineWidth = 1.5;
      for (let p = 64; p < 1024; p += 64) {
        ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 1024); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(1024, p); ctx.stroke();
      }
      break;
    }

    case 'damask':
    default: {
      // Modern Geometric Luxury Octagonal Weave (Replaces Victorian antique damask wallpaper)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1.0;
      const step = 80;
      for (let x = 40; x < 1024; x += step) {
        for (let y = 40; y < 1024; y += step) {
          ctx.beginPath();
          ctx.rect(x - 20, y - 20, 40, 40);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y, 12, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      break;
    }
  }
  ctx.restore();
}

function drawThemeYardCenterRosette(ctx, cx, cy, padHex, theme, socketCenters) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;

  // Modern Faceted Luxury Outer Bevel
  const rOuter = 104;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0e14';
  ctx.fill();
  ctx.strokeStyle = theme.borderRibbon1;
  ctx.lineWidth = 4.5;
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Inner Chamfered Ring
  ctx.beginPath();
  ctx.arc(cx, cy, 92, 0, Math.PI * 2);
  ctx.strokeStyle = theme.borderRibbon2;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Modern 8-Point Precision Geometric Starburst (Hyper-clean luxury facets)
  const rStar = 82;
  const rInner = 36;
  for (let i = 0; i < 8; i++) {
    const aTip = (i * 2 * Math.PI) / 8 - Math.PI / 2;
    const aL = aTip - Math.PI / 8;
    const aR = aTip + Math.PI / 8;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(aTip) * rStar, cy + Math.sin(aTip) * rStar);
    ctx.lineTo(cx + Math.cos(aL) * rInner, cy + Math.sin(aL) * rInner);
    ctx.closePath();
    ctx.fillStyle = (i % 2 === 0) ? theme.borderRibbon1 : theme.borderRibbon2;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(aTip) * rStar, cy + Math.sin(aTip) * rStar);
    ctx.lineTo(cx + Math.cos(aR) * rInner, cy + Math.sin(aR) * rInner);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fill();
  }

  // Radiant Central Gemstone Orb
  const rGem = 32;
  const gemGrad = ctx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, rGem);
  gemGrad.addColorStop(0.0, '#ffffff');
  gemGrad.addColorStop(0.35, padHex);
  gemGrad.addColorStop(1.0, '#06090e');
  ctx.beginPath();
  ctx.arc(cx, cy, rGem, 0, Math.PI * 2);
  ctx.fillStyle = gemGrad;
  ctx.fill();
  ctx.strokeStyle = theme.borderRibbon1;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.restore();
}


function generateBoardCanvasTexture() {
  // 2048x2048 Ultra-Resolution Board Floor Texture (16 Unique Set Themes)
  const cvs = document.createElement('canvas');
  cvs.width = 2048;
  cvs.height = 2048;
  const ctx = cvs.getContext('2d');
  const theme = getThemeProfile(currentTheme);

  // 1. Theme-Specific Floor Base Radial Gradient
  const baseGrad = ctx.createRadialGradient(1024, 1024, 120, 1024, 1024, 1380);
  baseGrad.addColorStop(0.0, theme.floorGrad[0]);
  baseGrad.addColorStop(0.60, theme.floorGrad[1]);
  baseGrad.addColorStop(1.0, theme.floorGrad[2]);
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, 2048, 2048);

  // 2. Theme Background Texture Motif
  drawThemeFloorMotif(ctx, theme);

  // 3. Dual Outer Frame Ribbons
  ctx.lineWidth = 10;
  ctx.strokeStyle = theme.outerBorder;
  ctx.strokeRect(5, 5, 2038, 2038);

  ctx.lineWidth = 4.5;
  ctx.strokeStyle = theme.borderRibbon1;
  ctx.strokeRect(22, 22, 2004, 2004);

  ctx.lineWidth = 2.0;
  ctx.strokeStyle = theme.borderRibbon2;
  ctx.strokeRect(32, 32, 1984, 1984);

  // 4 Corner Architectural Brackets
  drawThemeCornerBracket(ctx, 38, 38, 1, 1, theme);
  drawThemeCornerBracket(ctx, 2010, 38, -1, 1, theme);
  drawThemeCornerBracket(ctx, 38, 2010, 1, -1, theme);
  drawThemeCornerBracket(ctx, 2010, 2010, -1, -1, theme);

  // 4. Central Track Cross: Individually Inlaid Tile Slabs
  const step = 2048 / 15;

  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const isHorizontalArm = (r >= 6 && r <= 8);
      const isVerticalArm = (c >= 6 && c <= 8);
      if (!isHorizontalArm && !isVerticalArm) continue; // Skip quadrant yards

      const isCenterCore = (r >= 6 && r <= 8) && (c >= 6 && c <= 8);
      if (isCenterCore) continue; // Covered by center pyramid collar

      const tx = c * step + 2;
      const ty = r * step + 2;
      const tw = step - 4;
      const th = step - 4;

      // Inlaid Slab Gradient
      const tileGrad = ctx.createLinearGradient(tx, ty, tx + tw, ty + th);
      tileGrad.addColorStop(0.0, theme.tileGrad[0]);
      tileGrad.addColorStop(0.5, theme.tileGrad[1]);
      tileGrad.addColorStop(1.0, theme.tileGrad[2]);
      ctx.fillStyle = tileGrad;
      ctx.fillRect(tx, ty, tw, th);

      // 3D Inset Bevel Highlight
      ctx.strokeStyle = theme.tileHighlight;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(tx, ty + th);
      ctx.lineTo(tx, ty);
      ctx.lineTo(tx + tw, ty);
      ctx.stroke();

      // 3D Inset Bevel Shadow
      ctx.strokeStyle = theme.tileShadow;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(tx + tw, ty);
      ctx.lineTo(tx + tw, ty + th);
      ctx.lineTo(tx, ty + th);
      ctx.stroke();

      // Inlaid boundary line
      ctx.strokeStyle = theme.tileBorder;
      ctx.lineWidth = 1.0;
      ctx.strokeRect(tx, ty, tw, th);
    }
  }

  // Cross path boundary lines
  ctx.strokeStyle = theme.armBorder;
  ctx.lineWidth = 3.2;

  for (let r of [6, 9]) {
    ctx.beginPath();
    ctx.moveTo(0, r * step);
    ctx.lineTo(2048, r * step);
    ctx.stroke();
  }
  for (let c of [6, 9]) {
    ctx.beginPath();
    ctx.moveTo(c * step, 0);
    ctx.lineTo(c * step, 2048);
    ctx.stroke();
  }

  // Center 3x3 collar boundary ribbon
  ctx.save();
  ctx.strokeStyle = theme.collarBorder1;
  ctx.lineWidth = 4;
  ctx.strokeRect(6 * step, 6 * step, 3 * step, 3 * step);
  ctx.strokeStyle = theme.collarBorder2;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(6 * step + 4, 6 * step + 4, 3 * step - 8, 3 * step - 8);
  ctx.restore();

  // 8 Official Ludo Celestial Stars
  const stars = [
    [6, 13], [2, 8], [1, 6], [6, 2],
    [8, 1], [12, 6], [13, 8], [8, 12]
  ];

  const starColors = {
    '6,13': '#d9b300',
    '2,8':  '#d9b300',
    '1,6':  '#0c4bbd',
    '6,2':  '#0c4bbd',
    '8,1':  '#ba1d1d',
    '12,6': '#ba1d1d',
    '13,8': '#2b3238',
    '8,12': '#2b3238'
  };

  stars.forEach(([c, r]) => {
    const key = `${c},${r}`;
    const gem = starColors[key] || '#d9b300';
    drawThemeStar(ctx, (c + 0.5) * step, (r + 0.5) * step, step * 0.38, gem, theme);
  });

  // 5. Directional Arrows
  const cornerDirectionArrows = [
    { col: 6, row: 5, angle: -Math.PI / 2, color: theme.armBorder },
    { col: 9, row: 6, angle: 0,            color: theme.armBorder },
    { col: 8, row: 9, angle: Math.PI / 2,  color: theme.armBorder },
    { col: 5, row: 8, angle: Math.PI,      color: theme.armBorder }
  ];

  cornerDirectionArrows.forEach(({ col, row, angle, color }) => {
    drawThemeArrow(ctx, (col + 0.5) * step, (row + 0.5) * step, angle, color, theme);
  });

  const boardTex = new THREE.CanvasTexture(cvs);
  boardTex.encoding = THREE.sRGBEncoding;
  boardTex.anisotropy = 16;
  boardTex.generateMipmaps = true;
  boardTex.minFilter = THREE.LinearMipmapLinearFilter;
  boardTex.magFilter = THREE.LinearFilter;
  return boardTex;
}


function createBoardPlatform() {
  const size = 15.6;
  const height = 0.65;

  const baseColor = getThemeProfile(currentTheme).baseColor;
  const baseMat = getMatteMat(baseColor);
  boardBaseMesh = new THREE.Mesh(new THREE.BoxGeometry(size, height, size), baseMat);
  boardBaseMesh.position.y = height / 2;
  boardBaseMesh.matrixAutoUpdate = false;
  boardBaseMesh.updateMatrix();
  boardBaseMesh.castShadow = false;
  boardBaseMesh.receiveShadow = false;
  masterExportGroup.add(boardBaseMesh);

  const boardTex = generateBoardCanvasTexture();
  const topMat = getMatteMat(0xffffff, boardTex);
  topMat.userData.isBoardTexture = true;
  boardTopMesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), topMat);
  boardTopMesh.rotation.x = -Math.PI / 2;
  boardTopMesh.position.y = height + 0.005;
  boardTopMesh.matrixAutoUpdate = false;
  boardTopMesh.updateMatrix();
  boardTopMesh.receiveShadow = false;
  masterExportGroup.add(boardTopMesh);
}

// Caches for Yard and Track Procedural Textures
const yardFloorTexCache = new Map();
const padBoxTexCache = new Map();
const trackTileTexCache = new Map();

function getCachedYardFloorTexture(q) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const key = `${currentTheme}_${q.name}_${q.inner}_${q.pad}`;
  if (yardFloorTexCache.has(key)) return yardFloorTexCache.get(key);

  const cvs = document.createElement('canvas');
  cvs.width = 1024;
  cvs.height = 1024;
  const ctx = cvs.getContext('2d');

  const innerHex = colorToHexStr(q.inner);
  const padHex = colorToHexStr(q.pad);
  const theme = getThemeProfile(currentTheme);

  const socketCenters = [
    [512 - 300, 512 - 300],
    [512 + 300, 512 - 300],
    [512 - 300, 512 + 300],
    [512 + 300, 512 + 300]
  ];

  // 1. Ultra-Modern Radiant Gemstone Surface (High clarity, rich saturation, zero murky mud)
  const bedGrad = ctx.createRadialGradient(512, 512, 50, 512, 512, 700);
  bedGrad.addColorStop(0.0, padHex); // Luminous radiant gem bloom
  bedGrad.addColorStop(0.40, padHex); // Keep player goti color pure and vibrant
  bedGrad.addColorStop(0.80, innerHex); // Deep royal hue
  bedGrad.addColorStop(1.0, '#090d12'); // Sleek luxury obsidian boundary
  ctx.fillStyle = bedGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle modern 45-degree brushed satin sheen
  const sheen = ctx.createLinearGradient(0, 0, 1024, 1024);
  sheen.addColorStop(0.0, 'rgba(255, 255, 255, 0.12)');
  sheen.addColorStop(0.48, 'rgba(255, 255, 255, 0.02)');
  sheen.addColorStop(0.52, 'rgba(0, 0, 0, 0.05)');
  sheen.addColorStop(1.0, 'rgba(0, 0, 0, 0.28)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, 1024, 1024);

  // 2. Modern Precision Micro-Texture (Aerospace tactile micro-matrix)
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  const dotStep = 32;
  for (let x = 16; x < 1024; x += dotStep) {
    for (let y = 16; y < 1024; y += dotStep) {
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // 3. Theme-Specific Modern Watermark
  drawThemeYardWatermark(ctx, theme);

  // 4. Modern Chamfered Architectural Perimeter Frame (No vintage/antique double-frames)
  const frameMargin = 22;
  const frameCut = 44;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(frameMargin + frameCut, frameMargin);
  ctx.lineTo(1024 - frameMargin - frameCut, frameMargin);
  ctx.lineTo(1024 - frameMargin, frameMargin + frameCut);
  ctx.lineTo(1024 - frameMargin, 1024 - frameMargin - frameCut);
  ctx.lineTo(1024 - frameMargin - frameCut, 1024 - frameMargin);
  ctx.lineTo(frameMargin + frameCut, 1024 - frameMargin);
  ctx.lineTo(frameMargin, 1024 - frameMargin - frameCut);
  ctx.lineTo(frameMargin, frameMargin + frameCut);
  ctx.closePath();

  ctx.strokeStyle = theme.borderRibbon1;
  ctx.lineWidth = 5.5;
  ctx.stroke();

  // Inner precision hairline frame
  const innerMargin = 34;
  const innerCut = 36;
  ctx.beginPath();
  ctx.moveTo(innerMargin + innerCut, innerMargin);
  ctx.lineTo(1024 - innerMargin - innerCut, innerMargin);
  ctx.lineTo(1024 - innerMargin, innerMargin + innerCut);
  ctx.lineTo(1024 - innerMargin, 1024 - innerMargin - innerCut);
  ctx.lineTo(1024 - innerMargin - innerCut, 1024 - innerMargin);
  ctx.lineTo(innerMargin + innerCut, 1024 - innerMargin);
  ctx.lineTo(innerMargin, 1024 - innerMargin - innerCut);
  ctx.lineTo(innerMargin, innerMargin + innerCut);
  ctx.closePath();
  ctx.strokeStyle = theme.borderRibbon2;
  ctx.lineWidth = 2.0;
  ctx.stroke();

  // 4 Modern Corner Chamfer Accents
  [
    [frameMargin + frameCut / 2, frameMargin + frameCut / 2],
    [1024 - frameMargin - frameCut / 2, frameMargin + frameCut / 2],
    [frameMargin + frameCut / 2, 1024 - frameMargin - frameCut / 2],
    [1024 - frameMargin - frameCut / 2, 1024 - frameMargin - frameCut / 2]
  ].forEach(([cx, cy]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = theme.borderRibbon1;
    ctx.fill();
  });
  ctx.restore();

  // 5. Clean Architectural Docking Foundations Beneath the 4 3D Pedestals
  // (Replaces redundant giant overlapping clock circles with sleek modern mounting pads)
  socketCenters.forEach(([sx, sy]) => {
    ctx.save();
    // Soft Ambient Occlusion Drop Shadow for the 3D pad mesh
    const aoGrad = ctx.createRadialGradient(sx, sy, 70, sx, sy, 160);
    aoGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0.45)');
    aoGrad.addColorStop(0.70, 'rgba(0, 0, 0, 0.20)');
    aoGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.beginPath();
    ctx.arc(sx, sy, 160, 0, Math.PI * 2);
    ctx.fillStyle = aoGrad;
    ctx.fill();

    // Sleek modern 45-degree corner alignment ticks framing the 3D pad
    const tickDist = 120;
    const tickLen = 22;
    ctx.strokeStyle = theme.borderRibbon2;
    ctx.lineWidth = 2.5;

    [
      [-1, -1], [1, -1], [-1, 1], [1, 1]
    ].forEach(([dx, dy]) => {
      const tx = sx + dx * tickDist;
      const ty = sy + dy * tickDist;
      ctx.beginPath();
      ctx.moveTo(tx, ty - dy * tickLen);
      ctx.lineTo(tx, ty);
      ctx.lineTo(tx - dx * tickLen, ty);
      ctx.stroke();
    });

    // Sleek hairline alignment bus line to central house rosette
    ctx.strokeStyle = theme.borderRibbon1;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(512, 512);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  });

  // 6. Ultra-Modern Central House Crest Insignia
  drawThemeYardCenterRosette(ctx, 512, 512, padHex, theme, socketCenters);

  const tex = new THREE.CanvasTexture(cvs);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  yardFloorTexCache.set(key, tex);
  return tex;
}

function getCachedPadBoxTexture(padColor) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const key = `${currentTheme}_${padColor}`;
  if (padBoxTexCache.has(key)) return padBoxTexCache.get(key);

  const cvs = document.createElement('canvas');
  cvs.width = 256;
  cvs.height = 256;
  const ctx = cvs.getContext('2d');
  const padHex = colorToHexStr(padColor);
  const theme = getThemeProfile(currentTheme);

  // 1. Ultra-Modern Radiant Gemstone / Carbon Base Slab
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 150);
  grad.addColorStop(0.0, padHex);
  grad.addColorStop(0.70, padHex);
  grad.addColorStop(1.0, '#0a0d11');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle modern brushed satin sheen (45-degree light reflection)
  const sheen = ctx.createLinearGradient(0, 0, 256, 256);
  sheen.addColorStop(0.0, 'rgba(255, 255, 255, 0.18)');
  sheen.addColorStop(0.45, 'rgba(255, 255, 255, 0.02)');
  sheen.addColorStop(0.55, 'rgba(0, 0, 0, 0.08)');
  sheen.addColorStop(1.0, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, 256, 256);

  // 2. Modern 45-Degree Chamfered Outer Bezel
  const chamfer = 24;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(8 + chamfer, 8);
  ctx.lineTo(248 - chamfer, 8);
  ctx.lineTo(248, 8 + chamfer);
  ctx.lineTo(248, 248 - chamfer);
  ctx.lineTo(248 - chamfer, 248);
  ctx.lineTo(8 + chamfer, 248);
  ctx.lineTo(8, 248 - chamfer);
  ctx.lineTo(8, 8 + chamfer);
  ctx.closePath();

  // Outer Metallic Bevel Rim
  ctx.strokeStyle = theme.padRimColor;
  ctx.lineWidth = 4.5;
  ctx.stroke();

  // 3D Highlight on Top/Left, Shadow on Bottom/Right
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(8, 248 - chamfer);
  ctx.lineTo(8, 8 + chamfer);
  ctx.lineTo(8 + chamfer, 8);
  ctx.lineTo(248 - chamfer, 8);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(248 - chamfer, 8);
  ctx.lineTo(248, 8 + chamfer);
  ctx.lineTo(248, 248 - chamfer);
  ctx.lineTo(248 - chamfer, 248);
  ctx.lineTo(8 + chamfer, 248);
  ctx.stroke();

  // Inner hairline conduit
  ctx.beginPath();
  ctx.moveTo(18 + chamfer * 0.7, 18);
  ctx.lineTo(238 - chamfer * 0.7, 18);
  ctx.lineTo(238, 18 + chamfer * 0.7);
  ctx.lineTo(238, 238 - chamfer * 0.7);
  ctx.lineTo(238 - chamfer * 0.7, 238);
  ctx.lineTo(18 + chamfer * 0.7, 238);
  ctx.lineTo(18, 238 - chamfer * 0.7);
  ctx.lineTo(18, 18 + chamfer * 0.7);
  ctx.closePath();
  ctx.strokeStyle = theme.padRimInner;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();

  // 4 Corner Precision Fasteners / Studs
  [
    [26, 26], [230, 26], [26, 230], [230, 230]
  ].forEach(([fx, fy]) => {
    ctx.beginPath();
    ctx.arc(fx, fy, 4, 0, Math.PI * 2);
    ctx.fillStyle = theme.padRimColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  });

  // 3. Precision Recessed Circular Docking Plinth (Horology / Aerospace Well)
  const cx = 128, cy = 128;
  const rOuter = 82;

  // Outer recessed ring shadow
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fill();
  ctx.strokeStyle = theme.padRimColor;
  ctx.lineWidth = 3.0;
  ctx.stroke();

  // Subtle circular micro-tracks (Horology sunray/sub-dial finish)
  for (let rTrack of [72, 62, 52]) {
    ctx.beginPath();
    ctx.arc(cx, cy, rTrack, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.0;
    ctx.stroke();
  }

  // 4 Precision Index Tick Marks (North, South, East, West)
  [
    [cx, cy - rOuter - 2, cx, cy - rOuter + 8],
    [cx, cy + rOuter - 8, cx, cy + rOuter + 2],
    [cx - rOuter - 2, cy, cx - rOuter + 8, cy],
    [cx + rOuter - 8, cy, cx + rOuter + 2, cy]
  ].forEach(([x1, y1, x2, y2]) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = theme.padRimColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  });

  // 4. Center Polished Jewel Target (Where Goti Rests)
  const rTarget = 42;
  const targetGrad = ctx.createRadialGradient(cx - 6, cy - 6, 2, cx, cy, rTarget);
  targetGrad.addColorStop(0.0, '#ffffff');
  targetGrad.addColorStop(0.35, padHex);
  targetGrad.addColorStop(1.0, '#080c10');
  ctx.beginPath();
  ctx.arc(cx, cy, rTarget, 0, Math.PI * 2);
  ctx.fillStyle = targetGrad;
  ctx.fill();
  ctx.strokeStyle = theme.padRimInner;
  ctx.lineWidth = 2.0;
  ctx.stroke();

  // Precision Center Crosshair Pip
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  const tex = new THREE.CanvasTexture(cvs);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  padBoxTexCache.set(key, tex);
  return tex;
}


function drawModernTrackChevron(ctx, hex, rimColor, rimInner) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;

  const tipY = 64;
  const notchY = 118;
  const wingLeftX = 64;
  const wingRightX = 192;
  const wingBottomY = 172;

  // 1. Sleek Aerodynamic Primary Chevron
  // Left Wing (Luminous Highlight Facet)
  const leftGrad = ctx.createLinearGradient(wingLeftX, wingBottomY, 128, tipY);
  leftGrad.addColorStop(0.0, rimColor);
  leftGrad.addColorStop(0.6, rimInner);
  leftGrad.addColorStop(1.0, '#ffffff');

  ctx.beginPath();
  ctx.moveTo(128, tipY);
  ctx.lineTo(wingLeftX, wingBottomY);
  ctx.lineTo(wingLeftX + 22, wingBottomY + 18);
  ctx.lineTo(128, notchY);
  ctx.closePath();
  ctx.fillStyle = leftGrad;
  ctx.fill();

  // Right Wing (Rich Saturated Jewel Facet)
  const rightGrad = ctx.createLinearGradient(128, tipY, wingRightX, wingBottomY);
  rightGrad.addColorStop(0.0, rimInner);
  rightGrad.addColorStop(0.5, rimColor);
  rightGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.45)');

  ctx.beginPath();
  ctx.moveTo(128, tipY);
  ctx.lineTo(wingRightX, wingBottomY);
  ctx.lineTo(wingRightX - 22, wingBottomY + 18);
  ctx.lineTo(128, notchY);
  ctx.closePath();
  ctx.fillStyle = rightGrad;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Razor-sharp Outer Metallic Bevel Line
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(wingLeftX, wingBottomY);
  ctx.lineTo(128, tipY);
  ctx.lineTo(wingRightX, wingBottomY);
  ctx.stroke();

  // Dark Precision Shadow Spine
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(wingLeftX + 22, wingBottomY + 18);
  ctx.lineTo(128, notchY);
  ctx.lineTo(wingRightX - 22, wingBottomY + 18);
  ctx.stroke();

  // Central Vertical Ridge Line (Diamond Chisel Cut)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(128, tipY);
  ctx.lineTo(128, notchY);
  ctx.stroke();

  // 2. Secondary Velocity Micro-Chevron (Aerodynamic Telemetry Trail)
  const subTipY = notchY + 22;
  const subNotchY = subTipY + 26;
  const subSpan = 42;
  ctx.beginPath();
  ctx.moveTo(128, subTipY);
  ctx.lineTo(128 - subSpan, subTipY + 32);
  ctx.lineTo(128 - subSpan + 14, subTipY + 40);
  ctx.lineTo(128, subNotchY);
  ctx.lineTo(128 + subSpan - 14, subTipY + 40);
  ctx.lineTo(128 + subSpan, subTipY + 32);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fill();
  ctx.strokeStyle = rimInner;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Apex Photon Spark / Diamond Node
  ctx.beginPath();
  ctx.arc(128, tipY, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.restore();
}

function getCachedTrackTileTexture(tileColor) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const key = `${currentTheme}_${tileColor}`;
  if (trackTileTexCache.has(key)) return trackTileTexCache.get(key);

  const cvs = document.createElement('canvas');
  cvs.width = 256;
  cvs.height = 256;
  const ctx = cvs.getContext('2d');
  const hex = colorToHexStr(tileColor);

  // 1. Ultra-Modern Radiant Gemstone Slab
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 160);
  grad.addColorStop(0.0, hex);
  grad.addColorStop(0.65, hex);
  grad.addColorStop(1.0, '#0a0e14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Brushed Satin 45-degree Sheen
  const sheen = ctx.createLinearGradient(0, 0, 256, 256);
  sheen.addColorStop(0.0, 'rgba(255, 255, 255, 0.22)');
  sheen.addColorStop(0.48, 'rgba(255, 255, 255, 0.03)');
  sheen.addColorStop(0.52, 'rgba(0, 0, 0, 0.05)');
  sheen.addColorStop(1.0, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, 256, 256);

  // 2. 3D Precision Chamfered Bevel
  // Outer Highlight (Top & Left)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(4, 252);
  ctx.lineTo(4, 4);
  ctx.lineTo(252, 4);
  ctx.stroke();

  // Outer Shadow (Bottom & Right)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(252, 4);
  ctx.lineTo(252, 252);
  ctx.lineTo(4, 252);
  ctx.stroke();

  // Sleek Inlaid Metallic Hairline Bezel (harmonized with player gemstone & gold)
  const isYellow = (tileColor === PALETTE.YELLOW || hex.toLowerCase() === '#d9b300');
  const isRed = (tileColor === PALETTE.RED || hex.toLowerCase() === '#ba1d1d');
  const isBlue = (tileColor === PALETTE.BLUE || hex.toLowerCase() === '#0c4bbd');

  const rimColor = isYellow ? '#ffd700' : (isRed ? '#ff6b6b' : (isBlue ? '#38bdf8' : '#e2e8f0'));
  const rimInner = isYellow ? '#fff3b0' : (isRed ? '#ffd1d1' : (isBlue ? '#bae6fd' : '#ffffff'));

  ctx.strokeStyle = rimColor;
  ctx.lineWidth = 3.5;
  ctx.strokeRect(10, 10, 236, 236);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(16, 16, 224, 224);

  // 4 Micro Precision Corner Pins
  [
    [22, 22], [234, 22], [22, 234], [234, 234]
  ].forEach(([px, py]) => {
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fillStyle = rimInner;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // 3. Ultra-Sleek Modern Directional Chevron Arrow (Pointing to Home / Victory)
  drawModernTrackChevron(ctx, hex, rimColor, rimInner);

  const tex = new THREE.CanvasTexture(cvs);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  trackTileTexCache.set(key, tex);
  return tex;
}

function createQuadrants() {
  const quads = [
    { name: "Blue",     cx: -4.68, cz: -4.68, outer: PALETTE.BLUE,     inner: PALETTE.BLUE_INNER,     pad: PALETTE.PAD_BLUE },
    { name: "Red",      cx:  4.68, cz: -4.68, outer: PALETTE.RED,      inner: PALETTE.RED_INNER,      pad: PALETTE.PAD_RED },
    { name: "Yellow",   cx: -4.68, cz:  4.68, outer: PALETTE.YELLOW,   inner: PALETTE.YELLOW_INNER,   pad: PALETTE.PAD_YELLOW },
    { name: "Charcoal", cx:  4.68, cz:  4.68, outer: PALETTE.CHARCOAL, inner: PALETTE.CHARCOAL_INNER, pad: PALETTE.PAD_CHARCOAL }
  ];

  const outerSize = 5.4;
  const innerSize = 4.1;
  const w = (outerSize - innerSize) / 2; // 0.65 frame wall thickness
  const wallH = 0.44;
  const floorH = 0.24;
  const padSize = 1.18;
  const padH = 0.10;

  // Reusable Shared Geometries to eliminate VRAM and buffer churn
  const wallGeoN_S = new THREE.BoxGeometry(outerSize, wallH, w);
  const wallGeoE_W = new THREE.BoxGeometry(w, wallH, innerSize);
  const floorGeo = new THREE.BoxGeometry(innerSize, floorH, innerSize);
  const padGeo = new THREE.BoxGeometry(padSize, padH, padSize);

  quads.forEach((q) => {
    const group = new THREE.Group();
    group.position.set(q.cx, 0.655, q.cz);

    const wallMat = getMatteMat(q.outer);

    // 4 Raised Outer Colored Fortress Walls forming the perimeter frame
    const wallN = new THREE.Mesh(wallGeoN_S, wallMat);
    wallN.position.set(0, wallH / 2, innerSize / 2 + w / 2);
    wallN.matrixAutoUpdate = false;
    wallN.updateMatrix();
    wallN.castShadow = false;
    wallN.receiveShadow = false;
    group.add(wallN);

    const wallS = new THREE.Mesh(wallGeoN_S, wallMat);
    wallS.position.set(0, wallH / 2, -(innerSize / 2 + w / 2));
    wallS.matrixAutoUpdate = false;
    wallS.updateMatrix();
    wallS.castShadow = false;
    wallS.receiveShadow = false;
    group.add(wallS);

    const wallW = new THREE.Mesh(wallGeoE_W, wallMat);
    wallW.position.set(-(innerSize / 2 + w / 2), wallH / 2, 0);
    wallW.matrixAutoUpdate = false;
    wallW.updateMatrix();
    wallW.castShadow = false;
    wallW.receiveShadow = false;
    group.add(wallW);

    const wallE = new THREE.Mesh(wallGeoE_W, wallMat);
    wallE.position.set(innerSize / 2 + w / 2, wallH / 2, 0);
    wallE.matrixAutoUpdate = false;
    wallE.updateMatrix();
    wallE.castShadow = false;
    wallE.receiveShadow = false;
    group.add(wallE);

    // Smooth Recessed Inner Square Floor with Royal Satin Rosette Texture (matte: zero specular glare hotspot)
    const floorTex = getCachedYardFloorTexture(q);
    const floorMesh = new THREE.Mesh(floorGeo, getMatteMat(0xffffff, floorTex));
    floorMesh.position.y = floorH / 2;
    floorMesh.matrixAutoUpdate = false;
    floorMesh.updateMatrix();
    floorMesh.receiveShadow = false;
    group.add(floorMesh);
    yardFloorMeshes.push({ mesh: floorMesh, q: q });

    // 4 Raised Square Placeholder Blocks under the gotiyan (matching Image 2)
    const padOffsets = [
      [-1.20, -1.20], [1.20, -1.20],
      [-1.20,  1.20], [1.20,  1.20]
    ];
    // Pad material uses calibrated goti body color with turned brass chamfer so boxes exactly match gotiyan
    const padTex = getCachedPadBoxTexture(q.pad);
    const padMat = getMatteMat(0xffffff, padTex);

    padOffsets.forEach(([px, pz]) => {
      const padMesh = new THREE.Mesh(padGeo, padMat);
      padMesh.position.set(px, floorH + padH / 2, pz);
      padMesh.matrixAutoUpdate = false;
      padMesh.updateMatrix();
      padMesh.castShadow = false;
      padMesh.receiveShadow = false;
      group.add(padMesh);
      yardPadMeshes.push({ mesh: padMesh, padColor: q.pad });
    });

    group.matrixAutoUpdate = false;
    group.updateMatrix();
    masterExportGroup.add(group);
  });
}

function createSteppedTracks() {
  const step = BOARD_CONFIG.TILE_STEP; // 1.04 grid step
  const tileSize = step * 0.96; // 1.00 square tile
  const stepH = 0.14; // tactile inlaid slab height
  const trackTileGeo = new THREE.BoxGeometry(tileSize, stepH, tileSize);

  const pathways = [
    { color: PALETTE.RED,      axis: 'z', sign: -1, rotY: Math.PI },       // Top arm: pointing towards center pyramid
    { color: PALETTE.YELLOW,   axis: 'z', sign:  1, rotY: 0 },             // Bottom arm: pointing towards center pyramid
    { color: PALETTE.BLUE,     axis: 'x', sign: -1, rotY: -Math.PI / 2 },  // Left arm: pointing towards center pyramid
    { color: PALETTE.CHARCOAL, axis: 'x', sign:  1, rotY: Math.PI / 2 }    // Right arm: pointing towards center pyramid
  ];

  pathways.forEach((p) => {
    const tileTex = getCachedTrackTileTexture(p.color);
    const pMat = getMatteMat(0xffffff, tileTex);
    // 5 square blocks filling rows/cols 1 to 5 leading from outer track into center pyramid
    for (let i = 0; i < 5; i++) {
      // dist goes from 6 * step (outer square 1/13) down to 2 * step (inner square 5/9)
      const dist = (6 - i) * step;
      const px = (p.axis === 'x') ? p.sign * dist : 0;
      const pz = (p.axis === 'z') ? p.sign * dist : 0;

      const mesh = new THREE.Mesh(trackTileGeo, pMat);
      mesh.position.set(px, 0.655 + stepH / 2, pz);
      if (p.rotY) mesh.rotation.y = p.rotY;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      masterExportGroup.add(mesh);
      steppedTrackMeshes.push({ mesh: mesh, color: p.color });
    }
  });
}

function createCenterPyramid() {
  const centerGroup = new THREE.Group();
  centerGroup.position.set(0, 0.655, 0);

  // Dark square collar base perfectly framing the 3x3 central core
  const boxSize = 3.08;
  const boxH = 0.40;
  const collarColor = getThemeProfile(currentTheme).collarColor;
  const collar = new THREE.Mesh(
    new THREE.BoxGeometry(boxSize, boxH, boxSize),
    getMatteMat(collarColor)
  );
  collar.position.y = boxH / 2;
  collar.matrixAutoUpdate = false;
  collar.updateMatrix();
  collar.castShadow = false;
  collar.receiveShadow = false;
  centerCollarMesh = collar;
  centerGroup.add(collar);

  // 4-Facet Raised Apex Pyramid
  const apexY = boxH + 1.25;
  const baseY = boxH + 0.01;
  const half = boxSize * 0.44;

  const pApex  = new THREE.Vector3(0, apexY, 0);
  const pFront = new THREE.Vector3(0, baseY, half);
  const pBack  = new THREE.Vector3(0, baseY, -half);
  const pLeft  = new THREE.Vector3(-half, baseY, 0);
  const pRight = new THREE.Vector3(half, baseY, 0);

  const facets = [
    { v1: pLeft,  v2: pFront, color: PALETTE.YELLOW },
    { v1: pFront, v2: pRight, color: PALETTE.CHARCOAL },
    { v1: pRight, v2: pBack,  color: PALETTE.RED },
    { v1: pBack,  v2: pLeft,  color: PALETTE.BLUE }
  ];

  facets.forEach((f) => {
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      pApex.x, pApex.y, pApex.z,
      f.v1.x,  f.v1.y,  f.v1.z,
      f.v2.x,  f.v2.y,  f.v2.z
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.computeVertexNormals();

    const mat = getMatteMat(f.color);
    mat.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    centerGroup.add(mesh);
  });

  // Apex Gold Cap Sphere
  const capGeo = new THREE.SphereGeometry(0.18, 16, 16);
  const capMat = getPBRMat(0xe0b84c, 0.12, 1.0);
  const cap = new THREE.Mesh(capGeo, capMat);
  cap.position.set(0, apexY, 0);
  cap.matrixAutoUpdate = false;
  cap.updateMatrix();
  centerGroup.add(cap);

  centerGroup.matrixAutoUpdate = false;
  centerGroup.updateMatrix();

  masterExportGroup.add(centerGroup);
}

function reloadBoardForTheme() {
  yardFloorTexCache.clear();
  padBoxTexCache.clear();
  trackTileTexCache.clear();

  const theme = getThemeProfile(currentTheme);

  if (boardTopMesh) {
    boardTopMesh.material.map = generateBoardCanvasTexture();
    boardTopMesh.material.map.needsUpdate = true;
  }
  if (boardBaseMesh) {
    boardBaseMesh.material.color.setHex(theme.baseColor);
  }
  if (tableFloorMesh) {
    tableFloorMesh.material.color.setHex(theme.tableColor);
  }
  if (centerCollarMesh) {
    centerCollarMesh.material.color.setHex(theme.collarColor);
  }
  yardFloorMeshes.forEach(({ mesh, q }) => {
    mesh.material.map = getCachedYardFloorTexture(q);
    mesh.material.map.needsUpdate = true;
  });
  yardPadMeshes.forEach(({ mesh, padColor }) => {
    mesh.material.map = getCachedPadBoxTexture(padColor);
    mesh.material.map.needsUpdate = true;
  });
  steppedTrackMeshes.forEach(({ mesh, color }) => {
    mesh.material.map = getCachedTrackTileTexture(color);
    mesh.material.map.needsUpdate = true;
  });
}

function setGameTheme(newTheme) {
  currentTheme = newTheme;
  try {
    localStorage.setItem('ludo_theme', currentTheme);
  } catch (e) {}

  updateThemeUI();
  reloadBoardForTheme();

  // Also sync active state in Matching Sets modal
  const matchingCombo = THEME_COMBOS.find((c) => c.id === currentTheme);
  if (matchingCombo) {
    currentComboId = matchingCombo.id;
    try {
      localStorage.setItem('ludo_combo_set', currentComboId);
    } catch (e) {}
    document.querySelectorAll('.combo-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.comboId === currentComboId);
    });
    const comboLabel = document.getElementById('active-combo-label');
    if (comboLabel) comboLabel.textContent = `Equipped: ${matchingCombo.name}`;
  }
}

function toggleGameTheme() {
  const currentIdx = THEME_COMBOS.findIndex((c) => c.id === currentTheme);
  const nextCombo = THEME_COMBOS[(currentIdx + 1) % THEME_COMBOS.length] || THEME_COMBOS[0];
  applyComboSet(nextCombo.id);
}

function updateThemeUI() {
  const theme = getThemeProfile(currentTheme);
  if (document.body) {
    // Clean old theme-* classes
    Array.from(document.body.classList).forEach((cls) => {
      if (cls.startsWith('theme-')) document.body.classList.remove(cls);
    });
    document.body.classList.add(`theme-${theme.id}`);
    if (theme.id === 'space') document.body.classList.add('theme-scifi');
  }

  const themeBtnIcon = document.getElementById('theme-btn-icon');
  const themeBtnText = document.getElementById('theme-btn-text');
  if (themeBtnIcon && themeBtnText) {
    themeBtnIcon.className = theme.iconClass;
    themeBtnText.textContent = theme.shortName;
  }
}


function createPawnGeo() {
  const pts = [];
  pts.push(new THREE.Vector2(0, 0));
  pts.push(new THREE.Vector2(0.44, 0));
  pts.push(new THREE.Vector2(0.43, 0.12));
  pts.push(new THREE.Vector2(0.32, 0.25));
  pts.push(new THREE.Vector2(0.20, 0.65));
  pts.push(new THREE.Vector2(0.18, 0.95));
  pts.push(new THREE.Vector2(0.25, 1.05));
  pts.push(new THREE.Vector2(0.15, 1.15));

  const headCenterY = 1.45;
  const headR = 0.32;
  for (let i = -10; i <= 10; i++) {
    const phi = (i / 10) * (Math.PI / 2);
    const x = Math.cos(phi) * headR;
    const y = headCenterY + Math.sin(phi) * headR;
    if (x >= 0) pts.push(new THREE.Vector2(x, y));
  }
  pts.push(new THREE.Vector2(0, headCenterY + headR));

  const geo = new THREE.LatheGeometry(pts, 32);
  geo.computeVertexNormals();
  return geo;
}

const pawnMasterGeo = createPawnGeo();

function create3DPawns() {
  pawns = [];

  const PLAYER_COLORS = [
    PALETTE.PAWN_RED,
    PALETTE.PAWN_YELLOW,
    PALETTE.PAWN_BLUE,
    PALETTE.PAWN_CHARCOAL
  ];

  for (let pIdx = 0; pIdx < 4; pIdx++) {
    const color = PLAYER_COLORS[pIdx];
    const quad = BOARD_CONFIG.QUADS[pIdx];

    for (let pNum = 0; pNum < 4; pNum++) {
      const mat = getPBRMat(color, 0.20, 0.70);
      const mesh = new THREE.Mesh(pawnMasterGeo, mat);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.scale.set(0.72, 0.72, 0.72);

      // Yard pedestal offset (±1.20)
      const off = [
        [-1.20, -1.20], [1.20, -1.20],
        [-1.20,  1.20], [1.20,  1.20]
      ][pNum];

      const initialPos = {
        x: quad.cx + off[0],
        y: BOARD_CONFIG.SOCKET_Y,
        z: quad.cz + off[1]
      };
      mesh.position.set(initialPos.x, initialPos.y, initialPos.z);

      mesh.userData = {
        isPawn: true,
        playerId: pIdx,
        pawnId: pNum,
        label: `${quad.name} ${pNum + 1}`,
        currentPos: { ...initialPos },
        isSelectable: false,
        isHopping: false
      };

      const accessoryGroup = new THREE.Group();
      accessoryGroup.name = 'accessoryGroup';
      mesh.add(accessoryGroup);
      mesh.userData.accessoryGroup = accessoryGroup;

      masterExportGroup.add(mesh);
      pawns.push(mesh);
    }
  }

  applyGotiSkin(currentGotiSkinId);
}

// Global Physical Board Tile Key across ALL 4 Players
function getPawnTileKey(playerId, pawnId, stepOnTrack) {
  if (stepOnTrack === -1) {
    return `yard_${playerId}_${pawnId}`;
  }
  if (stepOnTrack <= 50) {
    const startTile = (typeof START_TILES !== 'undefined' && START_TILES[playerId] !== undefined)
      ? START_TILES[playerId]
      : [26, 0, 13, 39][playerId];
    const ringIdx = ((startTile + stepOnTrack) % 52 + 52) % 52;
    return `ring_${ringIdx}`;
  }
  if (stepOnTrack <= 55) {
    return `runway_${playerId}_${stepOnTrack - 51}`;
  }
  return `goal_${playerId}`;
}

// Anti-Overlap Spatial Coordinate Resolver (Agent 4: Spatial Anti-Overlap Guard)
function getPawnWorldPosition(playerId, pawnId, stepOnTrack) {
  if (stepOnTrack === -1) {
    const quad = BOARD_CONFIG.QUADS[playerId] || BOARD_CONFIG.QUADS[0];
    const off = [
      [-1.20, -1.20], [1.20, -1.20],
      [-1.20,  1.20], [1.20,  1.20]
    ][pawnId] || [0, 0];
    return {
      x: quad.cx + off[0],
      y: BOARD_CONFIG.SOCKET_Y,
      z: quad.cz + off[1]
    };
  }

  // Base tile coordinates
  let basePos = { x: 0, y: BOARD_CONFIG.BOARD_Y, z: 0 };
  if (stepOnTrack <= 50) {
    const startTile = (typeof START_TILES !== 'undefined' && START_TILES[playerId] !== undefined)
      ? START_TILES[playerId]
      : [26, 0, 13, 39][playerId];
    const ringIdx = ((startTile + stepOnTrack) % 52 + 52) % 52;
    if (PERIMETER_TRACK && PERIMETER_TRACK[ringIdx]) {
      basePos = { ...PERIMETER_TRACK[ringIdx] };
    }
  } else if (stepOnTrack <= 55) {
    const runwayStep = Math.max(0, Math.min(4, stepOnTrack - 51));
    if (HOME_RUNWAYS && HOME_RUNWAYS[playerId] && HOME_RUNWAYS[playerId][runwayStep]) {
      basePos = { ...HOME_RUNWAYS[playerId][runwayStep] };
    }
  } else {
    // Goal Sanctuary Apex with radial arrangement per player
    const angle = (playerId * Math.PI) / 2 + (pawnId * 0.28);
    const r = 0.55;
    return {
      x: Math.cos(angle) * r,
      y: 1.88,
      z: Math.sin(angle) * r
    };
  }

  // Multi-Pawn Shared Tile Anti-Overlap Clustering
  // Detect if ANY pawns across ALL 4 players share the exact same physical board tile
  const myKey = getPawnTileKey(playerId, pawnId, stepOnTrack);
  const sharingPawns = [];
  if (engine && engine.players && stepOnTrack !== -1 && stepOnTrack <= 55) {
    engine.players.forEach((p) => {
      p.pawns.forEach((pw) => {
        if (!pw.isFinished && pw.stepOnTrack !== -1) {
          const pwStep = (pw.playerId === playerId && pw.id === pawnId) ? stepOnTrack : pw.stepOnTrack;
          const pwKey = getPawnTileKey(pw.playerId, pw.id, pwStep);
          if (pwKey === myKey) {
            sharingPawns.push({ playerId: pw.playerId, pawnId: pw.id });
          }
        }
      });
    });
  }

  if (sharingPawns.length > 1) {
    sharingPawns.sort((a, b) => (a.playerId * 10 + a.pawnId) - (b.playerId * 10 + b.pawnId));
    const myOrder = sharingPawns.findIndex((p) => p.playerId === playerId && p.pawnId === pawnId);
    const count = sharingPawns.length;
    const angle = (myOrder * 2 * Math.PI) / count + Math.PI / 4;
    const clusterRadius = 0.32;
    return {
      x: basePos.x + Math.cos(angle) * clusterRadius,
      y: basePos.y,
      z: basePos.z + Math.sin(angle) * clusterRadius
    };
  }

  return basePos;
}

function reclusterAllRestingPawns() {
  if (!engine || !engine.players) return;
  engine.players.forEach((p) => {
    p.pawns.forEach((pw) => {
      if (!pw.isFinished && pw.stepOnTrack !== -1) {
        const mesh = pawns.find(
          (m) => m.userData.playerId === pw.playerId && m.userData.pawnId === pw.id
        );
        if (mesh && !mesh.userData.isHopping) {
          const target = getPawnWorldPosition(pw.playerId, pw.id, pw.stepOnTrack);
          mesh.position.x = target.x;
          mesh.position.z = target.z;
          mesh.userData.currentPos = { ...target };
        }
      }
    });
  });
}

function animatePawnHop(pawnMesh, targetPos, onComplete) {
  if (!pawnMesh) {
    if (onComplete) onComplete();
    return;
  }
  const target = targetPos || { x: pawnMesh.position.x, y: pawnMesh.position.y, z: pawnMesh.position.z };

  pawnMesh.userData.isHopping = true;
  if (typeof sounds !== 'undefined' && sounds.playPawnStep) {
    sounds.playPawnStep();
  }

  const startX = pawnMesh.position.x;
  const startY = pawnMesh.position.y;
  const startZ = pawnMesh.position.z;
  const startTime = performance.now();
  const duration = 280;

  function hop(now) {
    const p = Math.min((now - startTime) / duration, 1.0);
    const easeP = Math.sin((p * Math.PI) / 2);

    pawnMesh.position.x = startX + (target.x - startX) * easeP;
    pawnMesh.position.z = startZ + (target.z - startZ) * easeP;

    // Smooth parabolic jump arc
    const arc = Math.sin(p * Math.PI) * 1.25;
    pawnMesh.position.y = startY + (target.y - startY) * p + arc;

    if (p < 1.0) {
      requestAnimationFrame(hop);
    } else {
      pawnMesh.position.set(target.x, target.y, target.z);
      pawnMesh.userData.currentPos = { ...target };
      pawnMesh.userData.isHopping = false;
      if (onComplete) onComplete();
    }
  }

  requestAnimationFrame(hop);
}

// Step-by-Step Walking Animation for Gotiyan (Tile-by-Tile Consecutive Hops)
function animatePawnWalk(pawnMesh, playerId, pawnId, fromStep, toStep, onComplete) {
  if (!pawnMesh) {
    if (onComplete) onComplete();
    return;
  }

  // Construct sequential step list for walking
  const stepList = [];
  if (fromStep === -1) {
    // Release from yard: first step is 0 (start runway tile)
    stepList.push(0);
    // In 2-dice compound release, advance from 1 up to toStep
    for (let s = 1; s <= toStep; s++) {
      stepList.push(s);
    }
  } else if (fromStep < toStep) {
    // Forward track walking step by step
    for (let s = fromStep + 1; s <= toStep; s++) {
      stepList.push(s);
    }
  } else {
    stepList.push(toStep);
  }

  const waypoints = stepList.map((s) => getPawnWorldPosition(playerId, pawnId, s));
  pawnMesh.userData.isHopping = true;

  // Snappy rhythmic duration: 165ms per tile for normal moves, 135ms for long sprints (7-12 tiles)
  const stepDuration = waypoints.length > 6 ? 135 : 165;
  let currentIdx = 0;

  function runNextStep() {
    if (currentIdx >= waypoints.length) {
      pawnMesh.userData.isHopping = false;
      const finalPos = waypoints[waypoints.length - 1];
      pawnMesh.position.set(finalPos.x, finalPos.y, finalPos.z);
      pawnMesh.userData.currentPos = { ...finalPos };
      reclusterAllRestingPawns();
      if (onComplete) onComplete();
      return;
    }

    const startX = pawnMesh.position.x;
    const startY = pawnMesh.position.y;
    const startZ = pawnMesh.position.z;
    const target = waypoints[currentIdx];
    const startTime = performance.now();

    // Trigger tactile wooden step tap sound on each hop
    if (typeof sounds !== 'undefined' && sounds.playPawnStep) {
      sounds.playPawnStep();
    }

    function hopFrame(now) {
      const p = Math.min((now - startTime) / stepDuration, 1.0);
      const easeP = Math.sin((p * Math.PI) / 2);

      pawnMesh.position.x = startX + (target.x - startX) * easeP;
      pawnMesh.position.z = startZ + (target.z - startZ) * easeP;

      // Springy, energetic step arc (0.48 high)
      const arc = Math.sin(p * Math.PI) * 0.48;
      pawnMesh.position.y = startY + (target.y - startY) * p + arc;

      if (p < 1.0) {
        requestAnimationFrame(hopFrame);
      } else {
        pawnMesh.position.set(target.x, target.y, target.z);
        currentIdx++;
        runNextStep();
      }
    }

    requestAnimationFrame(hopFrame);
  }

  runNextStep();
}

// Procedural Soft Contact Shadow Texture for ultra-realistic contact penumbra
let softDiceShadowTex = null;
function getSoftDiceShadowTexture() {
  if (softDiceShadowTex) return softDiceShadowTex;
  const cvs = document.createElement('canvas');
  cvs.width = 128;
  cvs.height = 128;
  const ctx = cvs.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.35, 'rgba(0, 0, 0, 0.38)');
  grad.addColorStop(0.70, 'rgba(0, 0, 0, 0.10)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  softDiceShadowTex = new THREE.CanvasTexture(cvs);
  return softDiceShadowTex;
}

// Helper to generate perfectly rounded beveled heirloom cube geometry
function createRoundedDieGeometry(size, radius = 0.14, smoothness = 4) {
  const shape = new THREE.Shape();
  const eps = 0.0001;
  const r = radius - eps;
  const w = size - 2 * radius;
  const hw = w / 2;

  shape.moveTo(-hw, -hw + r);
  shape.lineTo(-hw, hw - r);
  shape.absarc(-hw + r, hw - r, r, Math.PI, Math.PI / 2, true);
  shape.lineTo(hw - r, hw);
  shape.absarc(hw - r, hw - r, r, Math.PI / 2, 0, true);
  shape.lineTo(hw, -hw + r);
  shape.absarc(hw - r, -hw + r, r, 0, -Math.PI / 2, true);
  shape.lineTo(-hw + r, -hw);
  shape.absarc(-hw + r, -hw + r, r, -Math.PI / 2, -Math.PI, true);

  const extrudeSettings = {
    depth: w,
    bevelEnabled: true,
    bevelSegments: smoothness,
    steps: 1,
    bevelSize: radius,
    bevelThickness: radius
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

// ============================================================================
// 12 EXCLUSIVE THEMED DICE SKINS + ROYAL CLASSIC SYSTEM
// ============================================================================

const PIP_POSITIONS = {
  1: [[256, 256]],
  2: [[138, 138], [374, 374]],
  3: [[134, 134], [256, 256], [378, 378]],
  4: [[138, 138], [374, 138], [138, 374], [374, 374]],
  5: [[138, 138], [374, 138], [256, 256], [138, 374], [374, 374]],
  6: [[138, 128], [138, 256], [138, 384], [374, 128], [374, 256], [374, 384]]
};

const DICE_SKINS = {
  classic: {
    id: 'classic',
    num: 0,
    name: 'Classic Porcelain',
    tag: 'Royal Heirloom',
    bodyColor: 0xfafcff,
    bodyRoughness: 0.16,
    bodyMetalness: 0.02,
    bodyClearcoat: 0.90,
    pipType: 'classic_number',
    hasAccessory: null,
    swatchColor: '#fafcff',
    swatchBorder: '#c89e3a',
    swatchIcon: '1'
  },
  pink_bow: {
    id: 'pink_bow',
    num: 1,
    name: 'Pink Bow Dice',
    tag: 'Cute & Girly',
    bodyColor: 0xffccd5,
    bodyRoughness: 0.22,
    bodyMetalness: 0.01,
    bodyClearcoat: 0.85,
    pipType: 'pink_bow',
    hasAccessory: 'bow',
    swatchColor: '#ffccd5',
    swatchBorder: '#ff4d6d',
    swatchIcon: '🎀'
  },
  flower: {
    id: 'flower',
    num: 2,
    name: 'Flower Dice',
    tag: 'Fresh & Pretty',
    bodyColor: 0x855ec9,
    bodyRoughness: 0.20,
    bodyMetalness: 0.02,
    bodyClearcoat: 0.88,
    pipType: 'daisy',
    hasAccessory: null,
    swatchColor: '#855ec9',
    swatchBorder: '#ffd166',
    swatchIcon: '🌼'
  },
  panda: {
    id: 'panda',
    num: 3,
    name: 'Panda Dice',
    tag: 'Adorable & Playful',
    bodyColor: 0xf8f9fa,
    bodyRoughness: 0.18,
    bodyMetalness: 0.01,
    bodyClearcoat: 0.90,
    pipType: 'panda',
    hasAccessory: 'panda_ears',
    swatchColor: '#f8f9fa',
    swatchBorder: '#111111',
    swatchIcon: '🐼'
  },
  crystal: {
    id: 'crystal',
    num: 4,
    name: 'Crystal Dice',
    tag: 'Elegant & Classy',
    bodyColor: 0xff758f,
    bodyRoughness: 0.08,
    bodyMetalness: 0.04,
    bodyClearcoat: 1.0,
    transmission: 0.65,
    ior: 1.52,
    pipType: 'sparkle_heart',
    hasAccessory: null,
    swatchColor: 'rgba(255, 117, 143, 0.75)',
    swatchBorder: '#ff4d6d',
    swatchIcon: '💎'
  },
  cat: {
    id: 'cat',
    num: 5,
    name: 'Cat Dice',
    tag: 'Sweet & Lovely',
    bodyColor: 0xfff5f5,
    bodyRoughness: 0.20,
    bodyMetalness: 0.01,
    bodyClearcoat: 0.88,
    pipType: 'cat',
    hasAccessory: 'cat_ears',
    swatchColor: '#fff5f5',
    swatchBorder: '#ff758f',
    swatchIcon: '🐱'
  },
  heart: {
    id: 'heart',
    num: 6,
    name: 'Heart Dice',
    tag: 'Simple & Charming',
    bodyColor: 0xd90429,
    bodyRoughness: 0.09,
    bodyMetalness: 0.03,
    bodyClearcoat: 1.0,
    transmission: 0.60,
    ior: 1.50,
    pipType: 'white_heart',
    hasAccessory: null,
    swatchColor: 'rgba(217, 4, 41, 0.85)',
    swatchBorder: '#ffffff',
    swatchIcon: '❤️'
  },
  rainbow: {
    id: 'rainbow',
    num: 7,
    name: 'Rainbow Dice',
    tag: 'Bright & Fun',
    bodyColor: 0xffffff,
    isRainbow: true,
    bodyRoughness: 0.15,
    bodyMetalness: 0.01,
    bodyClearcoat: 0.95,
    pipType: 'rainbow_pip',
    hasAccessory: null,
    swatchColor: 'linear-gradient(135deg, #ff9ebb, #ffd166, #06d6a0, #118ab2, #8338ec)',
    swatchBorder: '#ffffff',
    swatchIcon: '🌈'
  },
  bunny: {
    id: 'bunny',
    num: 8,
    name: 'Bunny Dice',
    tag: 'Cute & Innocent',
    bodyColor: 0xffffff,
    bodyRoughness: 0.20,
    bodyMetalness: 0.01,
    bodyClearcoat: 0.85,
    pipType: 'bunny',
    hasAccessory: 'bunny_ears',
    swatchColor: '#ffffff',
    swatchBorder: '#ff85a1',
    swatchIcon: '🐰'
  },
  starry: {
    id: 'starry',
    num: 9,
    name: 'Starry Dice',
    tag: 'Dreamy & Magical',
    bodyColor: 0x180b38,
    bodyRoughness: 0.14,
    bodyMetalness: 0.05,
    bodyClearcoat: 0.96,
    pipType: 'gold_star',
    hasAccessory: null,
    swatchColor: '#180b38',
    swatchBorder: '#ffdf00',
    swatchIcon: '⭐'
  },
  floral: {
    id: 'floral',
    num: 10,
    name: 'Floral Dice',
    tag: 'Nature Vibes',
    bodyColor: 0xfffcf2,
    bodyRoughness: 0.22,
    bodyMetalness: 0.01,
    bodyClearcoat: 0.82,
    pipType: 'tulip',
    hasAccessory: null,
    swatchColor: '#fffcf2',
    swatchBorder: '#e63946',
    swatchIcon: '🌷'
  },
  bow_heart: {
    id: 'bow_heart',
    num: 11,
    name: 'Bow & Heart Dice',
    tag: 'Trendy & Cute',
    bodyColor: 0xffa6b9,
    bodyRoughness: 0.20,
    bodyMetalness: 0.01,
    bodyClearcoat: 0.88,
    pipType: 'rose_heart',
    hasAccessory: 'bow',
    swatchColor: '#ffa6b9',
    swatchBorder: '#c9184a',
    swatchIcon: '💖'
  },
  queen: {
    id: 'queen',
    num: 12,
    name: 'Queen Dice',
    tag: 'Stylish & Bold',
    bodyColor: 0x121214,
    bodyRoughness: 0.10,
    bodyMetalness: 0.05,
    bodyClearcoat: 1.0,
    pipType: 'queen',
    hasAccessory: null,
    swatchColor: '#121214',
    swatchBorder: '#ff1493',
    swatchIcon: '👑'
  },
  royal_crown: {
    id: 'royal_crown',
    num: 13,
    name: 'Royal Crown Dice',
    tag: 'Stylish & Premium',
    bodyColor: 0x07152b,
    bodyRoughness: 0.12,
    bodyMetalness: 0.15,
    bodyClearcoat: 0.95,
    pipType: 'cyan_crown',
    hasAccessory: null,
    swatchColor: '#07152b',
    swatchBorder: '#00d4ff',
    swatchIcon: '👑'
  },
  football: {
    id: 'football',
    num: 14,
    name: 'Football Boys Dice',
    tag: 'Sporty & Fun',
    bodyColor: 0xf4f7fa,
    bodyRoughness: 0.18,
    bodyMetalness: 0.02,
    bodyClearcoat: 0.88,
    pipType: 'soccer_ball',
    hasAccessory: null,
    swatchColor: '#f4f7fa',
    swatchBorder: '#ba1d1d',
    swatchIcon: '⚽'
  },
  cowboy: {
    id: 'cowboy',
    num: 15,
    name: 'Cowboy Vibes Dice',
    tag: 'Trendy & Unique',
    bodyColor: 0xcd8c48,
    bodyRoughness: 0.35,
    bodyMetalness: 0.02,
    bodyClearcoat: 0.65,
    pipType: 'sheriff_star',
    hasAccessory: null,
    swatchColor: '#cd8c48',
    swatchBorder: '#5c3317',
    swatchIcon: '🤠'
  },
  ninja: {
    id: 'ninja',
    num: 16,
    name: 'Ninja Style Dice',
    tag: 'Cool & Action',
    bodyColor: 0x141619,
    bodyRoughness: 0.20,
    bodyMetalness: 0.08,
    bodyClearcoat: 0.90,
    pipType: 'flame',
    hasAccessory: null,
    swatchColor: '#141619',
    swatchBorder: '#e63946',
    swatchIcon: '🥷'
  },
  hoodie: {
    id: 'hoodie',
    num: 17,
    name: 'Hoodie Boys Dice',
    tag: 'Simple & Modern',
    bodyColor: 0x48cae4,
    bodyRoughness: 0.10,
    bodyMetalness: 0.05,
    bodyClearcoat: 1.0,
    transmission: 0.55,
    ior: 1.48,
    pipType: 'snowflake',
    hasAccessory: null,
    swatchColor: 'rgba(72, 202, 228, 0.85)',
    swatchBorder: '#ffffff',
    swatchIcon: '❄️'
  },
  king: {
    id: 'king',
    num: 18,
    name: 'King Theme Dice',
    tag: 'Elegant & Classy',
    bodyColor: 0x121316,
    bodyRoughness: 0.14,
    bodyMetalness: 0.25,
    bodyClearcoat: 0.95,
    pipType: 'king_crown',
    hasAccessory: null,
    swatchColor: '#121316',
    swatchBorder: '#ffd700',
    swatchIcon: '👑'
  },
  cap: {
    id: 'cap',
    num: 19,
    name: 'Cap Boys Dice',
    tag: 'Casual & Cool',
    bodyColor: 0xf8f9fa,
    bodyRoughness: 0.18,
    bodyMetalness: 0.02,
    bodyClearcoat: 0.88,
    pipType: 'blue_star',
    hasAccessory: null,
    swatchColor: '#f8f9fa',
    swatchBorder: '#0077b6',
    swatchIcon: '🧢'
  },
  space: {
    id: 'space',
    num: 20,
    name: 'Space Theme Dice',
    tag: 'Creative & Attractive',
    bodyColor: 0x1b0a3d,
    bodyRoughness: 0.12,
    bodyMetalness: 0.10,
    bodyClearcoat: 0.98,
    pipType: 'saturn',
    hasAccessory: null,
    swatchColor: '#1b0a3d',
    swatchBorder: '#a370f7',
    swatchIcon: '🪐'
  },
  soccer: {
    id: 'soccer',
    num: 21,
    name: 'Soccer Theme Dice',
    tag: 'Sporty & Energetic',
    bodyColor: 0xffffff,
    bodyRoughness: 0.18,
    bodyMetalness: 0.02,
    bodyClearcoat: 0.90,
    pipType: 'soccer_ball',
    hasAccessory: null,
    swatchColor: '#ffffff',
    swatchBorder: '#111111',
    swatchIcon: '⚽'
  },
  gamer: {
    id: 'gamer',
    num: 22,
    name: 'Gamer Boys Dice',
    tag: 'Modern & Stylish',
    bodyColor: 0x18181b,
    bodyRoughness: 0.16,
    bodyMetalness: 0.05,
    bodyClearcoat: 0.92,
    pipType: 'gamepad',
    hasAccessory: null,
    swatchColor: '#18181b',
    swatchBorder: '#06d6a0',
    swatchIcon: '🎮'
  },
  cute_boys: {
    id: 'cute_boys',
    num: 23,
    name: 'Cute Boys Dice',
    tag: 'Soft & Friendly',
    bodyColor: 0x80d8ff,
    bodyRoughness: 0.18,
    bodyMetalness: 0.02,
    bodyClearcoat: 0.90,
    pipType: 'cloud',
    hasAccessory: null,
    swatchColor: '#80d8ff',
    swatchBorder: '#ffffff',
    swatchIcon: '☁️'
  },
  marble_royal: {
    id: 'marble_royal',
    num: 24,
    name: 'Marble Royal Dice',
    tag: 'Premium & Classy',
    bodyColor: 0xf5f7fa,
    bodyRoughness: 0.12,
    bodyMetalness: 0.15,
    bodyClearcoat: 0.98,
    pipType: 'gold_crown',
    hasAccessory: null,
    swatchColor: '#f5f7fa',
    swatchBorder: '#d4af37',
    swatchIcon: '🏛️'
  },
  neon_glow: {
    id: 'neon_glow',
    num: 25,
    name: 'Neon Glow Dice',
    tag: 'Trendy & Eye-Catching',
    bodyColor: 0x0b0d14,
    bodyRoughness: 0.14,
    bodyMetalness: 0.08,
    bodyClearcoat: 0.96,
    pipType: 'neon_star',
    hasAccessory: null,
    swatchColor: '#0b0d14',
    swatchBorder: '#f72585',
    swatchIcon: '✨'
  },
  cool_boys: {
    id: 'cool_boys',
    num: 26,
    name: 'Cool Boys Dice',
    tag: 'Bold & Stylish',
    bodyColor: 0xd49b5c,
    bodyRoughness: 0.32,
    bodyMetalness: 0.02,
    bodyClearcoat: 0.70,
    pipType: 'lightning',
    hasAccessory: null,
    swatchColor: '#d49b5c',
    swatchBorder: '#3a0ca3',
    swatchIcon: '⚡'
  },
  minimal_crown: {
    id: 'minimal_crown',
    num: 27,
    name: 'Minimal Crown Dice',
    tag: 'Clean & Elegant',
    bodyColor: 0xc4b5fd,
    bodyRoughness: 0.16,
    bodyMetalness: 0.04,
    bodyClearcoat: 0.92,
    pipType: 'minimal_crown',
    hasAccessory: null,
    swatchColor: '#c4b5fd',
    swatchBorder: '#8ec5fc',
    swatchIcon: '👑'
  },
  paw: {
    id: 'paw',
    num: 28,
    name: 'Paw Theme Dice',
    tag: 'Cute & Unique',
    bodyColor: 0x18181b,
    bodyRoughness: 0.15,
    bodyMetalness: 0.03,
    bodyClearcoat: 0.92,
    pipType: 'paw_rainbow',
    hasAccessory: null,
    swatchColor: '#18181b',
    swatchBorder: '#ff70a6',
    swatchIcon: '🐾'
  }
};

let currentDiceSkinId = (typeof localStorage !== 'undefined' && localStorage.getItem('ludo_dice_skin')) || 'classic';

const GOTI_SKINS = {
  classic: {
    id: 'classic',
    name: 'Classic Gemstone',
    tag: 'Royal Heirloom',
    type: 'none',
    swatchColor: '#ba1d1d',
    swatchBorder: '#c89e3a',
    swatchIcon: '♟️'
  },
  royal_crown: {
    id: 'royal_crown',
    name: 'Royal Crown',
    tag: 'Stylish & Premium',
    type: 'crown',
    accessoryColor: 0xffd700,
    swatchColor: '#07152b',
    swatchBorder: '#00d4ff',
    swatchIcon: '👑'
  },
  football: {
    id: 'football',
    name: 'Football Boys',
    tag: 'Sporty & Fun',
    type: 'baseball_cap',
    swatchColor: '#ba1d1d',
    swatchBorder: '#ffffff',
    swatchIcon: '⚽'
  },
  cowboy: {
    id: 'cowboy',
    name: 'Cowboy Vibes',
    tag: 'Trendy & Unique',
    type: 'cowboy_hat',
    accessoryColor: 0x8b5a2b,
    swatchColor: '#cd8c48',
    swatchBorder: '#5c3317',
    swatchIcon: '🤠'
  },
  ninja: {
    id: 'ninja',
    name: 'Ninja Style',
    tag: 'Cool & Action',
    type: 'ninja_mask',
    swatchColor: '#141619',
    swatchBorder: '#e63946',
    swatchIcon: '🥷'
  },
  hoodie: {
    id: 'hoodie',
    name: 'Hoodie Boys',
    tag: 'Simple & Modern',
    type: 'hoodie',
    swatchColor: '#48cae4',
    swatchBorder: '#ffffff',
    swatchIcon: '🧥'
  },
  king: {
    id: 'king',
    name: 'King Theme',
    tag: 'Elegant & Classy',
    type: 'crown',
    accessoryColor: 0xffd700,
    swatchColor: '#121316',
    swatchBorder: '#ffd700',
    swatchIcon: '👑'
  },
  cap: {
    id: 'cap',
    name: 'Cap Boys',
    tag: 'Casual & Cool',
    type: 'baseball_cap',
    swatchColor: '#f8f9fa',
    swatchBorder: '#0077b6',
    swatchIcon: '🧢'
  },
  space: {
    id: 'space',
    name: 'Space Theme',
    tag: 'Creative & Attractive',
    type: 'space_helmet',
    swatchColor: '#1b0a3d',
    swatchBorder: '#a370f7',
    swatchIcon: '👨‍🚀'
  },
  soccer: {
    id: 'soccer',
    name: 'Soccer Theme',
    tag: 'Sporty & Energetic',
    type: 'soccer_cap',
    swatchColor: '#ffffff',
    swatchBorder: '#111111',
    swatchIcon: '⚽'
  },
  gamer: {
    id: 'gamer',
    name: 'Gamer Boys',
    tag: 'Modern & Stylish',
    type: 'headphones',
    swatchColor: '#18181b',
    swatchBorder: '#06d6a0',
    swatchIcon: '🎧'
  },
  cute_boys: {
    id: 'cute_boys',
    name: 'Cute Boys',
    tag: 'Soft & Friendly',
    type: 'cute_hair',
    swatchColor: '#80d8ff',
    swatchBorder: '#ffffff',
    swatchIcon: '👦'
  },
  marble_royal: {
    id: 'marble_royal',
    name: 'Marble Royal',
    tag: 'Premium & Classy',
    type: 'crown',
    accessoryColor: 0xe0b84c,
    swatchColor: '#f5f7fa',
    swatchBorder: '#d4af37',
    swatchIcon: '👑'
  },
  neon_glow: {
    id: 'neon_glow',
    name: 'Neon Glow',
    tag: 'Trendy & Eye-Catching',
    type: 'neon_halo',
    swatchColor: '#0b0d14',
    swatchBorder: '#f72585',
    swatchIcon: '✨'
  },
  cool_boys: {
    id: 'cool_boys',
    name: 'Cool Boys',
    tag: 'Bold & Stylish',
    type: 'sunglasses',
    swatchColor: '#d49b5c',
    swatchBorder: '#3a0ca3',
    swatchIcon: '😎'
  },
  minimal_crown: {
    id: 'minimal_crown',
    name: 'Minimal Crown',
    tag: 'Clean & Elegant',
    type: 'minimal_crown',
    accessoryColor: 0xe0b84c,
    swatchColor: '#c4b5fd',
    swatchBorder: '#8ec5fc',
    swatchIcon: '👑'
  },
  paw: {
    id: 'paw',
    name: 'Paw Theme',
    tag: 'Cute & Unique',
    type: 'paw_ears',
    swatchColor: '#18181b',
    swatchBorder: '#ff70a6',
    swatchIcon: '🐾'
  }
};

const THEME_COMBOS = [
  { id: 'royal_crown', name: '1. Royal Crown', tag: 'Stylish & Premium', diceSkin: 'royal_crown', gotiSkin: 'royal_crown', swatchColor: '#07152b', swatchBorder: '#00d4ff', swatchIcon: '👑' },
  { id: 'football', name: '2. Football Boys', tag: 'Sporty & Fun', diceSkin: 'football', gotiSkin: 'football', swatchColor: '#ffffff', swatchBorder: '#ba1d1d', swatchIcon: '⚽' },
  { id: 'cowboy', name: '3. Cowboy Vibes', tag: 'Trendy & Unique', diceSkin: 'cowboy', gotiSkin: 'cowboy', swatchColor: '#cd8c48', swatchBorder: '#5c3317', swatchIcon: '🤠' },
  { id: 'ninja', name: '4. Ninja Style', tag: 'Cool & Action', diceSkin: 'ninja', gotiSkin: 'ninja', swatchColor: '#141619', swatchBorder: '#e63946', swatchIcon: '🥷' },
  { id: 'hoodie', name: '5. Hoodie Boys', tag: 'Simple & Modern', diceSkin: 'hoodie', gotiSkin: 'hoodie', swatchColor: '#48cae4', swatchBorder: '#ffffff', swatchIcon: '❄️' },
  { id: 'king', name: '6. King Theme', tag: 'Elegant & Classy', diceSkin: 'king', gotiSkin: 'king', swatchColor: '#121316', swatchBorder: '#ffd700', swatchIcon: '👑' },
  { id: 'cap', name: '7. Cap Boys', tag: 'Casual & Cool', diceSkin: 'cap', gotiSkin: 'cap', swatchColor: '#f8f9fa', swatchBorder: '#0077b6', swatchIcon: '🧢' },
  { id: 'space', name: '8. Space Theme', tag: 'Creative & Attractive', diceSkin: 'space', gotiSkin: 'space', swatchColor: '#1b0a3d', swatchBorder: '#a370f7', swatchIcon: '🪐' },
  { id: 'soccer', name: '9. Soccer Theme', tag: 'Sporty & Energetic', diceSkin: 'soccer', gotiSkin: 'soccer', swatchColor: '#ffffff', swatchBorder: '#111111', swatchIcon: '⚽' },
  { id: 'gamer', name: '10. Gamer Boys', tag: 'Modern & Stylish', diceSkin: 'gamer', gotiSkin: 'gamer', swatchColor: '#18181b', swatchBorder: '#06d6a0', swatchIcon: '🎮' },
  { id: 'cute_boys', name: '11. Cute Boys', tag: 'Soft & Friendly', diceSkin: 'cute_boys', gotiSkin: 'cute_boys', swatchColor: '#80d8ff', swatchBorder: '#ffffff', swatchIcon: '☁️' },
  { id: 'marble_royal', name: '12. Marble Royal', tag: 'Premium & Classy', diceSkin: 'marble_royal', gotiSkin: 'marble_royal', swatchColor: '#f5f7fa', swatchBorder: '#d4af37', swatchIcon: '🏛️' },
  { id: 'neon_glow', name: '13. Neon Glow', tag: 'Trendy & Eye-Catching', diceSkin: 'neon_glow', gotiSkin: 'neon_glow', swatchColor: '#0b0d14', swatchBorder: '#f72585', swatchIcon: '✨' },
  { id: 'cool_boys', name: '14. Cool Boys', tag: 'Bold & Stylish', diceSkin: 'cool_boys', gotiSkin: 'cool_boys', swatchColor: '#d49b5c', swatchBorder: '#3a0ca3', swatchIcon: '⚡' },
  { id: 'minimal_crown', name: '15. Minimal Crown', tag: 'Clean & Elegant', diceSkin: 'minimal_crown', gotiSkin: 'minimal_crown', swatchColor: '#c4b5fd', swatchBorder: '#8ec5fc', swatchIcon: '👑' },
  { id: 'paw', name: '16. Paw Theme', tag: 'Cute & Unique', diceSkin: 'paw', gotiSkin: 'paw', swatchColor: '#18181b', swatchBorder: '#ff70a6', swatchIcon: '🐾' }
];

let currentGotiSkinId = (typeof localStorage !== 'undefined' && localStorage.getItem('ludo_goti_skin')) || 'classic';
let currentComboId = (typeof localStorage !== 'undefined' && localStorage.getItem('ludo_combo_set')) || 'royal_crown';

const diceSkinTextureCache = {};

let rainbowBodyTex = null;
function getRainbowTexture() {
  if (rainbowBodyTex) return rainbowBodyTex;
  const cvs = document.createElement('canvas');
  cvs.width = 256;
  cvs.height = 256;
  const ctx = cvs.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0.0, '#ff9ebb');
  grad.addColorStop(0.25, '#ffd166');
  grad.addColorStop(0.50, '#06d6a0');
  grad.addColorStop(0.75, '#4cc9f0');
  grad.addColorStop(1.0, '#b5179e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  rainbowBodyTex = new THREE.CanvasTexture(cvs);
  rainbowBodyTex.encoding = THREE.sRGBEncoding;
  return rainbowBodyTex;
}

// Procedural Canvas Pip Artists
function drawHeart(ctx, x, y, size, fill = '#ff4d6d', stroke = null) {
  ctx.save();
  ctx.beginPath();
  const topCurve = size * 0.3;
  ctx.moveTo(x, y + topCurve);
  ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + topCurve);
  ctx.bezierCurveTo(x - size / 2, y + (size + topCurve) / 2, x, y + size, x, y + size);
  ctx.bezierCurveTo(x, y + size, x + size / 2, y + (size + topCurve) / 2, x + size / 2, y + topCurve);
  ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + topCurve);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(2.5, size * 0.08);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDaisy(ctx, x, y, size) {
  ctx.save();
  const petalR = size * 0.34;
  const centerR = size * 0.22;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const px = x + Math.cos(angle) * (petalR * 0.88);
    const py = y + Math.sin(angle) * (petalR * 0.88);
    ctx.beginPath();
    ctx.arc(px, py, petalR * 0.65, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, centerR, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd166';
  ctx.fill();
  ctx.restore();
}

function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius, color = '#ffdf00') {
  ctx.save();
  let rot = (Math.PI / 2) * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(255, 223, 0, 0.6)';
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.restore();
}

function drawTulip(ctx, x, y, size) {
  ctx.save();
  ctx.strokeStyle = '#2a9d8f';
  ctx.lineWidth = Math.max(3, size * 0.1);
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.2);
  ctx.lineTo(x, y + size * 0.6);
  ctx.stroke();

  ctx.fillStyle = '#e63946';
  ctx.beginPath();
  ctx.arc(x, y, size * 0.35, 0, Math.PI);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x - size * 0.35, y);
  ctx.lineTo(x - size * 0.25, y - size * 0.4);
  ctx.lineTo(x - size * 0.1, y);
  ctx.lineTo(x, y - size * 0.45);
  ctx.lineTo(x + size * 0.1, y);
  ctx.lineTo(x + size * 0.25, y - size * 0.4);
  ctx.lineTo(x + size * 0.35, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPaw(ctx, x, y, size, color = '#ff758f') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.15, size * 0.38, size * 0.30, 0, 0, Math.PI * 2);
  ctx.fill();
  [-0.30, 0, 0.30].forEach((offX, idx) => {
    const offY = idx === 1 ? -0.32 : -0.22;
    ctx.beginPath();
    ctx.arc(x + offX * size, y + offY * size, size * 0.14, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawCirclePip(ctx, x, y, radius, color = '#ffffff') {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fill();
  ctx.restore();
}

function drawPandaFace(ctx, x, y, size) {
  ctx.save();
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(x - size * 0.36, y - size * 0.34, size * 0.20, 0, Math.PI * 2);
  ctx.arc(x + size * 0.36, y - size * 0.34, size * 0.20, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, size * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#e5e7eb';
  ctx.stroke();

  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.ellipse(x - size * 0.18, y - size * 0.05, size * 0.13, size * 0.16, -0.2, 0, Math.PI * 2);
  ctx.ellipse(x + size * 0.18, y - size * 0.05, size * 0.13, size * 0.16, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x - size * 0.16, y - size * 0.09, size * 0.05, 0, Math.PI * 2);
  ctx.arc(x + size * 0.16, y - size * 0.09, size * 0.05, 0, Math.PI * 2);
  ctx.fill();

  drawHeart(ctx, x, y + size * 0.06, size * 0.16, '#ff758f');
  ctx.restore();
}

function drawCatFace(ctx, x, y, size) {
  ctx.save();
  ctx.fillStyle = '#fff0f3';
  ctx.beginPath();
  ctx.moveTo(x - size * 0.4, y - size * 0.1);
  ctx.lineTo(x - size * 0.3, y - size * 0.46);
  ctx.lineTo(x - size * 0.1, y - size * 0.3);
  ctx.closePath();
  ctx.moveTo(x + size * 0.4, y - size * 0.1);
  ctx.lineTo(x + size * 0.3, y - size * 0.46);
  ctx.lineTo(x + size * 0.1, y - size * 0.3);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, size * 0.42, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x - size * 0.16, y - size * 0.04, size * 0.10, Math.PI * 0.1, Math.PI * 0.9);
  ctx.stroke();

  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(x + size * 0.16, y - size * 0.04, size * 0.08, 0, Math.PI * 2);
  ctx.fill();

  drawHeart(ctx, x, y + size * 0.08, size * 0.12, '#ff4d6d');
  ctx.restore();
}

function drawBunnyFace(ctx, x, y, size) {
  ctx.save();
  [-0.18, 0.18].forEach((offX) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x + offX * size, y - size * 0.40, size * 0.12, size * 0.30, offX < 0 ? -0.1 : 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffccd5';
    ctx.beginPath();
    ctx.ellipse(x + offX * size, y - size * 0.40, size * 0.06, size * 0.20, offX < 0 ? -0.1 : 0.1, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y + size * 0.05, size * 0.40, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(x - size * 0.16, y, size * 0.07, 0, Math.PI * 2);
  ctx.arc(x + size * 0.16, y, size * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x - size * 0.14, y - size * 0.02, size * 0.025, 0, Math.PI * 2);
  ctx.arc(x + size * 0.18, y - size * 0.02, size * 0.025, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 133, 161, 0.45)';
  ctx.beginPath();
  ctx.arc(x - size * 0.22, y + size * 0.10, size * 0.08, 0, Math.PI * 2);
  ctx.arc(x + size * 0.22, y + size * 0.10, size * 0.08, 0, Math.PI * 2);
  ctx.fill();

  drawHeart(ctx, x, y + size * 0.08, size * 0.10, '#ff4d6d');
  ctx.restore();
}

function drawQueenCrown(ctx, x, y, size) {
  ctx.save();
  ctx.fillStyle = '#ffd700';
  ctx.shadowColor = 'rgba(255, 215, 0, 0.6)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.38, y - size * 0.05);
  ctx.lineTo(x - size * 0.42, y - size * 0.42);
  ctx.lineTo(x - size * 0.18, y - size * 0.22);
  ctx.lineTo(x, y - size * 0.50);
  ctx.lineTo(x + size * 0.18, y - size * 0.22);
  ctx.lineTo(x + size * 0.42, y - size * 0.42);
  ctx.lineTo(x + size * 0.38, y - size * 0.05);
  ctx.closePath();
  ctx.fill();

  drawHeart(ctx, x, y + size * 0.10, size * 0.42, '#ff1493', '#ff69b4');
  ctx.restore();
}

function drawBowIcon(ctx, x, y, size, color = '#ff4d6d') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, size * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - size * 0.45, y - size * 0.35, x - size * 0.45, y + size * 0.35, x, y);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x + size * 0.45, y - size * 0.35, x + size * 0.45, y + size * 0.35, x, y);
  ctx.fill();
  ctx.restore();
}


function drawCrownIcon(ctx, x, y, size, color = '#00f0ff', glowColor = 'rgba(0, 240, 255, 0.8)') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.40, y + size * 0.25);
  ctx.lineTo(x - size * 0.45, y - size * 0.20);
  ctx.lineTo(x - size * 0.20, y);
  ctx.lineTo(x, y - size * 0.35);
  ctx.lineTo(x + size * 0.20, y);
  ctx.lineTo(x + size * 0.45, y - size * 0.20);
  ctx.lineTo(x + size * 0.40, y + size * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  [-0.45, 0, 0.45].forEach((tipX, idx) => {
    ctx.beginPath();
    ctx.arc(x + size * tipX, y - size * (idx === 1 ? 0.38 : 0.22), size * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  });
  ctx.restore();
}

function drawSoccerBall(ctx, x, y, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    const px = x + Math.cos(angle) * (r * 0.45);
    const py = y + Math.sin(angle) * (r * 0.45);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#111111';
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    const px1 = x + Math.cos(angle) * (r * 0.45);
    const py1 = y + Math.sin(angle) * (r * 0.45);
    const px2 = x + Math.cos(angle) * r;
    const py2 = y + Math.sin(angle) * r;
    ctx.beginPath();
    ctx.moveTo(px1, py1);
    ctx.lineTo(px2, py2);
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  ctx.restore();
}

function drawFlame(ctx, x, y, size, color = '#e63946') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(230, 57, 70, 0.8)';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(x, y - size * 0.50);
  ctx.bezierCurveTo(x + size * 0.35, y - size * 0.20, x + size * 0.45, y + size * 0.25, x, y + size * 0.50);
  ctx.bezierCurveTo(x - size * 0.45, y + size * 0.25, x - size * 0.35, y - size * 0.20, x, y - size * 0.50);
  ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(x, y - size * 0.20);
  ctx.bezierCurveTo(x + size * 0.18, y, x + size * 0.22, y + size * 0.25, x, y + size * 0.42);
  ctx.bezierCurveTo(x - size * 0.22, y + size * 0.25, x - size * 0.18, y, x, y - size * 0.20);
  ctx.fill();
  ctx.restore();
}

function drawSnowflake(ctx, x, y, r, color = '#ffffff') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(160, 230, 255, 0.8)';
  ctx.shadowBlur = 10;
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const x2 = x + Math.cos(angle) * r;
    const y2 = y + Math.sin(angle) * r;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const bx = x + Math.cos(angle) * (r * 0.65);
    const by = y + Math.sin(angle) * (r * 0.65);
    [-0.4, 0.4].forEach(offset => {
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(angle + offset) * (r * 0.35), by + Math.sin(angle + offset) * (r * 0.35));
      ctx.stroke();
    });
  }
  ctx.restore();
}

function drawSaturn(ctx, x, y, r, color = '#ffd166') {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(163, 112, 247, 0.8)';
  ctx.shadowBlur = 14;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.95, r * 0.28, -Math.PI / 6, 0, Math.PI * 2);
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#a370f7';
  ctx.stroke();
  ctx.restore();
}

function drawGamepad(ctx, x, y, size, color = '#ffffff') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x - size * 0.45, y - size * 0.28, size * 0.9, size * 0.56, 16);
  } else {
    ctx.rect(x - size * 0.45, y - size * 0.28, size * 0.9, size * 0.56);
  }
  ctx.fill();
  ctx.fillStyle = '#18181b';
  const cs = size * 0.08;
  ctx.fillRect(x - size * 0.25 - cs / 2, y - cs * 1.5, cs, cs * 3);
  ctx.fillRect(x - size * 0.25 - cs * 1.5, y - cs / 2, cs * 3, cs);
  const btnR = size * 0.045;
  [-cs, cs].forEach(bx => {
    [-cs, cs].forEach(by => {
      ctx.beginPath();
      ctx.arc(x + size * 0.25 + bx, y + by, btnR, 0, Math.PI * 2);
      ctx.fillStyle = '#ff0055';
      ctx.fill();
    });
  });
  ctx.restore();
}

function drawCloud(ctx, x, y, size, color = '#ffffff') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(x, y, size * 0.28, 0, Math.PI * 2);
  ctx.arc(x - size * 0.25, y + size * 0.08, size * 0.22, 0, Math.PI * 2);
  ctx.arc(x + size * 0.25, y + size * 0.08, size * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLightning(ctx, x, y, size, color = '#ffb703') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(255, 183, 3, 0.9)';
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.moveTo(x + size * 0.08, y - size * 0.45);
  ctx.lineTo(x - size * 0.32, y + size * 0.02);
  ctx.lineTo(x - size * 0.05, y + size * 0.02);
  ctx.lineTo(x - size * 0.15, y + size * 0.45);
  ctx.lineTo(x + size * 0.32, y - size * 0.02);
  ctx.lineTo(x + size * 0.05, y - size * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Master Dice Face Texture Generator Supporting All 29 Skins
function getDiceNumberTexture(num, skinId = currentDiceSkinId) {
  const cacheKey = `${skinId}_${num}`;
  if (diceSkinTextureCache[cacheKey]) return diceSkinTextureCache[cacheKey];

  const cvs = document.createElement('canvas');
  cvs.width = 512;
  cvs.height = 512;
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);

  const skin = DICE_SKINS[skinId] || DICE_SKINS.classic;

  if (skinId === 'classic') {
    const isAce = (num === 1);
    ctx.save();
    ctx.beginPath();
    ctx.arc(256, 256, 235, 0, Math.PI * 2);
    ctx.lineWidth = 12;
    ctx.strokeStyle = isAce ? '#c89e3a' : '#252e35';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(256, 256, 210, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = isAce ? 'rgba(200, 158, 58, 0.55)' : 'rgba(37, 46, 53, 0.35)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 340px "Plus Jakarta Sans", "Cinzel", "Arial", sans-serif';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = isAce ? '#ba1d1d' : '#182026';
    ctx.fillText(num.toString(), 256, 272);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = isAce ? '#e0b84c' : '#45535e';
    ctx.strokeText(num.toString(), 256, 272);
    ctx.restore();
  } else {
    // Themed Skins Face Rendering - Significantly Enlarged For High Legibility
    const pips = PIP_POSITIONS[num] || [[256, 256]];

    if (skinId === 'pink_bow') {
      if (num === 1) {
        drawHeart(ctx, 256, 175, 260, '#ff4d6d');
        drawBowIcon(ctx, 256, 215, 160, '#ff758f');
      } else {
        pips.forEach(([px, py]) => drawHeart(ctx, px, py - 45, 115, '#ff4d6d'));
      }
    } else if (skinId === 'flower') {
      pips.forEach(([px, py]) => drawDaisy(ctx, px, py, num === 1 ? 240 : 115));
    } else if (skinId === 'panda') {
      if (num === 1) {
        drawPandaFace(ctx, 256, 256, 280);
      } else {
        pips.forEach(([px, py]) => drawCirclePip(ctx, px, py, 52, '#111111'));
      }
    } else if (skinId === 'crystal') {
      pips.forEach(([px, py]) => {
        drawHeart(ctx, px, py - (num === 1 ? 90 : 45), num === 1 ? 250 : 115, '#ff2a85', '#ffd6e0');
      });
    } else if (skinId === 'cat') {
      if (num === 1) {
        drawCatFace(ctx, 256, 256, 280);
      } else {
        pips.forEach(([px, py]) => drawPaw(ctx, px, py, 75, '#ff758f'));
      }
    } else if (skinId === 'heart') {
      pips.forEach(([px, py]) => {
        drawHeart(ctx, px, py - (num === 1 ? 95 : 48), num === 1 ? 260 : 120, '#ffffff');
      });
    } else if (skinId === 'rainbow') {
      if (num === 1) {
        drawHeart(ctx, 256, 170, 250, '#ffffff');
      } else {
        pips.forEach(([px, py]) => drawCirclePip(ctx, px, py, 52, '#ffffff'));
      }
    } else if (skinId === 'bunny') {
      if (num === 1) {
        drawBunnyFace(ctx, 256, 256, 280);
      } else {
        pips.forEach(([px, py]) => drawCirclePip(ctx, px, py, 52, '#ff85a1'));
      }
    } else if (skinId === 'starry') {
      if (num === 1) {
        drawStar(ctx, 256, 256, 5, 185, 90, '#ffdf00');
      } else {
        pips.forEach(([px, py]) => drawStar(ctx, px, py, 5, 75, 36, '#ffdf00'));
      }
    } else if (skinId === 'floral') {
      pips.forEach(([px, py]) => drawTulip(ctx, px, py, num === 1 ? 220 : 115));
    } else if (skinId === 'bow_heart') {
      if (num === 1) {
        drawHeart(ctx, 256, 175, 260, '#c9184a');
        drawBowIcon(ctx, 256, 215, 150, '#ffa6b9');
      } else {
        pips.forEach(([px, py]) => drawHeart(ctx, px, py - 45, 115, '#c9184a'));
      }
    } else if (skinId === 'queen') {
      if (num === 1) {
        drawQueenCrown(ctx, 256, 256, 280);
      } else {
        pips.forEach(([px, py]) => drawHeart(ctx, px, py - 45, 115, '#ff1493', '#ff69b4'));
      }
    } else if (skinId === 'royal_crown') {
      if (num === 1) {
        drawCrownIcon(ctx, 256, 256, 280, '#00d4ff', 'rgba(0, 212, 255, 0.9)');
      } else {
        pips.forEach(([px, py]) => drawCirclePip(ctx, px, py, 52, '#00d4ff'));
      }
    } else if (skinId === 'football') {
      if (num === 1) {
        drawSoccerBall(ctx, 256, 256, 180);
      } else {
        pips.forEach(([px, py]) => drawCirclePip(ctx, px, py, 52, '#ba1d1d'));
      }
    } else if (skinId === 'cowboy') {
      if (num === 1) {
        drawStar(ctx, 256, 256, 5, 185, 90, '#5c3317');
      } else {
        pips.forEach(([px, py]) => drawStar(ctx, px, py, 5, 75, 36, '#5c3317'));
      }
    } else if (skinId === 'ninja') {
      if (num === 1) {
        drawFlame(ctx, 256, 256, 275, '#e63946');
      } else {
        pips.forEach(([px, py]) => drawCirclePip(ctx, px, py, 52, '#e63946'));
      }
    } else if (skinId === 'hoodie') {
      if (num === 1) {
        drawSnowflake(ctx, 256, 256, 180, '#ffffff');
      } else {
        pips.forEach(([px, py]) => drawCirclePip(ctx, px, py, 52, '#ffffff'));
      }
    } else if (skinId === 'king') {
      if (num === 1) {
        drawQueenCrown(ctx, 256, 256, 285);
      } else {
        pips.forEach(([px, py]) => drawCirclePip(ctx, px, py, 52, '#ffd700'));
      }
    } else if (skinId === 'cap') {
      if (num === 1) {
        drawStar(ctx, 256, 256, 5, 185, 90, '#0077b6');
      } else {
        pips.forEach(([px, py]) => drawStar(ctx, px, py, 5, 75, 36, '#0077b6'));
      }
    } else if (skinId === 'space') {
      if (num === 1) {
        drawSaturn(ctx, 256, 256, 185, '#ffd166');
      } else {
        pips.forEach(([px, py]) => drawStar(ctx, px, py, 5, 75, 36, '#a370f7'));
      }
    } else if (skinId === 'soccer') {
      if (num === 1) {
        drawSoccerBall(ctx, 256, 256, 180);
      } else {
        pips.forEach(([px, py]) => drawCirclePip(ctx, px, py, 52, '#111111'));
      }
    } else if (skinId === 'gamer') {
      if (num === 1) {
        drawGamepad(ctx, 256, 256, 280, '#ffffff');
      } else {
        pips.forEach(([px, py]) => drawCirclePip(ctx, px, py, 52, '#06d6a0'));
      }
    } else if (skinId === 'cute_boys') {
      if (num === 1) {
        drawCloud(ctx, 256, 256, 280, '#ffffff');
      } else {
        pips.forEach(([px, py]) => drawCirclePip(ctx, px, py, 52, '#ffffff'));
      }
    } else if (skinId === 'marble_royal') {
      if (num === 1) {
        drawQueenCrown(ctx, 256, 256, 280);
      } else {
        pips.forEach(([px, py]) => drawCirclePip(ctx, px, py, 52, '#d4af37'));
      }
    } else if (skinId === 'neon_glow') {
      if (num === 1) {
        drawStar(ctx, 256, 256, 5, 190, 92, '#f72585');
      } else {
        pips.forEach(([px, py]) => drawStar(ctx, px, py, 5, 75, 36, '#4cc9f0'));
      }
    } else if (skinId === 'cool_boys') {
      if (num === 1) {
        drawLightning(ctx, 256, 256, 280, '#ffb703');
      } else {
        pips.forEach(([px, py]) => drawCirclePip(ctx, px, py, 52, '#3a0ca3'));
      }
    } else if (skinId === 'minimal_crown') {
      if (num === 1) {
        drawQueenCrown(ctx, 256, 256, 270);
      } else {
        pips.forEach(([px, py]) => drawCirclePip(ctx, px, py, 52, '#ffffff'));
      }
    } else if (skinId === 'paw') {
      if (num === 1) {
        drawPaw(ctx, 256, 256, 120, '#ff70a6');
      } else {
        pips.forEach(([px, py]) => drawPaw(ctx, px, py, 68, '#ffd166'));
      }
    }
  }

  const tex = new THREE.CanvasTexture(cvs);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 16;
  diceSkinTextureCache[cacheKey] = tex;
  return tex;
}

// 3D Procedural Accessories for Cute Themed Dice
function createBowMesh(color = 0xff758f) {
  const group = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: color, roughness: 0.35, clearcoat: 0.6 });
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), mat);
  knot.scale.set(1.1, 0.9, 0.9);
  group.add(knot);

  const loopGeo = new THREE.TorusGeometry(0.12, 0.045, 8, 16);
  const leftLoop = new THREE.Mesh(loopGeo, mat);
  leftLoop.position.set(-0.15, 0.04, 0);
  leftLoop.rotation.set(0, 0, 0.4);
  group.add(leftLoop);

  const rightLoop = new THREE.Mesh(loopGeo, mat);
  rightLoop.position.set(0.15, 0.04, 0);
  rightLoop.rotation.set(0, 0, -0.4);
  group.add(rightLoop);

  group.position.set(0, 0.525, 0);
  return group;
}

function createCatEarsMesh(color = 0xfff5f5, innerColor = 0xff85a1) {
  const group = new THREE.Group();
  const outerMat = new THREE.MeshPhysicalMaterial({ color: color, roughness: 0.3, clearcoat: 0.7 });
  const innerMat = new THREE.MeshBasicMaterial({ color: innerColor });

  [-0.24, 0.24].forEach((xPos) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.24, 4), outerMat);
    ear.position.set(xPos, 0.525 + 0.10, 0);
    ear.rotation.y = Math.PI / 4;
    ear.rotation.z = xPos < 0 ? 0.18 : -0.18;
    group.add(ear);

    const innerEar = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 4), innerMat);
    innerEar.position.set(xPos, 0.525 + 0.08, 0.04);
    innerEar.rotation.y = Math.PI / 4;
    innerEar.rotation.z = xPos < 0 ? 0.18 : -0.18;
    group.add(innerEar);
  });
  return group;
}

function createBunnyEarsMesh(color = 0xffffff, innerColor = 0xff85a1) {
  const group = new THREE.Group();
  const outerMat = new THREE.MeshPhysicalMaterial({ color: color, roughness: 0.3, clearcoat: 0.7 });
  const innerMat = new THREE.MeshBasicMaterial({ color: innerColor });

  [-0.16, 0.16].forEach((xPos) => {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.38, 12), outerMat);
    ear.position.set(xPos, 0.525 + 0.17, 0);
    ear.rotation.z = xPos < 0 ? 0.12 : -0.12;
    group.add(ear);

    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.26, 12), innerMat);
    inner.position.set(xPos, 0.525 + 0.15, 0.035);
    inner.rotation.z = xPos < 0 ? 0.12 : -0.12;
    group.add(inner);
  });
  return group;
}

function createPandaEarsMesh(color = 0x111111) {
  const group = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: color, roughness: 0.4 });
  [-0.28, 0.28].forEach((xPos) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), mat);
    ear.position.set(xPos, 0.525 + 0.06, 0);
    group.add(ear);
  });
  return group;
}

function updateDieVisuals(die, skinId) {
  if (!die || !die.userData || !die.userData.isDie) return;
  const skin = DICE_SKINS[skinId] || DICE_SKINS.classic;
  const body = die.userData.bodyMesh;
  const faceMeshes = die.userData.faceMeshes || [];
  const accessoryGroup = die.userData.accessoryGroup;

  if (body && body.material) {
    if (skin.isRainbow) {
      body.material.map = getRainbowTexture();
      body.material.color.set(0xffffff);
    } else {
      body.material.map = null;
      body.material.color.set(skin.bodyColor);
    }
    body.material.roughness = skin.bodyRoughness;
    body.material.metalness = skin.bodyMetalness || 0.02;
    body.material.clearcoat = skin.bodyClearcoat || 0.90;
    body.material.clearcoatRoughness = 0.06;
    if (skin.transmission) {
      body.material.transmission = skin.transmission;
      body.material.ior = skin.ior || 1.5;
      body.material.transparent = true;
      body.material.opacity = 1.0;
    } else {
      body.material.transmission = 0.0;
      body.material.transparent = false;
      body.material.opacity = 1.0;
    }
    body.material.needsUpdate = true;
  }

  const size = die.userData.dieSize || 1.05;
  const targetFaceSize = size * 0.88;

  faceMeshes.forEach((faceMesh) => {
    const num = faceMesh.userData.faceNum;
    const tex = getDiceNumberTexture(num, skinId);
    faceMesh.material.map = tex;
    faceMesh.material.needsUpdate = true;
    if (faceMesh.geometry && faceMesh.geometry.parameters && faceMesh.geometry.parameters.width !== targetFaceSize) {
      faceMesh.geometry.dispose();
      faceMesh.geometry = new THREE.PlaneGeometry(targetFaceSize, targetFaceSize);
    }
  });

  if (accessoryGroup) {
    while (accessoryGroup.children.length > 0) {
      accessoryGroup.remove(accessoryGroup.children[0]);
    }
    if (skin.hasAccessory === 'bow') {
      accessoryGroup.add(createBowMesh(skin.id === 'bow_heart' ? 0xff4d6d : 0xff758f));
    } else if (skin.hasAccessory === 'cat_ears') {
      accessoryGroup.add(createCatEarsMesh(0xfff5f5, 0xff758f));
    } else if (skin.hasAccessory === 'bunny_ears') {
      accessoryGroup.add(createBunnyEarsMesh(0xffffff, 0xff85a1));
    } else if (skin.hasAccessory === 'panda_ears') {
      accessoryGroup.add(createPandaEarsMesh(0x111111));
    }
  }
}


// 3D Procedural Accessories for Gotiyan (Pawns)
function createCrownHat(goldColor = 0xffd700, jewelColor = 0xba1d1d) {
  const group = new THREE.Group();
  const goldMat = new THREE.MeshPhysicalMaterial({
    color: goldColor,
    metalness: 0.95,
    roughness: 0.15,
    clearcoat: 1.0
  });
  const jewelMat = new THREE.MeshPhysicalMaterial({
    color: jewelColor,
    metalness: 0.2,
    roughness: 0.1,
    clearcoat: 1.0
  });

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.035, 8, 24), goldMat);
  rim.position.set(0, 1.70, 0);
  rim.rotation.x = Math.PI / 2;
  group.add(rim);

  const spikeCount = 5;
  for (let i = 0; i < spikeCount; i++) {
    const angle = (i * 2 * Math.PI) / spikeCount;
    const px = Math.cos(angle) * 0.30;
    const pz = Math.sin(angle) * 0.30;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.16, 4), goldMat);
    spike.position.set(px, 1.80, pz);
    group.add(spike);

    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), jewelMat);
    pearl.position.set(px, 1.88, pz);
    group.add(pearl);
  }
  return group;
}

function createCowboyHat(hatColor = 0x8b5a2b) {
  const group = new THREE.Group();
  const leatherMat = new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.65 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.4 });

  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.03, 24), leatherMat);
  brim.scale.set(1.22, 1.0, 1.0);
  brim.position.set(0, 1.62, 0);
  group.add(brim);

  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.25, 16), leatherMat);
  crown.position.set(0, 1.74, 0);
  group.add(crown);

  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.04, 16), bandMat);
  band.position.set(0, 1.64, 0);
  group.add(band);

  return group;
}

function createNinjaMask(pColor = 0xba1d1d) {
  const group = new THREE.Group();
  const bandMat = new THREE.MeshStandardMaterial({ color: pColor, roughness: 0.4 });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.2 });

  const headband = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.09, 16, 1, true), bandMat);
  headband.position.set(0, 1.54, 0);
  group.add(headband);

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.03), plateMat);
  plate.position.set(0, 1.54, 0.33);
  group.add(plate);

  const tailsMat = new THREE.MeshStandardMaterial({ color: pColor, roughness: 0.4 });
  [-0.08, 0.08].forEach(xOff => {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.02), tailsMat);
    tail.position.set(xOff, 1.45, -0.34);
    tail.rotation.z = xOff < 0 ? 0.25 : -0.25;
    group.add(tail);
  });

  return group;
}

function createHoodieMesh(pColor = 0xba1d1d) {
  const group = new THREE.Group();
  const clothMat = new THREE.MeshStandardMaterial({ color: pColor, roughness: 0.6 });

  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.39, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.72), clothMat);
  hood.position.set(0, 1.46, -0.04);
  group.add(hood);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 8, 16), clothMat);
  rim.position.set(0, 1.20, 0);
  rim.rotation.x = Math.PI / 2;
  group.add(rim);

  return group;
}

function createBaseballCap(capColor = 0xba1d1d) {
  const group = new THREE.Group();
  const capMat = new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.45 });

  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), capMat);
  dome.position.set(0, 1.54, 0);
  group.add(dome);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.028, 0.24), capMat);
  visor.position.set(0, 1.52, 0.28);
  visor.rotation.x = 0.2;
  group.add(visor);

  const button = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), capMat);
  button.position.set(0, 1.88, 0);
  group.add(button);

  return group;
}

function createSoccerCap(pColor = 0xba1d1d) {
  const group = new THREE.Group();
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
  const trimMat = new THREE.MeshStandardMaterial({ color: pColor, roughness: 0.35 });

  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), capMat);
  dome.position.set(0, 1.54, 0);
  group.add(dome);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.028, 0.24), trimMat);
  visor.position.set(0, 1.52, 0.28);
  visor.rotation.x = 0.2;
  group.add(visor);

  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.025, 6, 16), trimMat);
  stripe.position.set(0, 1.54, 0);
  stripe.rotation.x = Math.PI / 2;
  group.add(stripe);

  return group;
}

function createSpaceHelmet(pColor = 0xba1d1d) {
  const group = new THREE.Group();
  const domeMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.05,
    roughness: 0.1,
    transmission: 0.55,
    transparent: true,
    opacity: 0.85
  });
  const visorMat = new THREE.MeshPhysicalMaterial({
    color: 0xffd700,
    metalness: 0.95,
    roughness: 0.1,
    clearcoat: 1.0
  });

  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), domeMat);
  dome.position.set(0, 1.45, 0);
  group.add(dome);

  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.425, 16, 16, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.28, Math.PI * 0.44), visorMat);
  visor.position.set(0, 1.45, 0);
  group.add(visor);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 8, 20), new THREE.MeshStandardMaterial({ color: pColor, roughness: 0.4 }));
  collar.position.set(0, 1.12, 0);
  collar.rotation.x = Math.PI / 2;
  group.add(collar);

  return group;
}

function createHeadphonesMesh(headsetColor = 0xba1d1d) {
  const group = new THREE.Group();
  const padMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.5 });
  const trimMat = new THREE.MeshStandardMaterial({ color: headsetColor, roughness: 0.3 });

  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 8, 24, Math.PI), trimMat);
  arch.position.set(0, 1.56, 0);
  arch.rotation.z = Math.PI;
  group.add(arch);

  [-0.34, 0.34].forEach(xPos => {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16), padMat);
    cup.position.set(xPos, 1.45, 0);
    cup.rotation.z = Math.PI / 2;
    group.add(cup);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 6, 16), trimMat);
    ring.position.set(xPos > 0 ? xPos + 0.04 : xPos - 0.04, 1.45, 0);
    ring.rotation.y = Math.PI / 2;
    group.add(ring);
  });

  return group;
}

function createSunglassesMesh(pColor = 0xba1d1d) {
  const group = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x050505, metalness: 0.9, roughness: 0.1, clearcoat: 1.0 });

  [-0.12, 0.12].forEach(xPos => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.10, 0.03), frameMat);
    frame.position.set(xPos, 1.48, 0.32);
    group.add(frame);

    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.035), lensMat);
    lens.position.set(xPos, 1.48, 0.32);
    group.add(lens);
  });

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.02), frameMat);
  bridge.position.set(0, 1.50, 0.32);
  group.add(bridge);

  return group;
}

function createNeonHalo(color = 0x00f0ff) {
  const group = new THREE.Group();
  const haloMat = new THREE.MeshBasicMaterial({ color: color });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 8, 32), haloMat);
  halo.position.set(0, 1.95, 0);
  halo.rotation.x = Math.PI / 2;
  group.add(halo);
  return group;
}

function createPawEarsMesh(pColor = 0xba1d1d) {
  const group = new THREE.Group();
  const earMat = new THREE.MeshStandardMaterial({ color: pColor, roughness: 0.5 });
  const innerMat = new THREE.MeshStandardMaterial({ color: 0xffb3c6, roughness: 0.6 });

  [-0.22, 0.22].forEach(xPos => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), earMat);
    ear.position.set(xPos, 1.76, 0);
    group.add(ear);

    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), innerMat);
    inner.position.set(xPos, 1.76, 0.06);
    group.add(inner);
  });
  return group;
}

function createMinimalCrownHat(goldColor = 0xe0b84c) {
  const group = new THREE.Group();
  const crownMat = new THREE.MeshPhysicalMaterial({ color: goldColor, metalness: 0.9, roughness: 0.2, clearcoat: 0.8 });
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.16, 3), crownMat);
  crown.position.set(0, 1.78, 0);
  group.add(crown);
  return group;
}

function createCuteHair(pColor = 0xba1d1d) {
  const group = new THREE.Group();
  const hairMat = new THREE.MeshStandardMaterial({ color: pColor, roughness: 0.55 });
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.48), hairMat);
  tuft.position.set(0, 1.58, 0.04);
  group.add(tuft);
  return group;
}

// Procedural Canvas Textures & PBR Material Config for Player Skins (Pawns / Gotiyan)
const gotiTextureCache = new Map();

function colorToHexStr(color) {
  if (typeof color === 'string') return color.startsWith('#') ? color : `#${color}`;
  return '#' + Number(color).toString(16).padStart(6, '0');
}

function getGotiPBRProps(skinId, pColor) {
  switch (skinId) {
    case 'royal_crown':
      return { roughness: 0.18, metalness: 0.25, clearcoat: 0.90, clearcoatRoughness: 0.08 };
    case 'football':
      return { roughness: 0.40, metalness: 0.02, clearcoat: 0.30, clearcoatRoughness: 0.15 };
    case 'cowboy':
      return { roughness: 0.58, metalness: 0.14, clearcoat: 0.18, clearcoatRoughness: 0.20 };
    case 'ninja':
      return { roughness: 0.65, metalness: 0.06, clearcoat: 0.10, clearcoatRoughness: 0.25 };
    case 'hoodie':
      return { roughness: 0.48, metalness: 0.02, clearcoat: 0.25, clearcoatRoughness: 0.18 };
    case 'king':
      return { roughness: 0.18, metalness: 0.35, clearcoat: 0.90, clearcoatRoughness: 0.06 };
    case 'cap':
      return { roughness: 0.38, metalness: 0.05, clearcoat: 0.35, clearcoatRoughness: 0.12 };
    case 'space':
      return { roughness: 0.22, metalness: 0.45, clearcoat: 0.85, clearcoatRoughness: 0.08 };
    case 'soccer':
      return { roughness: 0.35, metalness: 0.05, clearcoat: 0.40, clearcoatRoughness: 0.12 };
    case 'gamer':
      return { roughness: 0.18, metalness: 0.28, clearcoat: 0.85, clearcoatRoughness: 0.06 };
    case 'cute_boys':
      return { roughness: 0.45, metalness: 0.02, clearcoat: 0.30, clearcoatRoughness: 0.15 };
    case 'marble_royal':
      return { roughness: 0.08, metalness: 0.04, clearcoat: 1.0, clearcoatRoughness: 0.03 };
    case 'neon_glow':
      return { roughness: 0.12, metalness: 0.18, clearcoat: 0.95, clearcoatRoughness: 0.05 };
    case 'cool_boys':
      return { roughness: 0.32, metalness: 0.22, clearcoat: 0.50, clearcoatRoughness: 0.10 };
    case 'minimal_crown':
      return { roughness: 0.22, metalness: 0.14, clearcoat: 0.65, clearcoatRoughness: 0.08 };
    case 'paw':
      return { roughness: 0.20, metalness: 0.02, clearcoat: 0.88, clearcoatRoughness: 0.06 };
    case 'classic':
    default:
      return { roughness: 0.12, metalness: 0.06, clearcoat: 0.95, clearcoatRoughness: 0.08 };
  }
}

function getGotiBodyTexture(skinId, pColor, pNum = 0, pIdx = 0) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const cacheKey = `${skinId}_${pColor}_${pNum}_${pIdx}`;
  if (gotiTextureCache.has(cacheKey)) {
    return gotiTextureCache.get(cacheKey);
  }

  const cvs = document.createElement('canvas');
  cvs.width = 512;
  cvs.height = 512;
  const ctx = cvs.getContext('2d');
  const baseHex = colorToHexStr(pColor);

  // 1. Base Layer: ALWAYS the authentic player calibrated color (Red, Yellow, Blue, Charcoal)
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);

  // 2. Soft depth gradient & specular shine preserving player color
  const lightGrad = ctx.createLinearGradient(0, 0, 512, 512);
  lightGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.15)');
  lightGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.0)');
  lightGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.25)');
  ctx.fillStyle = lightGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Helper drawing functions
  const drawGoldBand = (y, h) => {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0.0, '#7a5214');
    g.addColorStop(0.3, '#f9e79f');
    g.addColorStop(0.6, '#d4af37');
    g.addColorStop(1.0, '#5a3c0e');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, 512, h);
    ctx.strokeStyle = '#fff8db';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, y, 512, h);
  };

  const drawStar = (cx, cy, r, fill = '#ffd700', stroke = '#b8860b') => {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  };

  const drawCrownSymbol = (cx, cy, w, h) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy + h / 2);
    ctx.lineTo(cx - w / 2, cy - h / 3);
    ctx.lineTo(cx - w / 4, cy);
    ctx.lineTo(cx, cy - h / 2);
    ctx.lineTo(cx + w / 4, cy);
    ctx.lineTo(cx + w / 2, cy - h / 3);
    ctx.lineTo(cx + w / 2, cy + h / 2);
    ctx.closePath();
    const g = ctx.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2);
    g.addColorStop(0.0, '#fff4b8');
    g.addColorStop(0.5, '#d4af37');
    g.addColorStop(1.0, '#8c6b12');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  };

  const drawPaw = (cx, cy, r, color = '#ffffff') => {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.2, r * 0.7, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    const toeAngles = [-0.65, -0.22, 0.22, 0.65];
    toeAngles.forEach((ang) => {
      const tx = cx + Math.sin(ang) * (r * 0.95);
      const ty = cy - Math.cos(ang) * (r * 0.75);
      ctx.beginPath();
      ctx.arc(tx, ty, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  };

  const drawShurikenSymbol = (cx, cy, r) => {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const tipX = cx + Math.cos(a) * r;
      const tipY = cy + Math.sin(a) * r;
      const innerA = a + Math.PI / 4;
      const inX = cx + Math.cos(innerA) * (r * 0.28);
      const inY = cy + Math.sin(innerA) * (r * 0.28);
      if (i === 0) ctx.moveTo(tipX, tipY);
      else ctx.lineTo(tipX, tipY);
      ctx.lineTo(inX, inY);
    }
    ctx.closePath();
    ctx.fillStyle = '#e2e8f0';
    ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = '#111827';
    ctx.fill();
    ctx.restore();
  };

  // Specific Skin Rendering Logic - ALWAYS on top of the player's core identity color
  if (skinId === 'classic') {
    // 1. Banded Agate Gemstone Chatoyancy & Organic Curved Strata
    ctx.save();
    for (let b = 0; b < 10; b++) {
      ctx.beginPath();
      const by = 80 + b * 36;
      ctx.moveTo(0, by);
      ctx.bezierCurveTo(140, by - 14, 340, by + 16, 512, by - 8);
      ctx.lineTo(512, by + 18);
      ctx.bezierCurveTo(340, by + 34, 140, by + 4, 0, by + 18);
      ctx.closePath();
      ctx.fillStyle = (b % 2 === 0) ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.12)';
      ctx.fill();
    }
    ctx.restore();

    // 2. Chatoyant Silk Sheen Vertical Highlights (translucent gemstone depth)
    ctx.save();
    const chatoyantGrad = ctx.createLinearGradient(0, 0, 512, 0);
    chatoyantGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.0)');
    chatoyantGrad.addColorStop(0.2, 'rgba(255, 255, 255, 0.18)');
    chatoyantGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.0)');
    chatoyantGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0.22)');
    chatoyantGrad.addColorStop(0.8, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = chatoyantGrad;
    ctx.fillRect(0, 0, 512, 512);
    ctx.restore();

    // 3. Spindle Waist Turned 24K Gold Belt
    drawGoldBand(155, 20);

    // 4. Lower Pedestal Turned 24K Gold Belt with Guilloché Engraving
    drawGoldBand(440, 36);

    // Guilloché fretwork & micro-rivets along lower gold band
    ctx.save();
    ctx.strokeStyle = 'rgba(90, 60, 14, 0.85)';
    ctx.lineWidth = 1.6;
    for (let x = 8; x < 512; x += 24) {
      ctx.beginPath();
      ctx.arc(x + 12, 458, 6.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#fff8db';
      ctx.beginPath();
      ctx.arc(x + 12, 458, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 5. Royal Heirloom Star Crest on Front & Back Chest
    [128, 384].forEach(x => {
      drawStar(x, 260, 24, '#ffd700', '#d4af37');
      // Diamond center glint
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, 260, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (skinId === 'royal_crown') {
    // Imperial heraldry & gold filigree
    drawGoldBand(465, 22);
    drawGoldBand(340, 18);
    drawGoldBand(165, 14);
    [128, 384].forEach(x => drawCrownSymbol(x, 245, 60, 45));
  } else if (skinId === 'football') {
    // Athletic jersey stripes & squad numbers on player color
    const stripeW = 32;
    for (let x = 0; x < 512; x += stripeW * 2) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillRect(x, 180, stripeW, 200);
    }
    drawGoldBand(465, 18);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 165, 512, 16);
    const num = ['10', '7', '9', '8'][pNum % 4];
    ctx.font = 'bold 54px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    [128, 384].forEach(x => {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(num, x + 2, 272);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(num, x, 270);
      drawStar(x, 215, 14, '#ffd700', '#d4af37');
    });
  } else if (skinId === 'cowboy') {
    // Tooled saddle leather vest styling on player color
    ctx.fillStyle = 'rgba(0, 0, 0, 0.20)';
    for (let i = 0; i < 40; i++) {
      ctx.fillRect((i * 47) % 512, (i * 31) % 512, 12, 8);
    }
    ctx.fillStyle = 'rgba(45, 24, 10, 0.85)';
    ctx.fillRect(0, 330, 512, 28);
    [128, 384].forEach(x => {
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(x - 24, 326, 48, 36);
      ctx.fillStyle = '#2d180a';
      ctx.fillRect(x - 14, 332, 28, 24);
      drawStar(x, 245, 22, '#ffd700', '#b8860b');
    });
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(40, 190, 432, 130);
    ctx.setLineDash([]);
  } else if (skinId === 'ninja') {
    // Stealth crossed harness straps & shuriken on player color
    ctx.strokeStyle = 'rgba(18, 20, 24, 0.85)';
    ctx.lineWidth = 16;
    [128, 384].forEach(x => {
      ctx.beginPath();
      ctx.moveTo(x - 80, 180);
      ctx.lineTo(x + 80, 320);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 80, 180);
      ctx.lineTo(x - 80, 320);
      ctx.stroke();
      drawShurikenSymbol(x, 250, 26);
    });
    ctx.fillStyle = 'rgba(18, 20, 24, 0.85)';
    ctx.fillRect(0, 330, 512, 24);
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(0, 338, 512, 8);
  } else if (skinId === 'hoodie') {
    // Streetwear hoodie with drawstrings & kangaroo pocket on player color
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fillRect(0, 160, 512, 85);
    [128, 384].forEach(x => {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - 14, 175);
      ctx.lineTo(x - 14, 255);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 14, 175);
      ctx.lineTo(x + 14, 255);
      ctx.stroke();
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(x - 16, 255, 5, 12);
      ctx.fillRect(x + 12, 255, 5, 12);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 45, 290, 90, 45);
    });
  } else if (skinId === 'king') {
    // Royal monarch mantle with ermine trim & gold chains on player color
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 170, 512, 38);
    for (let x = 16; x < 512; x += 36) {
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(x, 185, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 1.5, 187, 3, 10);
    }
    drawGoldBand(460, 30);
    [128, 384].forEach(x => {
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, 210, 35, 0.2, Math.PI - 0.2);
      ctx.stroke();
      drawCrownSymbol(x, 265, 55, 40);
    });
  } else if (skinId === 'cap') {
    // Skater streetwear diagonal racing stripes on player color
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 165, 512, 16);
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.transform(1, 0, -0.4, 1, 0, 0);
    [128, 384].forEach(x => {
      ctx.fillRect(x, 200, 20, 130);
      ctx.fillRect(x + 28, 200, 10, 130);
    });
    ctx.restore();
    [128, 384].forEach(x => drawStar(x, 265, 18, '#ffffff', '#0077b6'));
  } else if (skinId === 'space') {
    // NASA astronaut EVA suit with control panel & mission patch on player color
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 180, 472, 160);
    drawGoldBand(165, 14);
    [128, 384].forEach(x => {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x - 36, 230, 72, 50);
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 36, 230, 72, 50);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(x - 26, 240, 8, 8);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(x - 12, 240, 8, 8);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(x + 2, 240, 8, 8);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x + 16, 240, 8, 8);
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x, 205, 20, 8, Math.PI / 6, 0, Math.PI * 2);
      ctx.stroke();
    });
  } else if (skinId === 'soccer') {
    // Soccer kit with chevron pattern & club crest on player color
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let y = 180; y < 350; y += 30) {
      for (let x = 0; x < 512; x += 36) {
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    [128, 384].forEach(x => {
      ctx.beginPath();
      ctx.moveTo(x - 45, 200);
      ctx.lineTo(x, 225);
      ctx.lineTo(x + 45, 200);
      ctx.stroke();
      drawStar(x, 250, 16, '#ffd700', '#d4af37');
    });
  } else if (skinId === 'gamer') {
    // Cyberpunk gaming chassis: audio spectrum equalizer bars & gamepad on player color
    ctx.fillStyle = 'rgba(0, 0, 0, 0.20)';
    for (let y = 0; y < 512; y += 8) {
      for (let x = 0; x < 512; x += 8) {
        ctx.fillRect(x, y, 4, 4);
      }
    }
    const barColors = ['#00f0ff', '#06d6a0', '#ffd166', '#ff4d6d', '#b5179e'];
    [128, 384].forEach(x => {
      barColors.forEach((col, idx) => {
        const bx = x - 32 + idx * 14;
        const h = 25 + (idx % 3) * 16;
        ctx.fillStyle = col;
        ctx.fillRect(bx, 290 - h, 9, h);
      });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 20, 225, 40, 20);
      ctx.fillRect(x - 16, 220, 8, 30);
      ctx.fillRect(x + 8, 220, 8, 30);
    });
  } else if (skinId === 'cute_boys') {
    // Kawaii blushing face & pastel hearts on player color
    [128, 384].forEach(x => {
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x - 18, 240, 8, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 18, 240, 8, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = '#fda4af';
      ctx.beginPath();
      ctx.arc(x - 24, 252, 7, 0, Math.PI * 2);
      ctx.arc(x + 24, 252, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, 250, 6, 0, Math.PI);
      ctx.stroke();
    });
  } else if (skinId === 'marble_royal') {
    // Carrara marble veining & gold inlays on the player's gemstone color
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.bezierCurveTo(180, 140, 80, 290, 240, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(290, 0);
    ctx.bezierCurveTo(400, 160, 280, 320, 480, 512);
    ctx.stroke();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(120, 0);
    ctx.bezierCurveTo(220, 180, 150, 340, 310, 512);
    ctx.stroke();
    drawGoldBand(465, 20);
    drawGoldBand(165, 14);
  } else if (skinId === 'neon_glow') {
    // High-voltage neon circuit tracks on player color
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 3;
    for (let x = 64; x < 512; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, 150);
      ctx.lineTo(x, 380);
      ctx.stroke();
    }
    [128, 384].forEach(x => {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, 255, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(x, 255, 10, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (skinId === 'cool_boys') {
    // Diagonal silver zipper & lightning bolt on player color
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(80, 180);
    ctx.lineTo(200, 340);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(336, 180);
    ctx.lineTo(456, 340);
    ctx.stroke();
    ctx.setLineDash([]);
    [128, 384].forEach(x => {
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(x, 220);
      ctx.lineTo(x + 12, 245);
      ctx.lineTo(x + 2, 245);
      ctx.lineTo(x + 8, 275);
      ctx.lineTo(x - 12, 248);
      ctx.lineTo(x - 2, 248);
      ctx.closePath();
      ctx.fill();
    });
  } else if (skinId === 'minimal_crown') {
    // Brushed gold geometric rings & crown icon on player color
    drawGoldBand(465, 14);
    drawGoldBand(340, 8);
    drawGoldBand(165, 8);
    [128, 384].forEach(x => {
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, 250, 18, 0, Math.PI * 2);
      ctx.stroke();
      drawCrownSymbol(x, 250, 24, 18);
    });
  } else if (skinId === 'paw') {
    // Cheerful paw prints & polka dots on player color
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    for (let y = 160; y < 380; y += 45) {
      for (let x = 20; x < 512; x += 55) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    [128, 384].forEach(x => {
      drawPaw(x, 230, 20, '#ffffff');
      drawPaw(x + 16, 275, 16, '#ffd700');
      drawPaw(x - 16, 315, 14, '#ffffff');
    });
  }

  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 16;
  tex.encoding = THREE.sRGBEncoding;
  tex.generateMipmaps = true;

  gotiTextureCache.set(cacheKey, tex);
  return tex;
}

function updatePawnVisuals(mesh, skinId) {
  if (!mesh || !mesh.userData) return;
  const pIdx = mesh.userData.playerId !== undefined ? mesh.userData.playerId : 0;
  const pNum = mesh.userData.pawnId !== undefined ? mesh.userData.pawnId : 0;
  const skin = GOTI_SKINS[skinId] || GOTI_SKINS.classic;

  const PLAYER_COLORS = [
    PALETTE.PAWN_RED,
    PALETTE.PAWN_YELLOW,
    PALETTE.PAWN_BLUE,
    PALETTE.PAWN_CHARCOAL
  ];
  const pColor = PLAYER_COLORS[pIdx] || PALETTE.PAWN_RED;

  // 1. Update 3D Pawn Body Texture Map & PBR Properties
  if (mesh.material) {
    const tex = getGotiBodyTexture(skin.id, pColor, pNum, pIdx);
    mesh.material.map = tex;

    const pbr = getGotiPBRProps(skin.id, pColor);
    mesh.material.roughness = pbr.roughness;
    mesh.material.metalness = pbr.metalness;
    mesh.material.clearcoat = pbr.clearcoat;
    mesh.material.clearcoatRoughness = pbr.clearcoatRoughness || 0.08;
    if (pbr.emissive) {
      mesh.material.emissive.set(pbr.emissive);
      mesh.material.emissiveIntensity = pbr.emissiveIntensity || 0.3;
    } else {
      mesh.material.emissive.set(0x000000);
      mesh.material.emissiveIntensity = 0.0;
    }
    if (tex) {
      mesh.material.color.set(0xffffff);
    } else {
      mesh.material.color.set(pColor);
    }
    mesh.material.needsUpdate = true;
  }

  // 2. Update 3D Headgear & Accessories
  const group = mesh.userData.accessoryGroup;
  if (group) {
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    if (skin.type !== 'none') {
      let accMesh = null;
      if (skin.type === 'crown') {
        accMesh = createCrownHat(skin.accessoryColor || 0xffd700, pColor);
      } else if (skin.type === 'cowboy_hat') {
        accMesh = createCowboyHat(skin.accessoryColor || 0x8b5a2b);
      } else if (skin.type === 'ninja_mask') {
        accMesh = createNinjaMask(pColor);
      } else if (skin.type === 'hoodie') {
        accMesh = createHoodieMesh(pColor);
      } else if (skin.type === 'baseball_cap') {
        accMesh = createBaseballCap(pColor);
      } else if (skin.type === 'soccer_cap') {
        accMesh = createSoccerCap(pColor);
      } else if (skin.type === 'space_helmet') {
        accMesh = createSpaceHelmet(pColor);
      } else if (skin.type === 'headphones') {
        accMesh = createHeadphonesMesh(pColor);
      } else if (skin.type === 'sunglasses') {
        accMesh = createSunglassesMesh(pColor);
      } else if (skin.type === 'neon_halo') {
        accMesh = createNeonHalo(pColor);
      } else if (skin.type === 'paw_ears') {
        accMesh = createPawEarsMesh(pColor);
      } else if (skin.type === 'minimal_crown') {
        accMesh = createMinimalCrownHat(skin.accessoryColor || 0xe0b84c);
      } else if (skin.type === 'cute_hair') {
        accMesh = createCuteHair(pColor);
      }

      if (accMesh) {
        accMesh.traverse((child) => {
          child.raycast = () => {};
        });
        group.add(accMesh);
      }
    }
  }
}

function applyGotiSkin(skinId) {
  if (!GOTI_SKINS[skinId]) skinId = 'classic';
  currentGotiSkinId = skinId;
  gotiTextureCache.clear();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('ludo_goti_skin', skinId);
  }

  pawns.forEach((pMesh) => {
    updatePawnVisuals(pMesh, skinId);
  });

  document.querySelectorAll('.goti-card').forEach((card) => {
    if (card.dataset.gotiId === skinId) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  const gotiLabel = document.getElementById('active-goti-label');
  if (gotiLabel) gotiLabel.textContent = `Active: ${GOTI_SKINS[skinId].name}`;

  updateStatusBanner(`Equipped ${GOTI_SKINS[skinId].name} Player Skin ♟️`);
}

function applyComboSet(comboId) {
  const combo = THEME_COMBOS.find((c) => c.id === comboId);
  if (!combo) return;
  currentComboId = comboId;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('ludo_combo_set', comboId);
  }

  applyDiceSkin(combo.diceSkin);
  applyGotiSkin(combo.gotiSkin);
  setGameTheme(comboId);

  document.querySelectorAll('.combo-card').forEach((card) => {
    if (card.dataset.comboId === comboId) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  const comboLabel = document.getElementById('active-combo-label');
  if (comboLabel) comboLabel.textContent = `Equipped: ${combo.name}`;

  updateStatusBanner(`Equipped ${combo.name} Set 🌟`);
}

function applyDiceSkin(skinId) {
  if (!DICE_SKINS[skinId]) skinId = 'classic';
  currentDiceSkinId = skinId;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('ludo_dice_skin', skinId);
  }

  dice.forEach((die) => {
    updateDieVisuals(die, skinId);
  });

  document.querySelectorAll('.dice-skin-card').forEach((card) => {
    if (card.dataset.skinId === skinId) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  const diceLabel = document.getElementById('active-dice-label');
  if (diceLabel) diceLabel.textContent = `Active: ${DICE_SKINS[skinId].name}`;
  updateStatusBanner(`Equipped ${DICE_SKINS[skinId].name} 🎲`);
}

function buildCompactDie(size) {
  const group = new THREE.Group();
  group.userData.isDie = true;
  group.userData.dieSize = size;
  group.userData.faceMeshes = [];

  // 1. Die Body Mesh
  const dieGeo = createRoundedDieGeometry(size, size * 0.13, 5);
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: PALETTE.DICE_BODY,
    roughness: 0.16,
    metalness: 0.02,
    clearcoat: 0.90,
    clearcoatRoughness: 0.06,
    reflectivity: 0.88
  });
  bodyMat.userData = { originalColor: PALETTE.DICE_BODY };
  const body = new THREE.Mesh(dieGeo, bodyMat);
  body.castShadow = false;
  body.receiveShadow = false;
  group.add(body);
  group.userData.bodyMesh = body;

  // 2. High-Legibility Numbered / Themed Faces
  const h = size / 2;
  const faceSize = size * 0.88;
  const faceGeo = new THREE.PlaneGeometry(faceSize, faceSize);

  const faces = [
    { num: 1, pos: [0, h + 0.001, 0],   rot: [-Math.PI / 2, 0, 0] },
    { num: 6, pos: [0, -h - 0.001, 0],  rot: [Math.PI / 2, 0, 0] },
    { num: 2, pos: [0, 0, h + 0.001],   rot: [0, 0, 0] },
    { num: 5, pos: [0, 0, -h - 0.001],  rot: [0, Math.PI, 0] },
    { num: 3, pos: [h + 0.001, 0, 0],   rot: [0, Math.PI / 2, 0] },
    { num: 4, pos: [-h - 0.001, 0, 0],  rot: [0, -Math.PI / 2, 0] }
  ];

  faces.forEach(({ num, pos, rot }) => {
    const tex = getDiceNumberTexture(num, currentDiceSkinId);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      roughness: 0.20,
      metalness: 0.08,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const faceMesh = new THREE.Mesh(faceGeo, mat);
    faceMesh.position.set(pos[0], pos[1], pos[2]);
    faceMesh.rotation.set(rot[0], rot[1], rot[2]);
    faceMesh.userData.faceNum = num;
    group.add(faceMesh);
    group.userData.faceMeshes.push(faceMesh);
  });

  // 3. Accessory Group (Ribbon bows, cat ears, bunny ears, panda ears)
  const accessoryGroup = new THREE.Group();
  group.userData.accessoryGroup = accessoryGroup;
  group.add(accessoryGroup);

  return group;
}

function createScaledDice() {
  dice = [];
  diceShadows = [];

  // Die 1 in designated landing zone - resting perfectly flat with zero tilt
  const die1 = buildCompactDie(1.05);
  die1.position.set(8.8, 0.525, 2.0);
  die1.rotation.set(0, 0, 0);
  die1.name = "Die_1";
  masterExportGroup.add(die1);
  dice.push(die1);

  // Die 2 in designated landing zone (Active in 2-Dice mode) - resting perfectly flat with zero tilt
  const die2 = buildCompactDie(1.05);
  die2.position.set(9.2, 0.525, 5.0);
  die2.rotation.set(0, 0, 0);
  die2.name = "Die_2";
  masterExportGroup.add(die2);
  dice.push(die2);

  // Apply current active skin to both dice
  updateDieVisuals(die1, currentDiceSkinId);
  updateDieVisuals(die2, currentDiceSkinId);

  // Initially hidden by default in 1 Die mode
  die2.visible = false;

  // Ultra-Soft Dynamic Contact Shadows beneath dice (Agent 3: Physics Dice Animator) - Disabled for superdooper smooth performance
  [die1, die2].forEach((die, idx) => {
    const sSize = 1.85;
    const sGeo = new THREE.PlaneGeometry(sSize, sSize);
    const sMat = new THREE.MeshBasicMaterial({
      map: getSoftDiceShadowTexture(),
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    const sMesh = new THREE.Mesh(sGeo, sMat);
    sMesh.rotation.x = -Math.PI / 2;
    sMesh.position.set(die.position.x, 0.015, die.position.z);
    sMesh.visible = false;
    scene.add(sMesh);
    diceShadows.push(sMesh);
    sMesh.visible = false;
  });

  updateDicePositions();
}

function updateDicePositions() {
  if (!dice || dice.length === 0) return;
  const isMobile = window.innerWidth < 768 || (window.innerWidth / window.innerHeight) < 1.0;
  const isTwoDice = (engine.diceCount === 2);

  const d1 = dice[0];
  const d2 = dice[1];
  const sh1 = diceShadows[0];
  const sh2 = diceShadows[1];
  if (sh1) sh1.visible = false;
  if (sh2) sh2.visible = false;

  if (isMobile) {
    // Mobile / Portrait View: Dynamically align dice to bottom-center of current camera angle
    let cx = 0, cz = 9.45;
    let px = 1, pz = 0; // Perpendicular horizontal offset for 2-dice layout

    if (camera) {
      const camX = camera.position.x;
      const camZ = camera.position.z;
      const groundLen = Math.hypot(camX, camZ);

      if (groundLen > 1.0) {
        const dx = camX / groundLen;
        const dz = camZ / groundLen;
        // Distance from board center (0,0) to outer edge in this camera direction (half-slab = 7.8)
        const maxAxis = Math.max(Math.abs(dx), Math.abs(dz));
        const edgeDist = 7.8 / Math.max(maxAxis, 0.001);
        const dist = edgeDist + 1.85; // Clean clearance resting on tabletop velvet in front of corner/edge

        cx = dx * dist;
        cz = dz * dist;

        // Camera right-vector in XZ plane (for 2-dice separation perpendicular to line of sight)
        px = -dz;
        pz = dx;
      }
    }

    if (isTwoDice) {
      const sep = 1.45;
      if (d1) { d1.position.x = cx - px * sep; d1.position.z = cz - pz * sep; }
      if (sh1) { sh1.position.x = cx - px * sep; sh1.position.z = cz - pz * sep; }
      if (d2) { d2.position.x = cx + px * sep; d2.position.z = cz + pz * sep; }
      if (sh2) { sh2.position.x = cx + px * sep; sh2.position.z = cz + pz * sep; }
    } else {
      if (d1) { d1.position.x = cx; d1.position.z = cz; }
      if (sh1) { sh1.position.x = cx; sh1.position.z = cz; }
      if (d2) { d2.position.x = cx + px * 2.5; d2.position.z = cz + pz * 2.5; }
      if (sh2) { sh2.position.x = cx + px * 2.5; sh2.position.z = cz + pz * 2.5; }
    }
  } else {
    // Desktop View: Dynamically position dice on the SCREEN-LEFT of the board in current camera view
    let lx = -1, lz = 0; // Screen-left vector in XZ plane
    let fx = 0, fz = -1; // Depth axis perpendicular to screen-left for 2-dice separation
    let dist = 10.2;

    if (camera) {
      const camX = camera.position.x;
      const camZ = camera.position.z;
      const groundLen = Math.hypot(camX, camZ);

      if (groundLen > 1.0) {
        // Forward vector from camera towards board center in XZ plane
        const fNormX = -camX / groundLen;
        const fNormZ = -camZ / groundLen;

        // Camera Left in XZ plane = cross(Up, Forward): (fNormZ, 0, -fNormX)
        lx = fNormZ;
        lz = -fNormX;

        fx = fNormX;
        fz = fNormZ;

        // Compute board edge clearance along the screen-left direction
        const maxAxis = Math.max(Math.abs(lx), Math.abs(lz));
        const edgeDist = 7.8 / Math.max(maxAxis, 0.001);
        dist = edgeDist + 1.85; // Clean clearance on the tabletop velvet
      }
    }

    const cx = lx * dist;
    const cz = lz * dist;

    if (isTwoDice) {
      const sep = 1.35;
      if (d1) { d1.position.x = cx - fx * sep; d1.position.z = cz - fz * sep; }
      if (sh1) { sh1.position.x = cx - fx * sep; sh1.position.z = cz - fz * sep; }
      if (d2) { d2.position.x = cx + fx * sep; d2.position.z = cz + fz * sep; }
      if (sh2) { sh2.position.x = cx + fx * sep; sh2.position.z = cz + fz * sep; }
    } else {
      if (d1) { d1.position.x = cx; d1.position.z = cz; }
      if (sh1) { sh1.position.x = cx; sh1.position.z = cz; }
      if (d2) { d2.position.x = cx + fx * 2.5; d2.position.z = cz + fz * 2.5; }
      if (sh2) { sh2.position.x = cx + fx * 2.5; sh2.position.z = cz + fz * 2.5; }
    }
  }
}

// Authorities: Check whether current client is guest vs host in local team / online room
function isClientInLocalTeam() {
  if (gameMode === 'online') {
    if (webRtc) return !webRtc.isHost;
    return myOnlinePlayerIndex > 0;
  }
  if (currentRoomCode) {
    if (webRtc) return !webRtc.isHost;
    return myOnlinePlayerIndex > 0;
  }
  return false;
}

function isHostInLocalTeam() {
  if (gameMode === 'online' || currentRoomCode) {
    if (webRtc) return !!webRtc.isHost;
    return myOnlinePlayerIndex === 0;
  }
  return true; // Local single-player or pass & play
}

function setDiceCount(count, isUserAction = false) {
  // Only host can choose the option of dice before starting the game and during the game
  if (isUserAction && isClientInLocalTeam()) {
    updateStatusBanner("👑 Only the Room Host can choose 1 Die or 2 Dice mode!");
    flashModeLockedWarning();
    return false;
  }

  const isMultiplayerModalOpen = document.getElementById('multiplayer-modal')?.classList.contains('open');
  if (isUserAction && engine.isGameplayActive && !isMultiplayerModalOpen) {
    if (typeof sounds !== 'undefined' && sounds.playDiceBounce) {
      sounds.playDiceBounce(0.5);
    }
    updateStatusBanner("⚠️ Cannot change mode during gameplay! Click 'Start New Game' to switch.");
    flashModeLockedWarning();
    return false;
  }

  engine.setDiceCount(count, true);
  const isTwo = (count === 2);
  const label = document.getElementById('dice-mode-label');
  if (label) label.textContent = isTwo ? '2 Dice' : '1 Die';

  // Toggle die 2 visibility and shadow
  if (dice[1]) dice[1].visible = isTwo;
  if (diceShadows[1]) diceShadows[1].visible = false;

  updateDicePositions();

  // If host changed it, broadcast to all peers
  if (isUserAction && isHostInLocalTeam() && (gameMode === 'online' || currentRoomCode)) {
    const modeMsg = { type: 'dice_mode_sync', diceCount: count };
    if (webRtc) webRtc.broadcast(modeMsg);
    if (socket && socket.connected) socket.emit('dice_mode_sync', modeMsg);
  }

  // Toggle modal button styles
  const btn1 = document.getElementById('btn-dice-opt-1');
  const btn2 = document.getElementById('btn-dice-opt-2');
  if (btn1 && btn2) {
    if (isTwo) {
      btn2.classList.add('border-cyan-400', 'bg-cyan-950/80', 'text-white');
      btn2.classList.remove('text-slate-300', 'bg-cyan-950/40');
      btn1.classList.remove('border-cyan-400', 'bg-cyan-950/80', 'text-white');
      btn1.classList.add('text-slate-300', 'bg-cyan-950/40');
    } else {
      btn1.classList.add('border-cyan-400', 'bg-cyan-950/80', 'text-white');
      btn1.classList.remove('text-slate-300', 'bg-cyan-950/40');
      btn2.classList.remove('border-cyan-400', 'bg-cyan-950/80', 'text-white');
      btn2.classList.add('text-slate-300', 'bg-cyan-950/40');
    }
  }

  updateModeLockUI();
  updateStatusBanner(`Mode Selected: ${isTwo ? '2 Dice (Speed Ludo)' : '1 Die (Classic Ludo)'}`);
  return true;
}

function flashModeLockedWarning() {
  const btnToggle = document.getElementById('btn-toggle-dice');
  if (btnToggle) {
    btnToggle.classList.add('border-amber-400', 'ring-2', 'ring-amber-400/50');
    setTimeout(() => {
      btnToggle.classList.remove('border-amber-400', 'ring-2', 'ring-amber-400/50');
    }, 850);
  }
}

function updateModeLockUI() {
  const isLocked = engine.isGameplayActive;
  const lockBadge = document.getElementById('dice-lock-badge');
  const modeIcon = document.getElementById('dice-mode-icon');
  const btnToggle = document.getElementById('btn-toggle-dice');
  const modalAlert = document.getElementById('modal-mode-locked-alert');
  const modalBadge = document.getElementById('modal-mode-status-badge');
  const btnDice1 = document.getElementById('btn-dice-opt-1');
  const btnDice2 = document.getElementById('btn-dice-opt-2');
  const btnNewGame = document.getElementById('btn-new-game');
  const btnModalNewGame = document.getElementById('btn-modal-new-game');
  const btnExitGame = document.getElementById('btn-exit-game');
  const btnVictoryAgain = document.getElementById('btn-victory-play-again');

  const isClient = isClientInLocalTeam();
  const isInTeamGame = (gameMode === 'online' || !!currentRoomCode);

  // Authority updates on header and modal control buttons
  if (isClient) {
    if (btnNewGame) {
      btnNewGame.classList.add('opacity-40', 'cursor-not-allowed');
      btnNewGame.title = 'Host Only: Only the Room Host can start a new game';
    }
    if (btnModalNewGame) {
      btnModalNewGame.classList.add('opacity-40', 'cursor-not-allowed');
      btnModalNewGame.innerHTML = '<i class="fa-solid fa-lock text-[10px]"></i><span>Waiting for Host to Start...</span>';
    }
    if (btnExitGame) {
      btnExitGame.classList.add('opacity-40', 'cursor-not-allowed');
      btnExitGame.title = 'Host Only: Only the Room Host can exit match';
    }
    if (btnVictoryAgain) {
      btnVictoryAgain.classList.add('opacity-50', 'pointer-events-none');
      btnVictoryAgain.textContent = 'Waiting for Host to start new game...';
    }
  } else {
    if (btnNewGame) {
      btnNewGame.classList.remove('opacity-40', 'cursor-not-allowed');
      btnNewGame.title = 'Reset & Start New Game';
    }
    if (btnModalNewGame) {
      btnModalNewGame.classList.remove('opacity-40', 'cursor-not-allowed');
      btnModalNewGame.innerHTML = '<i class="fa-solid fa-rotate-left text-[10px]"></i><span>Start New Game</span>';
    }
    if (btnExitGame) {
      btnExitGame.classList.remove('opacity-40', 'cursor-not-allowed');
      btnExitGame.title = 'Exit Match';
    }
    if (btnVictoryAgain) {
      btnVictoryAgain.classList.remove('opacity-50', 'pointer-events-none');
      btnVictoryAgain.textContent = 'Play Again';
    }
  }

  // Before game start or during game: Client cannot choose dice mode
  if (isClient) {
    if (lockBadge) lockBadge.classList.remove('hidden');
    if (modeIcon) modeIcon.className = 'fa-solid fa-crown text-amber-300 text-xs';
    if (btnToggle) {
      btnToggle.title = 'Host manages dice mode (1 Die vs 2 Dice)';
      btnToggle.classList.add('opacity-60', 'cursor-not-allowed');
    }
    if (modalBadge) {
      modalBadge.textContent = 'Host Controlled';
      modalBadge.className = 'text-[9.5px] font-mono px-2 py-0.5 rounded-md bg-amber-950/80 text-amber-300 border border-amber-500/40 font-bold';
    }
    if (modalAlert) {
      modalAlert.innerHTML = '<i class="fa-solid fa-crown text-amber-400 text-[9px]"></i><span>Dice mode is selected by Room Host.</span>';
      modalAlert.classList.remove('hidden');
    }
    if (btnDice1) btnDice1.classList.add('opacity-50', 'pointer-events-none');
    if (btnDice2) btnDice2.classList.add('opacity-50', 'pointer-events-none');
    return;
  }

  const isMultiplayerModalOpen = document.getElementById('multiplayer-modal')?.classList.contains('open');

  // In multiplayer setup or before game start, Host always has full selectable control
  if (isMultiplayerModalOpen || !isLocked) {
    if (lockBadge) lockBadge.classList.add('hidden');
    if (modeIcon) modeIcon.className = 'fa-solid fa-cubes text-amber-400 text-xs';
    if (btnToggle) {
      btnToggle.title = 'Switch between 1 Die (Classic) and 2 Dice (Speed Ludo)';
      btnToggle.classList.remove('opacity-90', 'opacity-60', 'cursor-not-allowed');
    }
    if (modalAlert) modalAlert.classList.add('hidden');
    if (modalBadge) {
      modalBadge.textContent = isInTeamGame ? 'Host (Selectable)' : 'Selectable';
      modalBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-950/80 text-emerald-400 border border-emerald-500/30';
    }
    if (btnDice1) btnDice1.classList.remove('opacity-70', 'opacity-60', 'opacity-50', 'cursor-not-allowed', 'pointer-events-none');
    if (btnDice2) btnDice2.classList.remove('opacity-70', 'opacity-60', 'opacity-50', 'cursor-not-allowed', 'pointer-events-none');
  } else {
    // Host in mid-gameplay
    if (lockBadge) lockBadge.classList.remove('hidden');
    if (modeIcon) modeIcon.className = 'fa-solid fa-lock text-amber-300 text-xs';
    if (btnToggle) {
      btnToggle.title = 'Dice mode is locked during active gameplay. Start a New Game to change.';
      btnToggle.classList.add('opacity-90');
    }
    if (modalAlert) {
      modalAlert.innerHTML = '<i class="fa-solid fa-lock text-amber-400 text-[8.5px]"></i><span>Mode locked during active game. Click <strong>Start New Game</strong> to switch.</span>';
      modalAlert.classList.remove('hidden');
    }
    if (modalBadge) {
      modalBadge.textContent = 'Locked (In Game)';
      modalBadge.className = 'text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-950/80 text-amber-300 border border-amber-500/40';
    }
    if (btnDice1) btnDice1.classList.add('opacity-70');
    if (btnDice2) btnDice2.classList.add('opacity-70');
  }
}

function resetToNewGame(targetDiceCount, isRemoteSync = false, isForce = false) {
  // If forced or game is over, clear movement and rolling state immediately
  if (isForce || engine.isGameOver) {
    isPawnRunning = false;
    isRolling = false;
    isAwaitingPawnMove = false;
    isTurnTransitioning = false;
  }

  // Client cannot start a new game in team/room unless forced
  if (!isRemoteSync && !isForce && isClientInLocalTeam()) {
    updateStatusBanner("👑 Only the Room Host can start a new game!");
    flashModeLockedWarning();
    return false;
  }

  if (!isForce && !engine.isGameOver && (isRolling || isPawnRunning)) return false;

  const count = (targetDiceCount !== undefined) ? targetDiceCount : engine.diceCount;
  engine.resetGame(count);
  clearOfflineGameState();
  clearYardRankBadges();

  // Return all 3D pawn meshes to starting yard sockets
  pawns.forEach((mesh) => {
    const pIdx = mesh.userData.playerId;
    const pNum = mesh.userData.pawnId;
    const quad = BOARD_CONFIG.QUADS[pIdx];
    const off = [
      [-1.20, -1.20], [1.20, -1.20],
      [-1.20,  1.20], [1.20,  1.20]
    ][pNum];

    mesh.position.set(quad.cx + off[0], BOARD_CONFIG.SOCKET_Y, quad.cz + off[1]);
    mesh.userData.currentPos = {
      x: quad.cx + off[0],
      y: BOARD_CONFIG.SOCKET_Y,
      z: quad.cz + off[1]
    };
    mesh.userData.isSelectable = false;
    mesh.userData.isHopping = false;
    mesh.visible = isPlayerActiveInGame(pIdx, engine.activePlayerCount);

    // Reset winner crowns if any
    const crown = mesh.userData.accessoryGroup?.getObjectByName('winnerCrown');
    if (crown) crown.visible = false;
  });

  // Clear 2-dice popup and selection state
  hideGotiDicePopup();
  twoDicePool = [];
  activeDieIndex = null;
  twoDiceBonusGranted = false;
  twoDiceBonusReasons = [];
  activeGotiForPopup = null;
  activeMeshForPopup = null;
  document.getElementById('two-dice-group')?.classList.add('hidden');

  isRolling = false;
  isPawnRunning = false;
  isAwaitingPawnMove = false;

  setDiceCount(count, false);
  document.getElementById('dice-pill').textContent = (count === 2) ? '1+1' : '1';

  // If Host triggered restart in online team/room, broadcast to all clients
  if (!isRemoteSync && isHostInLocalTeam() && (gameMode === 'online' || currentRoomCode)) {
    const newGameMsg = { type: 'host_new_game', diceCount: count };
    if (webRtc) webRtc.broadcast(newGameMsg);
    if (socket && socket.connected) socket.emit('host_new_game', newGameMsg);
  }

  // Close modals if open
  document.getElementById('victory-modal')?.classList.remove('open');
  document.getElementById('multiplayer-modal')?.classList.remove('open');

  updatePlayerHUD();
  updateModeLockUI();
  startTurnCycle();
  updateStatusBanner(`New Game Started • Mode: ${count === 2 ? '2: 2 Dice (Speed)' : '1: 1 Die (Classic)'} • Red's Turn`);
  return true;
}

function exitGameAction() {
  if (isClientInLocalTeam()) {
    updateStatusBanner("👑 Only the Room Host can exit or end the match!");
    flashModeLockedWarning();
    return false;
  }

  if (gameMode === 'online' || currentRoomCode) {
    const ok = confirm("Exit Match? This will end the match for all connected players.");
    if (!ok) return false;

    const exitMsg = { type: 'host_exit_game' };
    if (webRtc) webRtc.broadcast(exitMsg);
    if (socket && socket.connected) socket.emit('host_exit_game', exitMsg);

    performFullGameExit("You ended and exited the match.");
  } else {
    performFullGameExit("Match exited. New game ready.");
  }
  return true;
}

function performFullGameExit(reason) {
  clearActiveMatchSession();
  stopTurnTimer();
  if (typeof stopAutoRunTicker === 'function') stopAutoRunTicker();

  if (webRtc) {
    try { webRtc.closeAll(); } catch (e) {}
  }
  currentRoomCode = null;
  gameMode = (typeof selectedOfflineSubMode === 'string') ? selectedOfflineSubMode : 'bots';
  currentLobbyPlayers = [];
  myOnlinePlayerIndex = 0;

  const offlineCnt = selectedOfflinePlayerCount || 2;
  engine.activePlayerCount = offlineCnt;
  for (let i = 0; i < 4; i++) {
    if (i === 0) {
      engine.players[0].isBot = false;
      engine.players[0].name = 'Red';
    } else if (isPlayerActiveInGame(i, offlineCnt)) {
      engine.players[i].isBot = (gameMode === 'bots');
      const baseName = engine.players[i].color === '#b58900' ? 'Yellow' : engine.players[i].color === '#0c4bbd' ? 'Blue' : 'Charcoal';
      engine.players[i].name = (gameMode === 'bots') ? `${baseName} (AI)` : baseName;
    } else {
      engine.players[i].isBot = true;
    }
  }

  engine.resetGame();

  pawns.forEach((mesh) => {
    const pIdx = mesh.userData.playerId;
    const pNum = mesh.userData.pawnId;
    const quad = BOARD_CONFIG.QUADS[pIdx];
    const off = [
      [-1.20, -1.20], [1.20, -1.20],
      [-1.20,  1.20], [1.20,  1.20]
    ][pNum];

    mesh.position.set(quad.cx + off[0], BOARD_CONFIG.SOCKET_Y, quad.cz + off[1]);
    mesh.userData.currentPos = {
      x: quad.cx + off[0],
      y: BOARD_CONFIG.SOCKET_Y,
      z: quad.cz + off[1]
    };
    mesh.userData.isSelectable = false;
    mesh.userData.isHopping = false;
    mesh.visible = true;

    const crown = mesh.userData.accessoryGroup?.getObjectByName('winnerCrown');
    if (crown) crown.visible = false;
  });

  hideGotiDicePopup();
  hideTwoDiceUI();
  clearSelectablePawns();
  isRolling = false;
  isPawnRunning = false;
  isAwaitingPawnMove = false;
  isTurnTransitioning = false;

  document.getElementById('victory-modal')?.classList.remove('open');
  document.getElementById('multiplayer-modal')?.classList.remove('open');
  document.getElementById('hack-menu-modal')?.classList.remove('open');

  document.getElementById('webrtc-lobby-card')?.classList.add('hidden');
  document.getElementById('webrtc-setup-form')?.classList.remove('hidden');
  document.getElementById('webrtc-status-msg')?.classList.add('hidden');
  document.getElementById('room-status-box')?.classList.add('hidden');

  updatePlayerHUD();
  updateModeLockUI();
  startTurnCycle();
  updateStatusBanner(reason || "Match ended. Returned to main menu.");
}

// ---------------------------------------------------------------------
// ACTIVE MATCH PERSISTENCE & AUTOMATIC STARTUP RE-JOIN SYSTEM
// ---------------------------------------------------------------------

function saveActiveMatchSession() {
  if (gameMode !== 'online' || !currentRoomCode) return;
  const isHost = (webRtc ? webRtc.isHost : myOnlinePlayerIndex === 0);
  const myName = (
    document.getElementById('input-webrtc-player-name')?.value ||
    document.getElementById('input-lan-player-name')?.value ||
    webRtc?.playerName ||
    'Player'
  ).trim();

  const session = {
    roomCode: currentRoomCode,
    playerName: myName,
    playerIndex: myOnlinePlayerIndex,
    isHost: isHost,
    active: true,
    savedAt: Date.now()
  };
  try {
    localStorage.setItem('msludo_active_session', JSON.stringify(session));
  } catch (e) {}
}

function clearActiveMatchSession() {
  try {
    localStorage.removeItem('msludo_active_session');
  } catch (e) {}
}

// ---------------------------------------------------------------------
// OFFLINE & PLAY WITH AI GAME SAVE STATE SYSTEM
// ---------------------------------------------------------------------

function isPlayerActiveInGame(playerId, activeCount) {
  const count = activeCount || engine.activePlayerCount || 4;
  if (count === 2) return (playerId === 0 || playerId === 1);
  if (count === 3) return (playerId === 0 || playerId === 3 || playerId === 1);
  return true;
}

function saveOfflineGameState() {
  if (gameMode === 'online') return;

  if (engine.isGameOver) return;
  const anyPawnMoved = engine.players.some((pl) =>
    pl.pawns.some((pw) => pw.stepOnTrack > -1 || pw.isFinished)
  );
  if (!anyPawnMoved && !engine.isGameplayActive) return;

  const state = {
    gameMode: gameMode,
    diceCount: engine.diceCount,
    currentTurnPlayerId: engine.currentTurnPlayerId,
    activePlayerCount: engine.activePlayerCount,
    consecutiveSixes: engine.consecutiveSixes || 0,
    consecutiveDoubles: engine.consecutiveDoubles || 0,
    twoDicePool: twoDicePool,
    savedAt: Date.now(),
    players: engine.players.map((pl) => ({
      id: pl.id,
      name: pl.name,
      color: pl.color,
      isBot: pl.isBot,
      hasFinished: pl.hasFinished,
      pawns: pl.pawns.map((pw) => ({
        id: pw.id,
        playerId: pw.playerId,
        stepOnTrack: pw.stepOnTrack,
        isFinished: pw.isFinished
      }))
    }))
  };

  try {
    localStorage.setItem('msludo_offline_save', JSON.stringify(state));
  } catch (e) {}
}

function clearOfflineGameState() {
  try {
    localStorage.removeItem('msludo_offline_save');
  } catch (e) {}
}

function loadOfflineGameState() {
  if (gameMode === 'online') return false;

  let saved = null;
  try {
    const raw = localStorage.getItem('msludo_offline_save');
    if (raw) saved = JSON.parse(raw);
  } catch (e) {}

  if (!saved || !saved.players || !Array.isArray(saved.players)) return false;

  // Expire offline saves older than 7 days
  if (Date.now() - (saved.savedAt || 0) > 7 * 24 * 60 * 60 * 1000) {
    clearOfflineGameState();
    return false;
  }

  console.log('🔄 Restoring saved offline / AI game state:', saved);

  gameMode = saved.gameMode || 'bots';
  if (typeof saved.diceCount === 'number') {
    setDiceCount(saved.diceCount, false);
  }

  const activeCount = Math.max(2, Math.min(4, saved.activePlayerCount || 4));
  engine.activePlayerCount = activeCount;

  // Restore players & bot flags
  saved.players.forEach((sp, idx) => {
    if (engine.players[idx]) {
      engine.players[idx].name = sp.name;
      engine.players[idx].isBot = sp.isBot;
      engine.players[idx].hasFinished = !!sp.hasFinished;
    }
  });

  // Restore all 16 pawns and calculate exact 3D world positions
  saved.players.forEach((sp) => {
    sp.pawns?.forEach((pw) => {
      const pl = engine.players[pw.playerId];
      const pawn = pl?.pawns?.[pw.id];
      if (pawn) {
        pawn.stepOnTrack = pw.stepOnTrack;
        pawn.isFinished = pw.isFinished || (pw.stepOnTrack === 56);
      }

      const mesh = pawns.find(
        (m) => m.userData.playerId === pw.playerId && m.userData.pawnId === pw.id
      );
      if (mesh) {
        const pos = getPawnWorldPosition(pw.playerId, pw.id, pw.stepOnTrack);
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.userData.currentPos = { ...pos };
        mesh.userData.isSelectable = false;
        mesh.userData.isHopping = false;
        mesh.visible = isPlayerActiveInGame(pw.playerId, activeCount);
      }
    });
  });

  // Restore turn & dice pool
  engine.currentTurnPlayerId = saved.currentTurnPlayerId || 0;
  engine.consecutiveSixes = saved.consecutiveSixes || 0;
  engine.consecutiveDoubles = saved.consecutiveDoubles || 0;

  if (Array.isArray(saved.twoDicePool) && saved.twoDicePool.length > 0) {
    twoDicePool = saved.twoDicePool;
    updateTwoDiceUI();
  } else {
    hideTwoDiceUI();
  }

  hideGotiDicePopup();
  clearSelectablePawns();
  isRolling = false;
  isPawnRunning = false;
  isAwaitingPawnMove = false;
  isTurnTransitioning = false;

  updatePlayerHUD();
  updateModeLockUI();

  const currentTurnPlayer = engine.players[engine.currentTurnPlayerId];
  updateStatusBanner(`🔄 Resumed saved match! Turn: ${currentTurnPlayer?.name || 'Red'}`);

  startTurnCycle();
  return true;
}

function checkForPendingActiveMatchRejoin() {
  let saved = null;
  try {
    const raw = localStorage.getItem('msludo_active_session');
    if (raw) saved = JSON.parse(raw);
  } catch (e) {}

  if (!saved || !saved.roomCode || !saved.active) return false;

  // Expire sessions older than 2 hours
  if (Date.now() - (saved.savedAt || 0) > 2 * 60 * 60 * 1000) {
    clearActiveMatchSession();
    return false;
  }

  console.log('🔄 Found pending ongoing match session:', saved);
  updateStatusBanner(`🔄 Found active match in Room ${saved.roomCode}! Automatically re-joining...`);

  const nameInput = document.getElementById('input-webrtc-player-name');
  if (nameInput && saved.playerName) nameInput.value = saved.playerName;
  const codeInput = document.getElementById('input-webrtc-room-code');
  if (codeInput) codeInput.value = saved.roomCode;

  setTimeout(() => {
    attemptAutoRejoin(saved);
  }, 750);
  return true;
}

function attemptAutoRejoin(savedSession) {
  currentRoomCode = savedSession.roomCode;
  myOnlinePlayerIndex = savedSession.playerIndex;

  if (!socket || !socket.connected) {
    connectSignalingSocket();
  }

  if (webRtc) {
    webRtc.joinRoom(savedSession.roomCode, savedSession.playerName, {
      onSuccess: (code) => {
        console.log(`🟢 Connected to Room ${code}, requesting live game state...`);
        updateStatusBanner(`🟢 Connected to Room ${code}! Syncing live match...`);
        setTimeout(() => {
          sendRequestGameSync(savedSession);
        }, 600);
      },
      onError: (err) => {
        console.warn('Auto-rejoin room failed:', err);
        clearActiveMatchSession();
        updateStatusBanner(`Previous match in Room ${savedSession.roomCode} has ended.`);
      }
    }, savedSession.playerIndex);
  }
}

function sendRequestGameSync(savedSession) {
  const req = {
    type: 'request_game_sync',
    peerId: webRtc?.myPeerId,
    playerIndex: savedSession.playerIndex,
    playerName: savedSession.playerName
  };
  if (webRtc) webRtc.broadcast(req);
  if (socket && socket.connected) socket.emit('request_game_sync', req);

  // Safety watchdog: If match is dead and no snapshot arrives within 8s, revert cleanly
  setTimeout(() => {
    if (gameMode !== 'online') {
      console.log('Sync timeout: previous match no longer active.');
      clearActiveMatchSession();
      updateStatusBanner('Previous match has ended. Ready for new game.');
    }
  }, 8000);
}

function sendGameSyncSnapshot(targetInfo) {
  const snapshot = {
    type: 'game_sync_snapshot',
    targetPeerId: targetInfo?.peerId,
    targetPlayerIndex: targetInfo?.playerIndex,
    roomCode: currentRoomCode,
    diceCount: engine.diceCount,
    currentTurn: engine.currentTurnPlayerId,
    activePlayerCount: engine.activePlayerCount,
    consecutiveSixes: engine.consecutiveSixes || 0,
    twoDicePool: twoDicePool,
    players: currentLobbyPlayers,
    pawnsState: engine.players.map((pl) => pl.pawns.map((pw) => ({
      playerId: pw.playerId,
      pawnId: pw.id,
      stepOnTrack: pw.stepOnTrack,
      isFinished: pw.isFinished,
      inYard: (pw.stepOnTrack === -1)
    })))
  };
  if (webRtc) webRtc.broadcast(snapshot);
  if (socket && socket.connected) socket.emit('game_sync_snapshot', snapshot);
}

function applyGameSyncSnapshot(snapshot) {
  if (!snapshot || !snapshot.pawnsState) return;
  if (snapshot.targetPeerId && webRtc?.myPeerId && snapshot.targetPeerId !== webRtc.myPeerId) {
    return; // Snapshot intended for a different peer
  }

  console.log('📥 Applying live game snapshot from Host:', snapshot);

  gameMode = 'online';
  currentRoomCode = snapshot.roomCode;
  if (typeof snapshot.diceCount === 'number') {
    setDiceCount(snapshot.diceCount, false);
  }

  const pList = snapshot.players || currentLobbyPlayers;
  currentLobbyPlayers = pList;
  if (typeof myOnlinePlayerIndex !== 'number' || myOnlinePlayerIndex < 0) {
    myOnlinePlayerIndex = resolveOnlinePlayerIndex(pList);
  }
  if (webRtc) webRtc.myPlayerIndex = myOnlinePlayerIndex;

  const activeCount = Math.max(2, Math.min(4, snapshot.activePlayerCount || pList.length || 2));
  engine.activePlayerCount = activeCount;

  // Restore player names and bot statuses
  for (let i = 0; i < 4; i++) {
    if (i < activeCount) {
      engine.players[i].isBot = false;
      if (pList[i]?.name) engine.players[i].name = pList[i].name;
    } else {
      engine.players[i].isBot = true;
    }
  }

  // Restore all 16 pawns and their 3D world positions
  snapshot.pawnsState.forEach((playerPawns) => {
    playerPawns.forEach((pData) => {
      const pl = engine.players[pData.playerId];
      const pawn = pl?.pawns?.[pData.pawnId];
      if (pawn) {
        pawn.stepOnTrack = pData.stepOnTrack;
        pawn.isFinished = pData.isFinished || (pData.stepOnTrack === 56);
      }
      const mesh = pawns.find(
        (m) => m.userData.playerId === pData.playerId && m.userData.pawnId === pData.pawnId
      );
      if (mesh) {
        const pos = getPawnWorldPosition(pData.playerId, pData.pawnId, pData.stepOnTrack);
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.userData.currentPos = { ...pos };
        mesh.userData.isSelectable = false;
        mesh.userData.isHopping = false;
        mesh.visible = isPlayerActiveInGame(pData.playerId, activeCount);
      }
    });
  });

  // Restore current turn & dice pool state
  engine.currentTurnPlayerId = snapshot.currentTurn || 0;
  engine.consecutiveSixes = snapshot.consecutiveSixes || 0;
  if (Array.isArray(snapshot.twoDicePool) && snapshot.twoDicePool.length > 0) {
    twoDicePool = snapshot.twoDicePool;
    updateTwoDiceUI();
  } else {
    hideTwoDiceUI();
  }

  hideGotiDicePopup();
  clearSelectablePawns();
  isRolling = false;
  isPawnRunning = false;
  isAwaitingPawnMove = false;

  // Close modals & open room HUD
  document.getElementById('multiplayer-modal')?.classList.remove('open');
  document.getElementById('webrtc-setup-form')?.classList.add('hidden');
  document.getElementById('webrtc-lobby-card')?.classList.remove('hidden');
  const roomBox = document.getElementById('room-status-box');
  const codeEl = document.getElementById('room-code-display');
  if (roomBox) roomBox.classList.remove('hidden');
  if (codeEl) codeEl.textContent = snapshot.roomCode;

  updatePlayerHUD();
  updateModeLockUI();
  saveActiveMatchSession();

  const currentTurnPlayer = engine.players[engine.currentTurnPlayerId];
  updateStatusBanner(`🟢 Re-joined active match in Room ${snapshot.roomCode}! Current Turn: ${currentTurnPlayer?.name || 'Red'}`);
  if (typeof sounds !== 'undefined' && sounds.playStart) sounds.playStart();

  startTurnCycle();
}

// Exact Euler rotations to bring target face strictly to UP (+Y) with zero tilt
const DIE_ROTATIONS = {
  1: { rx: 0, ry: 0, rz: 0 },
  2: { rx: -Math.PI / 2, ry: 0, rz: 0 },
  3: { rx: 0, ry: -Math.PI / 2, rz: Math.PI / 2 },
  4: { rx: 0, ry: Math.PI / 2, rz: -Math.PI / 2 },
  5: { rx: Math.PI / 2, ry: 0, rz: Math.PI },
  6: { rx: Math.PI, ry: 0, rz: 0 }
};

// Rule 2: In 2-Dice game, check if player has only 1 last goti left and it is in Home Lane
function isPlayerLastGotiInHomeLane(player) {
  if (!player || !player.pawns) return false;
  const activePawns = player.pawns.filter((p) => !p.isFinished);
  if (activePawns.length === 1 && activePawns[0].stepOnTrack >= 51) {
    return true;
  }
  return false;
}

// Rule 1: Accumulated rolls before gotiyan run
let accumulatedTurnRolls = [];

// Rule 5: 20-second turn auto-play timer & Auto-Playing Mode Toggle
let turnTimerInterval = null;
let turnTimerSeconds = 20;
let isAutoPlayEnabled = (localStorage.getItem('mission_ludo_autoplay_enabled') !== '0');

function updateAutoPlayUI() {
  const timerPill = document.getElementById('hud-turn-timer');
  const timerVal = document.getElementById('hud-timer-sec');
  const timerIcon = document.getElementById('hud-timer-icon');

  if (timerPill) {
    if (!isAutoPlayEnabled) {
      timerPill.classList.add('disabled');
      timerPill.classList.remove('urgent');
      timerPill.title = 'Auto-Playing Mode: OFF (Click to Turn ON)';
    } else {
      timerPill.classList.remove('disabled');
      timerPill.title = 'Auto-Playing Mode: ON (Click to Turn OFF)';
    }
  }

  if (timerVal) {
    if (!isAutoPlayEnabled) {
      timerVal.textContent = 'OFF';
    } else if (!turnTimerInterval) {
      timerVal.textContent = '20s';
    } else {
      timerVal.textContent = `${turnTimerSeconds}s`;
    }
  }

  if (timerIcon) {
    if (!isAutoPlayEnabled) {
      timerIcon.className = 'fa-solid fa-pause text-[11px] text-slate-400';
    } else {
      timerIcon.className = 'fa-solid fa-stopwatch text-[11px] text-amber-400';
    }
  }

  // Settings Modal Toggle Button
  const btnSettings = document.getElementById('btn-toggle-autoplay-settings');
  const iconSettings = document.getElementById('autoplay-icon-status');
  const labelSettings = document.getElementById('autoplay-label-status');
  if (btnSettings) {
    if (isAutoPlayEnabled) {
      btnSettings.className = 'btn-action px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center gap-2 transition hover:bg-emerald-500/30';
      if (iconSettings) iconSettings.className = 'fa-solid fa-robot text-emerald-400';
      if (labelSettings) labelSettings.textContent = 'Auto-Play ON';
    } else {
      btnSettings.className = 'btn-action px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 border border-white/10 text-xs font-semibold flex items-center gap-2 transition hover:bg-slate-700 hover:text-white';
      if (iconSettings) iconSettings.className = 'fa-solid fa-pause text-slate-400';
      if (labelSettings) labelSettings.textContent = 'Auto-Play OFF';
    }
  }

  // Developer Precision Studio Modal Toggle Button
  const btnDev = document.getElementById('btn-toggle-autoplay-dev');
  const iconDev = document.getElementById('dev-autoplay-icon');
  const labelDev = document.getElementById('dev-autoplay-status-label');
  if (btnDev) {
    if (isAutoPlayEnabled) {
      btnDev.className = 'btn-action px-3 py-1 rounded-lg text-[10.5px] font-bold border transition flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      if (iconDev) iconDev.className = 'fa-solid fa-robot text-xs text-emerald-400';
      if (labelDev) labelDev.textContent = 'ENABLED';
    } else {
      btnDev.className = 'btn-action px-3 py-1 rounded-lg text-[10.5px] font-bold border transition flex items-center gap-1.5 bg-slate-800 text-slate-400 border-white/10';
      if (iconDev) iconDev.className = 'fa-solid fa-pause text-xs text-slate-400';
      if (labelDev) labelDev.textContent = 'DISABLED';
    }
  }
}

function toggleAutoPlayMode(forceState = null) {
  isAutoPlayEnabled = (forceState !== null) ? !!forceState : !isAutoPlayEnabled;
  localStorage.setItem('mission_ludo_autoplay_enabled', isAutoPlayEnabled ? '1' : '0');
  updateAutoPlayUI();

  if (!isAutoPlayEnabled) {
    stopTurnTimer();
    updateStatusBanner('⏸️ Auto-Playing Mode disabled. Turn timer paused.');
  } else {
    updateStatusBanner('▶️ Auto-Playing Mode enabled (20s turn countdown active).');
    if (!engine.isGameOver && !isRolling && !isPawnRunning) {
      startTurnTimer(20);
    }
  }
}

function initAutoPlayControls() {
  document.getElementById('hud-turn-timer')?.addEventListener('click', () => {
    toggleAutoPlayMode();
  });
  document.getElementById('btn-toggle-autoplay-settings')?.addEventListener('click', () => {
    toggleAutoPlayMode();
  });
  document.getElementById('btn-toggle-autoplay-dev')?.addEventListener('click', () => {
    toggleAutoPlayMode();
  });
  updateAutoPlayUI();
}

function stopTurnTimer() {
  if (turnTimerInterval) {
    clearInterval(turnTimerInterval);
    turnTimerInterval = null;
  }
  const timerPill = document.getElementById('hud-turn-timer');
  const timerVal = document.getElementById('hud-timer-sec');
  if (timerPill) {
    timerPill.classList.remove('urgent');
    if (!isAutoPlayEnabled) {
      timerPill.classList.add('disabled');
    } else {
      timerPill.classList.remove('disabled');
    }
  }
  if (timerVal) {
    timerVal.textContent = isAutoPlayEnabled ? '20s' : 'OFF';
  }
}

function startTurnTimer(initialSeconds = 20) {
  stopTurnTimer();
  if (engine.isGameOver) return;

  if (!isAutoPlayEnabled) {
    const timerPill = document.getElementById('hud-turn-timer');
    const timerVal = document.getElementById('hud-timer-sec');
    if (timerPill) {
      timerPill.classList.add('disabled');
      timerPill.classList.remove('urgent');
    }
    if (timerVal) timerVal.textContent = 'OFF';
    return;
  }

  turnTimerSeconds = initialSeconds;
  const timerPill = document.getElementById('hud-turn-timer');
  const timerVal = document.getElementById('hud-timer-sec');
  if (timerPill) {
    timerPill.classList.remove('disabled');
  }
  if (timerVal) timerVal.textContent = `${turnTimerSeconds}s`;

  turnTimerInterval = setInterval(() => {
    if (!isAutoPlayEnabled) {
      stopTurnTimer();
      return;
    }
    turnTimerSeconds--;
    if (timerVal) timerVal.textContent = `${turnTimerSeconds}s`;

    if (turnTimerSeconds <= 5 && timerPill) {
      timerPill.classList.add('urgent');
    }

    if (turnTimerSeconds <= 0) {
      stopTurnTimer();
      handleTurnTimeout();
    }
  }, 1000);
}

function handleTurnTimeout() {
  if (!isAutoPlayEnabled) return;
  if (engine.isGameOver || isPawnRunning) return;
  const current = engine.currentPlayer;
  const isMyTurn = (gameMode !== 'online') || isMyTurnInOnlineGame(current);

  // If waiting to roll dice:
  if (!isRolling && !isAwaitingPawnMove) {
    if (isMyTurn) {
      updateStatusBanner(`⏰ 20s Expired! Auto-rolling for ${current.name}...`);
      rollDiceAction();
    } else {
      setTimeout(() => {
        if (!isRolling && !isAwaitingPawnMove && engine.currentPlayer.id === current.id) {
          updateStatusBanner(`⏰ Opponent timed out! Auto-rolling for ${current.name}...`);
          if (webRtc && webRtc.isHost) {
            rollDiceAction();
          }
        }
      }, 2500);
    }
    return;
  }

  // If waiting for pawn movement:
  if (isAwaitingPawnMove && !isPawnRunning) {
    if (isMyTurn) {
      updateStatusBanner(`⏰ 20s Expired! Auto-moving best goti for ${current.name}...`);
      autoMoveBestPawn();
    }
  }
}

function autoMoveBestPawn() {
  if (engine.isGameOver || isPawnRunning) return;
  const current = engine.currentPlayer;

  if (twoDicePool && twoDicePool.length > 0) {
    const unused = twoDicePool.find((d) => !d.used);
    if (unused) {
      activeDieIndex = unused.index;
      const roll = { total: unused.value, isSingleDie: true, hasSix: unused.value === 6 };
      const valid = engine.getMovablePawns(current, roll);
      if (valid.length > 0) {
        const chosen = aiBot.chooseBestPawn(valid, roll, engine.players);
        executeTwoDiceStep(chosen);
        return;
      } else {
        unused.used = true;
        updateTwoDiceUI();
        const nextUnused = twoDicePool.find((d) => !d.used);
        if (nextUnused) {
          autoMoveBestPawn();
          return;
        }
      }
    }
    finishTwoDiceTurn();
    return;
  }

  // Single roll:
  const valid = engine.getMovablePawns(current, engine.lastRoll || { total: engine.currentDiceValue, isSingleDie: true, hasSix: engine.currentDiceValue === 6 });
  if (valid.length > 0) {
    const chosen = aiBot.chooseBestPawn(valid, engine.lastRoll, engine.players);
    executePawnMove(chosen, engine.lastRoll);
  } else {
    engine.advanceTurn();
    startTurnCycle();
  }
}

function rollDiceAction(isAutoBotCall = false) {
  if (isTurnTransitioning || isRolling || isPawnRunning || isAwaitingPawnMove || engine.isGameOver) {
    if (isAwaitingPawnMove) {
      updateStatusBanner("Select a pawn to make your move first!");
    } else if (isPawnRunning) {
      updateStatusBanner("Pawn is walking... please wait.");
    }
    return;
  }

  // Guard against human triggering rolls during bot's turn in local/offline modes
  if (engine.currentPlayer?.isBot && !isAutoBotCall && gameMode !== 'online') {
    return;
  }

  // In online multiplayer: only current player can roll
  if (gameMode === 'online' && !isMyTurnInOnlineGame(engine.currentPlayer)) {
    updateStatusBanner("Wait for your turn!");
    return;
  }

  // Check if roll button is explicitly disabled (e.g. not user's turn to roll)
  const btnRollEl = document.getElementById('btn-roll');
  if (btnRollEl && btnRollEl.disabled && !isAutoBotCall) {
    return;
  }

  stopTurnTimer();
  isRolling = true;
  setRollButtonEnabled(false);
  const btnRoll = document.getElementById('btn-roll');
  if (btnRoll) {
    btnRoll.classList.remove('bonus-roll-active');
  }
  updateModeLockUI();
  sounds.playDiceRoll();

  // Rule 2: In 2-Dice game, if only 1 last goti in home lane, force 1 die
  const isLastGotiHome = (engine.diceCount === 2) && isPlayerLastGotiInHomeLane(engine.currentPlayer);
  const effectiveDiceCount = isLastGotiHome ? 1 : engine.diceCount;

  // Developer Hack / Custom Dice Override OR Stealth Sync from Match Controller
  let forcedD1 = null;
  let forcedD2 = null;
  if (typeof isHackApplicableToCurrentPlayer === 'function' && isHackApplicableToCurrentPlayer()) {
    if (effectiveDiceCount === 1) {
      // 1-Die Game: Sequence of rolls (Roll 1 -> Bonus Roll 1 -> Bonus Roll 2)
      const rollStep = accumulatedTurnRolls.length;
      if (rollStep === 0) {
        if (diceHackState.die1 !== null) forcedD1 = diceHackState.die1;
      } else if (rollStep === 1) {
        if (diceHackState.die2 !== null) forcedD1 = diceHackState.die2;
        else if (diceHackState.mode === 'always' && diceHackState.die1 !== null) forcedD1 = diceHackState.die1;
      } else if (rollStep >= 2) {
        if (diceHackState.die3 !== null) forcedD1 = diceHackState.die3;
        else if (diceHackState.mode === 'always' && diceHackState.die1 !== null) forcedD1 = diceHackState.die1;
      }
    } else {
      // 2-Dice Game: Both dice rolled simultaneously
      if (diceHackState.die1 !== null) forcedD1 = diceHackState.die1;
      if (diceHackState.die2 !== null) forcedD2 = diceHackState.die2;
    }
  } else if (activeRemotePresetRoll) {
    if (effectiveDiceCount === 1) {
      const rollStep = accumulatedTurnRolls.length;
      if (rollStep === 0 && activeRemotePresetRoll.d1 !== null) forcedD1 = activeRemotePresetRoll.d1;
      else if (rollStep === 1 && activeRemotePresetRoll.d2 !== null) forcedD1 = activeRemotePresetRoll.d2;
      else if (rollStep >= 2 && activeRemotePresetRoll.d3 !== null) forcedD1 = activeRemotePresetRoll.d3;
    } else {
      if (activeRemotePresetRoll.d1 !== null) forcedD1 = activeRemotePresetRoll.d1;
      if (activeRemotePresetRoll.d2 !== null) forcedD2 = activeRemotePresetRoll.d2;
    }
    if (activeRemotePresetRoll.mode === 'single') {
      activeRemotePresetRoll = null;
    }
  }

  const rollResult = engine.rollDice(effectiveDiceCount, forcedD1, forcedD2);
  const v1 = rollResult.d1;
  const v2 = (effectiveDiceCount === 2) ? rollResult.d2 : 0;

  if (gameMode === 'online') {
    const actionId = `roll_${myOnlinePlayerIndex}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    if (webRtc) {
      webRtc.broadcast({ type: 'roll', playerId: myOnlinePlayerIndex, v1, v2, rollResult, actionId });
    } else if (socket) {
      socket.emit('roll_dice', { val1: v1, val2: v2, rollResult, actionId });
    }
  }

  animatePremiumDiceTumble(v1, v2, () => {
    handleRollOutcome(rollResult);
  });
}

// Master 100% Real-Life Rigid-Body Dice Physics Simulation
function animatePremiumDiceTumble(v1, v2, onComplete) {
  const d1 = dice[0];
  const d2 = dice[1];
  const sh1 = diceShadows[0];
  const sh2 = diceShadows[1];
  if (sh1) sh1.visible = false;
  if (sh2) sh2.visible = false;
  const isTwoDice = (engine.diceCount === 2) && (v2 > 0);

  if (d2 && !isTwoDice) {
    d2.visible = false;
    if (sh2) sh2.visible = false;
  } else if (d2 && isTwoDice) {
    d2.visible = true;
    if (sh2) sh2.visible = false;
  }

  // Table surface baseline
  const tableY = 0.525;
  const shadowY = 0.015;

  // Target resting orientations: 100% flat and level on the board (+Y face up)
  const rot1 = DIE_ROTATIONS[v1] || DIE_ROTATIONS[1];
  const rot2 = DIE_ROTATIONS[v2] || DIE_ROTATIONS[1];
  const qTarget1 = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rot1.rx, rot1.ry || 0, rot1.rz || 0, 'XYZ')
  );
  const qTarget2 = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rot2.rx, rot2.ry || 0, rot2.rz || 0, 'XYZ')
  );

  // Target resting positions (dynamically preserving current tabletop resting spot)
  const targetX1 = (d1 && Number.isFinite(d1.position.x)) ? d1.position.x : 8.8;
  const targetZ1 = (d1 && Number.isFinite(d1.position.z)) ? d1.position.z : 2.0;
  const targetPos1 = { x: targetX1, y: tableY, z: targetZ1 };

  const targetX2 = (d2 && Number.isFinite(d2.position.x)) ? d2.position.x : (targetX1 + 1.4);
  const targetZ2 = (d2 && Number.isFinite(d2.position.z)) ? d2.position.z : (targetZ1 + 1.8);
  const targetPos2 = { x: targetX2, y: tableY, z: targetZ2 };

  // Individual physics body states with organic asymmetry
  const bodies = [
    {
      mesh: d1,
      shadow: sh1,
      qTarget: qTarget1,
      targetPos: targetPos1,
      // Toss impulse launch offset (natural localized upward hand-throw with slight lateral arc)
      startPos: { x: targetPos1.x - 0.9, y: tableY, z: targetPos1.z - 0.6 },
      // Ballistic arc durations (ms)
      t1: 450, // Impact 1
      t2: 770, // Impact 2 (duration 320ms)
      t3: 950, // Impact 3 (duration 180ms)
      tEnd: 1120, // Final rest
      // Apex heights for each bounce
      h1: 3.2,
      h2: 0.88,
      h3: 0.22,
      // Spin rates (rad/frame)
      spinX: (Math.random() * 0.38 + 0.32) * (Math.random() > 0.5 ? 1 : -1),
      spinY: (Math.random() * 0.38 + 0.32) * (Math.random() > 0.5 ? 1 : -1),
      spinZ: (Math.random() * 0.38 + 0.32) * (Math.random() > 0.5 ? 1 : -1),
      wobbleAxis: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
      impactSoundPlayed: [false, false, false],
      qImpact1: null,
      qImpact2: null
    }
  ];

  if (isTwoDice && d2) {
    bodies.push({
      mesh: d2,
      shadow: sh2,
      qTarget: qTarget2,
      targetPos: targetPos2,
      startPos: { x: targetPos2.x - 0.8, y: tableY, z: targetPos2.z - 0.5 },
      t1: 490,
      t2: 810,
      t3: 980,
      tEnd: 1150,
      h1: 2.95,
      h2: 0.80,
      h3: 0.20,
      spinX: (Math.random() * 0.38 + 0.32) * (Math.random() > 0.5 ? 1 : -1),
      spinY: (Math.random() * 0.38 + 0.32) * (Math.random() > 0.5 ? 1 : -1),
      spinZ: (Math.random() * 0.38 + 0.32) * (Math.random() > 0.5 ? 1 : -1),
      wobbleAxis: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
      impactSoundPlayed: [false, false, false],
      qImpact1: null,
      qImpact2: null
    });
  }

  const startTime = performance.now();
  const maxDuration = Math.max(...bodies.map((b) => b.tEnd));

  const _tempQuat = new THREE.Quaternion();
  const _wobbleQuat = new THREE.Quaternion();

  function physicsLoop(now) {
    const elapsed = now - startTime;

    bodies.forEach((b) => {
      const mesh = b.mesh;
      const shadow = b.shadow;
      if (!mesh) return;

      let curY = tableY;
      let curX = b.targetPos.x;
      let curZ = b.targetPos.z;

      if (elapsed < b.t1) {
        // --- PHASE 1: HIGH BALLISTIC TOSS (0 -> t1) ---
        const u = Math.max(0, Math.min(elapsed / b.t1, 1.0));
        const arc = 4 * b.h1 * u * (1 - u);
        curY = tableY + arc;

        const horizEase = Math.sin((u * Math.PI) / 2);
        curX = b.startPos.x + (b.targetPos.x - b.startPos.x) * horizEase * 0.75;
        curZ = b.startPos.z + (b.targetPos.z - b.startPos.z) * horizEase * 0.75;

        mesh.rotation.x += b.spinX;
        mesh.rotation.y += b.spinY;
        mesh.rotation.z += b.spinZ;

      } else if (elapsed < b.t2) {
        // --- PHASE 2: PRIMARY REBOUND BOUNCE (t1 -> t2) ---
        if (!b.impactSoundPlayed[0]) {
          b.impactSoundPlayed[0] = true;
          sounds.playDiceBounce(1.15);
          b.qImpact1 = mesh.quaternion.clone();
        }

        const dur = b.t2 - b.t1;
        const u = Math.max(0, Math.min((elapsed - b.t1) / dur, 1.0));
        const arc = 4 * b.h2 * u * (1 - u);
        curY = tableY + arc;

        const horizProgress = 0.75 + 0.20 * Math.sin((u * Math.PI) / 2);
        curX = b.startPos.x + (b.targetPos.x - b.startPos.x) * horizProgress;
        curZ = b.startPos.z + (b.targetPos.z - b.startPos.z) * horizProgress;

        const slerpEase = Math.sin((u * Math.PI) / 2) * 0.84;
        if (b.qImpact1 && b.qTarget) {
          mesh.quaternion.slerpQuaternions(b.qImpact1, b.qTarget, slerpEase);
        }

      } else if (elapsed < b.t3) {
        // --- PHASE 3: SECONDARY CHATTER BOUNCE (t2 -> t3) ---
        if (!b.impactSoundPlayed[1]) {
          b.impactSoundPlayed[1] = true;
          sounds.playDiceBounce(0.55);
          b.qImpact2 = mesh.quaternion.clone();
        }

        const dur = b.t3 - b.t2;
        const u = Math.max(0, Math.min((elapsed - b.t2) / dur, 1.0));
        const arc = 4 * b.h3 * u * (1 - u);
        curY = tableY + arc;

        const horizProgress = 0.95 + 0.04 * u;
        curX = b.startPos.x + (b.targetPos.x - b.startPos.x) * horizProgress;
        curZ = b.startPos.z + (b.targetPos.z - b.startPos.z) * horizProgress;

        const slerpEase = 0.84 + (1.0 - 0.84) * (1 - Math.pow(1 - u, 2));
        if (b.qImpact2 && b.qTarget) {
          mesh.quaternion.slerpQuaternions(b.qImpact2, b.qTarget, slerpEase);
        }

      } else if (elapsed < b.tEnd) {
        // --- PHASE 4: TABLETOP SETTLE & DAMPED EDGE ROCKING (t3 -> tEnd) ---
        if (!b.impactSoundPlayed[2]) {
          b.impactSoundPlayed[2] = true;
          sounds.playDiceBounce(0.25);
        }

        curY = tableY;
        curX = b.targetPos.x;
        curZ = b.targetPos.z;

        const settleT = (elapsed - b.t3) / 1000;
        const wobbleAngle = 0.18 * Math.exp(-15 * settleT) * Math.cos(45 * settleT);

        _wobbleQuat.setFromAxisAngle(b.wobbleAxis, wobbleAngle);
        _tempQuat.copy(b.qTarget).multiply(_wobbleQuat);
        mesh.quaternion.copy(_tempQuat);

      } else {
        // --- REST STATE: 100% LEVEL, FLAT, ZERO TILT ---
        curY = tableY;
        curX = b.targetPos.x;
        curZ = b.targetPos.z;
        mesh.quaternion.copy(b.qTarget);
      }

      mesh.position.set(curX, curY, curZ);

      // Contact Shadow: dynamic scaling, opacity & ground position (disabled for superdooper smoothness)
      if (shadow) {
        shadow.visible = false;
      }
    });

    if (elapsed < maxDuration) {
      requestAnimationFrame(physicsLoop);
    } else {
      bodies.forEach((b) => {
        if (b.mesh) {
          b.mesh.position.set(b.targetPos.x, tableY, b.targetPos.z);
          b.mesh.quaternion.copy(b.qTarget);
        }
        if (b.shadow) {
          b.shadow.visible = false;
        }
      });

      if (isTwoDice) {
        document.getElementById('dice-pill').textContent = `${v1}+${v2}=${v1 + v2}`;
      } else {
        document.getElementById('dice-pill').textContent = `${v1}`;
      }

      isRolling = false;
      if (onComplete) onComplete();
    }
  }

  requestAnimationFrame(physicsLoop);
}

// State tracking for interactive 2-dice assignment
let twoDicePool = []; // [{ index: 0, value: number, used: boolean }, { index: 1, value: number, used: boolean }]
let activeDieIndex = null; // 0 or 1
let twoDiceBonusGranted = false;
let twoDiceBonusReasons = [];
let activeGotiForPopup = null;
let activeMeshForPopup = null;
const _scratchScreenVec = new THREE.Vector3();

function getScreenPositionFromObject(object3D) {
  if (!object3D || !camera) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  object3D.getWorldPosition(_scratchScreenVec);
  _scratchScreenVec.y += 1.8;
  _scratchScreenVec.project(camera);

  const halfWidth = window.innerWidth / 2;
  const halfHeight = window.innerHeight / 2;

  const x = (_scratchScreenVec.x * halfWidth) + halfWidth;
  const y = -(_scratchScreenVec.y * halfHeight) + halfHeight;

  return { x, y };
}

function updatePopupScreenPosition() {
  const popup = document.getElementById('goti-dice-popup');
  if (!popup || popup.classList.contains('hidden') || !activeMeshForPopup) return;

  const screenPos = getScreenPositionFromObject(activeMeshForPopup);
  const popupWidth = Math.min(250, window.innerWidth - 24);
  const popupHeight = 110;

  let left = screenPos.x - (popupWidth / 2);
  let top = screenPos.y - popupHeight - 14;

  left = Math.max(10, Math.min(window.innerWidth - popupWidth - 10, left));
  top = Math.max(10, Math.min(window.innerHeight - popupHeight - 85, top));

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

function handlePooledDicePawnClick(pawn, pMesh) {
  if (isPawnRunning || engine.isGameOver) return;
  const curPlayer = engine.currentPlayer;

  // 1. If an active die was already selected from the tray buttons
  if (activeDieIndex !== null && twoDicePool[activeDieIndex] && !twoDicePool[activeDieIndex].used) {
    const selectedDie = twoDicePool[activeDieIndex];
    const roll = { total: selectedDie.value, isSingleDie: true, hasSix: selectedDie.value === 6 };
    if (engine.canPawnMove(pawn, roll)) {
      hideGotiDicePopup();
      executeTwoDiceStep(pawn);
      return;
    }
  }

  // 2. Find all unused dice in the pool that can legally move this pawn
  const usableDice = twoDicePool.filter((d) => {
    if (d.used) return false;
    const roll = { total: d.value, isSingleDie: true, hasSix: d.value === 6 };
    return engine.canPawnMove(pawn, roll);
  });

  if (usableDice.length === 0) {
    const reason = pawn.isInYard ? "requires a 6 to open from yard" : "cannot move with remaining rolls";
    updateStatusBanner(`${curPlayer.name}'s goti #${pawn.id + 1} ${reason}.`);
    return;
  }

  // 3. If only ONE die can legally move this pawn, execute it immediately (smooth auto-selection)
  if (usableDice.length === 1) {
    activeDieIndex = usableDice[0].index;
    hideGotiDicePopup();
    executeTwoDiceStep(pawn);
    return;
  }

  // 4. If all usable dice have the exact same value (e.g. rolled 6+6), picking any gives identical move!
  const allSameValue = usableDice.every((d) => d.value === usableDice[0].value);
  if (allSameValue) {
    activeDieIndex = usableDice[0].index;
    hideGotiDicePopup();
    executeTwoDiceStep(pawn);
    return;
  }

  // 5. Multiple different dice can move this pawn (e.g. choice between 6 and 5) - show selection popup!
  showGotiDicePopup(pawn, pMesh);
}

function showGotiDicePopup(pawn, pMesh) {
  const popup = document.getElementById('goti-dice-popup');
  if (!popup || !twoDicePool || twoDicePool.length === 0) return;

  activeGotiForPopup = pawn;
  activeMeshForPopup = pMesh;

  const curPlayer = engine.currentPlayer;
  const optionsContainer = popup.querySelector('.goti-dice-popup-options');
  if (!optionsContainer) return;

  optionsContainer.innerHTML = '';
  const labelPrefix = engine.diceCount === 1 ? 'Roll' : 'Die';

  twoDicePool.forEach((d) => {
    const roll = { total: d.value, isSingleDie: true, hasSix: d.value === 6 };
    const canMove = !d.used && engine.canPawnMove(pawn, roll);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn-popup-die ${d.used ? 'used' : ''}`;
    btn.disabled = !canMove;
    const noteText = d.used
      ? 'Used'
      : (canMove ? 'Click to run' : (pawn.isInYard ? 'Requires 6' : 'Blocked'));

    btn.innerHTML = `
      <i class="fa-solid fa-dice text-amber-400 text-lg"></i>
      <div class="popup-die-details">
        <span class="popup-die-label">${labelPrefix} ${d.index + 1}</span>
        <span class="popup-die-value"><strong>${d.value}</strong> Steps</span>
        <span class="popup-die-status">${noteText}</span>
      </div>
    `;

    if (canMove) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        chooseDieFromPopup(d.index);
      });
    }

    optionsContainer.appendChild(btn);
  });

  const title = document.getElementById('popup-goti-title');
  if (title) {
    const loc = pawn.isInYard
      ? "In Yard"
      : (pawn.stepOnTrack >= 51 ? "Home Stretch" : `Step ${pawn.stepOnTrack}`);
    title.textContent = `${curPlayer.name} Goti #${pawn.id + 1} (${loc})`;
  }

  isGotiDicePopupOpen = true;
  popup.classList.remove('hidden');
  updatePopupScreenPosition();
}

function hideGotiDicePopup() {
  isGotiDicePopupOpen = false;
  const popup = document.getElementById('goti-dice-popup');
  if (popup) popup.classList.add('hidden');
  activeGotiForPopup = null;
  activeMeshForPopup = null;
}

function chooseDieFromPopup(dieIndex) {
  if (activeGotiForPopup === null || isPawnRunning) return;
  const targetPawn = activeGotiForPopup;
  activeDieIndex = dieIndex;
  hideGotiDicePopup();
  executeTwoDiceStep(targetPawn);
}

function updateTwoDiceUI() {
  const group = document.getElementById('two-dice-group');
  if (!group) return;

  const unusedDice = twoDicePool ? twoDicePool.filter((d) => !d.used) : [];
  if (!twoDicePool || twoDicePool.length < 2 || unusedDice.length === 0) {
    group.classList.add('hidden');
    return;
  }

  group.classList.remove('hidden');
  group.innerHTML = '';

  const labelPrefix = engine.diceCount === 1 ? 'Roll' : 'Die';

  twoDicePool.forEach((d, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn-die-choice ${activeDieIndex === idx && !d.used ? 'active' : ''} ${d.used ? 'used' : ''}`;
    btn.disabled = d.used || isPawnRunning;
    btn.title = `Select ${labelPrefix} ${idx + 1} (${d.value})`;
    btn.innerHTML = `<i class="fa-solid fa-dice text-amber-400"></i><span>${labelPrefix} ${idx + 1}:</span><strong class="die-val-badge">${d.value}</strong>`;
    btn.addEventListener('click', () => selectActiveDie(idx));
    group.appendChild(btn);
  });
}

function hideTwoDiceUI() {
  const group = document.getElementById('two-dice-group');
  if (group) group.classList.add('hidden');
  hideGotiDicePopup();
  twoDicePool = [];
  activeDieIndex = null;
}

function selectActiveDie(dieIdx) {
  if (isPawnRunning) return;
  if (!twoDicePool[dieIdx] || twoDicePool[dieIdx].used) return;

  activeDieIndex = dieIdx;
  const current = engine.currentPlayer;
  const die = twoDicePool[dieIdx];
  const valid = engine.getMovablePawns(current, {
    total: die.value,
    isSingleDie: true,
    hasSix: die.value === 6
  });

  updateTwoDiceUI();

  const labelPrefix = engine.diceCount === 1 ? 'Roll' : 'Die';

  if (valid.length === 0) {
    clearSelectablePawns();
    updateStatusBanner(`${labelPrefix} ${dieIdx + 1} (${die.value}) has no valid move.`);
    return;
  }

  highlightSelectablePawns(valid);
  isAwaitingPawnMove = true;
  updateStatusBanner(
    `${current.name}: Click goti to move ${die.value} steps (${labelPrefix} ${dieIdx + 1})`
  );
}

function executeTwoDiceStep(pawn, onStepDone) {
  if (activeDieIndex === null || !twoDicePool[activeDieIndex]) return;
  if (gameMode === 'online') saveActiveMatchSession();
  else saveOfflineGameState();

  isAwaitingPawnMove = false;
  isPawnRunning = true;
  setRollButtonEnabled(false);
  clearSelectablePawns();
  hideGotiDicePopup();

  const currentDie = twoDicePool[activeDieIndex];
  currentDie.used = true;
  updateTwoDiceUI();

  const singleRoll = {
    total: currentDie.value,
    d1: currentDie.value,
    d2: 0,
    isSingleDie: true,
    hasSix: currentDie.value === 6
  };

  const result = engine.movePawn(pawn, singleRoll);

  if (gameMode === 'online' && isMyTurnInOnlineGame(engine.players[pawn.playerId])) {
    const actionId = `step_${myOnlinePlayerIndex}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const stepMsg = {
      type: 'two_dice_step',
      pawnId: pawn.id,
      playerId: pawn.playerId,
      dieIndex: activeDieIndex,
      dieValue: currentDie.value,
      singleRoll: singleRoll,
      fromStep: result.fromStep,
      toStep: result.toStep,
      actionId
    };
    if (webRtc) {
      webRtc.broadcast(stepMsg);
    } else if (socket) {
      socket.emit('two_dice_step', stepMsg);
    }
  }

  if (result.capturedOpponent) {
    twoDiceBonusGranted = true;
    const oppName = engine.players[result.capturedOpponent.playerId]?.name || 'opponent';
    if (!twoDiceBonusReasons.some(r => r.includes('Knockout'))) {
      twoDiceBonusReasons.push(`💥 Knockout! Captured ${oppName}'s goti`);
    }
  }
  if (result.reachedGoal) {
    twoDiceBonusGranted = true;
    if (!twoDiceBonusReasons.some(r => r.includes('Home'))) {
      twoDiceBonusReasons.push(`🎯 Goti reached Home!`);
    }
  }

  const pawnMesh = pawns.find(
    (m) => m.userData.playerId === pawn.playerId && m.userData.pawnId === pawn.id
  );

  animatePawnWalk(pawnMesh, pawn.playerId, pawn.id, result.fromStep, result.toStep, () => {
    function afterWalk() {
      if (result.capturedOpponent) {
        sounds.playCapture();
        updateStatusBanner(`${engine.currentPlayer.name} knocked out an opponent! 💥`);
        const oppMesh = pawns.find(
          (m) => m.userData.playerId === result.capturedOpponent.playerId && m.userData.pawnId === result.capturedOpponent.pawnId
        );
        const homePos = getPawnWorldPosition(result.capturedOpponent.playerId, result.capturedOpponent.pawnId, -1);
        animatePawnHop(oppMesh, homePos, checkNext);
      } else {
        if (result.isSafeStar) {
          sounds.playSafeStar();
          updateStatusBanner(`${engine.currentPlayer.name} reached a Safe Star! ⭐`);
        } else if (result.reachedGoal) {
          sounds.playVictory();
          updateStatusBanner(`👑 ${engine.currentPlayer.name} reached Sanctuary Goal!`);
        }
        checkNext();
      }
    }

    function checkNext() {
      updateYardRankBadges();
      if (engine.isGameOver) {
        finishTwoDiceTurn();
        return;
      }

      if (onStepDone) {
        onStepDone();
      } else {
        // Human player flow: check if any remaining unused dice exist
        const remainingDice = twoDicePool.filter((d) => !d.used);
        if (remainingDice.length > 0) {
          const curPlayer = engine.currentPlayer;
          // Find if ANY remaining die has a valid move for ANY pawn
          const movableDice = remainingDice.filter((die) => {
            const roll = { total: die.value, isSingleDie: true, hasSix: die.value === 6 };
            return engine.getMovablePawns(curPlayer, roll).length > 0;
          });

          if (movableDice.length > 0) {
            isPawnRunning = false;
            isAwaitingPawnMove = true;
            // If only 1 movable die remains, auto-select it
            if (movableDice.length === 1) {
              activeDieIndex = movableDice[0].index;
            } else {
              activeDieIndex = null;
            }
            updateTwoDiceUI();
            // Highlight all pawns movable by ANY remaining usable die
            const remainValid = curPlayer.pawns.filter((p) => {
              if (p.isFinished) return false;
              return movableDice.some((d) =>
                engine.canPawnMove(p, { total: d.value, isSingleDie: true, hasSix: d.value === 6 })
              );
            });
            highlightSelectablePawns(remainValid);
            const remainingValues = movableDice.map((d) => d.value).join(', ');
            const labelWord = engine.diceCount === 1 ? 'roll' : 'die';
            updateStatusBanner(
              `${curPlayer.name}: Next ${labelWord} ready [${remainingValues}] • Click goti or choose ${labelWord}!`
            );
            return;
          } else {
            // No remaining dice have valid moves, mark all used
            remainingDice.forEach((d) => {
              d.used = true;
              if (gameMode === 'online') {
                const passMsg = {
                  type: 'two_dice_pass',
                  dieIndex: d.index,
                  playerId: curPlayer.id,
                  actionId: `pass_${curPlayer.id}_${d.index}_${Date.now()}`
                };
                if (webRtc) webRtc.broadcast(passMsg);
                else if (socket) socket.emit('two_dice_pass', passMsg);
              }
            });
            updateTwoDiceUI();
            updateStatusBanner(`No valid moves for remaining roll(s).`);
          }
        }
        finishTwoDiceTurn();
      }
    }

    afterWalk();
  });
}

function executeTwoDiceStepRemote(pawn, singleRoll) {
  isAwaitingPawnMove = false;
  isPawnRunning = true;
  setRollButtonEnabled(false);
  clearSelectablePawns();
  hideGotiDicePopup();

  const result = engine.movePawn(pawn, singleRoll);

  if (result.capturedOpponent) {
    twoDiceBonusGranted = true;
    const oppName = engine.players[result.capturedOpponent.playerId]?.name || 'opponent';
    if (!twoDiceBonusReasons.some(r => r.includes('Knockout'))) {
      twoDiceBonusReasons.push(`💥 Knockout! Captured ${oppName}'s goti`);
    }
  }
  if (result.reachedGoal) {
    twoDiceBonusGranted = true;
    if (!twoDiceBonusReasons.some(r => r.includes('Home'))) {
      twoDiceBonusReasons.push(`🎯 Goti reached Home!`);
    }
  }

  const pawnMesh = pawns.find(
    (m) => m.userData.playerId === pawn.playerId && m.userData.pawnId === pawn.id
  );

  animatePawnWalk(pawnMesh, pawn.playerId, pawn.id, result.fromStep, result.toStep, () => {
    function afterWalk() {
      if (result.capturedOpponent) {
        sounds.playCapture();
        updateStatusBanner(`${engine.currentPlayer.name} knocked out an opponent! 💥`);
        const oppMesh = pawns.find(
          (m) => m.userData.playerId === result.capturedOpponent.playerId && m.userData.pawnId === result.capturedOpponent.pawnId
        );
        const homePos = getPawnWorldPosition(result.capturedOpponent.playerId, result.capturedOpponent.pawnId, -1);
        animatePawnHop(oppMesh, homePos, checkNextRemote);
      } else {
        if (result.isSafeStar) {
          sounds.playSafeStar();
          updateStatusBanner(`${engine.currentPlayer.name} reached a Safe Star! ⭐`);
        } else if (result.reachedGoal) {
          sounds.playVictory();
          updateStatusBanner(`👑 ${engine.currentPlayer.name} reached Sanctuary Goal!`);
        }
        checkNextRemote();
      }
    }

    function checkNextRemote() {
      if (engine.isGameOver) {
        finishTwoDiceTurn();
        return;
      }

      const remainingDie = twoDicePool.find((d) => !d.used);
      if (!remainingDie) {
        finishTwoDiceTurn();
      } else {
        isPawnRunning = false;
        updateTwoDiceUI();
        updateStatusBanner(`${engine.currentPlayer.name} is allocating remaining die (${remainingDie.value})...`);
      }
    }

    afterWalk();
  });
}

function finishTwoDiceTurn() {
  hideGotiDicePopup();
  const bonusGranted = twoDiceBonusGranted;
  const reasons = [...twoDiceBonusReasons];
  hideTwoDiceUI();
  isPawnRunning = false;
  isAwaitingPawnMove = false;
  isTurnTransitioning = true;
  setRollButtonEnabled(false);

  if (engine.isGameOver) {
    isPawnRunning = false;
    isRolling = false;
    isAwaitingPawnMove = false;
    isTurnTransitioning = false;
    sounds.playVictory();
    updateStatusBanner(`🏆 ${engine.winner.name} Wins the Game!`);
    showVictoryModal(engine.winner, engine.rankings);
    return;
  }

  twoDiceBonusGranted = false;
  twoDiceBonusReasons = [];

  setTimeout(() => {
    if (bonusGranted) {
      const reasonDetail = reasons.length > 0 ? ` (${reasons.join(' & ')})` : '';
      const bonusMsg = `Bonus Roll earned! 🎲${reasonDetail}`;
      updateStatusBanner(`${engine.currentPlayer.name}: ${bonusMsg}`);
      if (gameMode === 'online' && isMyTurnInOnlineGame(engine.currentPlayer)) {
        broadcastTurnState(engine.currentTurnPlayerId, true, bonusMsg);
      }
      startTurnCycle(true, bonusMsg);
    } else {
      const prevPlayer = engine.currentPlayer;
      const nextTurnId = engine.advanceTurn();
      setRollButtonEnabled(false);
      updateStatusBanner("Waiting for next player...");
      if (gameMode === 'online' && isMyTurnInOnlineGame(prevPlayer)) {
        broadcastTurnState(nextTurnId, false, null);
      }
      startTurnCycle(false);
    }
  }, 600);
}

function autoExecuteTwoDiceTurn(firstPawn, firstDieIndex, reasonMsg) {
  stopTurnTimer();
  isAwaitingPawnMove = false;
  clearSelectablePawns();
  hideGotiDicePopup();
  if (reasonMsg) {
    updateStatusBanner(reasonMsg);
  }

  activeDieIndex = firstDieIndex;

  setTimeout(() => {
    executeTwoDiceStep(firstPawn, () => {
      runNextAutoStep();
    });
  }, 450);

  function runNextAutoStep() {
    if (engine.isGameOver) return;

    const remainingDice = twoDicePool.filter((d) => !d.used);
    if (remainingDice.length === 0) {
      finishTwoDiceTurn();
      return;
    }

    const curPlayer = engine.currentPlayer;
    // Find first remaining die that has any valid move
    let usableDie = null;
    let usablePawns = [];

    for (const d of remainingDice) {
      const roll = { total: d.value, isSingleDie: true, hasSix: d.value === 6 };
      const valid = engine.getMovablePawns(curPlayer, roll);
      if (valid.length > 0) {
        usableDie = d;
        usablePawns = valid;
        break;
      }
    }

    if (!usableDie) {
      remainingDice.forEach((d) => { d.used = true; });
      updateTwoDiceUI();
      updateStatusBanner(`No valid moves for remaining roll(s).`);
      setTimeout(finishTwoDiceTurn, 600);
      return;
    }

    activeDieIndex = usableDie.index;
    const roll = { total: usableDie.value, isSingleDie: true, hasSix: usableDie.value === 6 };

    // Prefer the same pawn if it is still valid to move with the next die
    let nextPawn = usablePawns.find((p) => p.id === firstPawn.id);
    if (!nextPawn) {
      nextPawn = aiBot.chooseBestPawn(usablePawns, roll, engine.players) || usablePawns[0];
    }

    setTimeout(() => {
      executeTwoDiceStep(nextPawn, () => {
        runNextAutoStep();
      });
    }, 550);
  }
}

function checkAndTriggerAutoTwoDiceMove(current, rollsToRun, allMovable) {
  if (!twoDicePool || twoDicePool.length < 2) return false;

  const pawnsOnTrack = current.pawns.filter((p) => !p.isFinished && !p.isInYard);
  const yardPawns = current.pawns.filter((p) => p.isInYard && !p.isFinished);
  const unfinishedPawns = current.pawns.filter((p) => !p.isFinished);

  // Rule A: 6+X to Open & Run automatically
  // When no pawns are on track, and roll contains a 6 (e.g. 6+1, 6+2, 6+3, 6+4, 6+5):
  // 6 opens a yard goti, and the other die immediately runs that newly opened goti!
  if (pawnsOnTrack.length === 0 && yardPawns.length > 0 && rollsToRun.includes(6)) {
    const sixDieIdx = twoDicePool.findIndex((d) => !d.used && d.value === 6);
    const otherDieIdx = twoDicePool.findIndex((d, idx) => !d.used && idx !== sixDieIdx);
    if (sixDieIdx !== -1 && otherDieIdx !== -1) {
      const targetPawn = yardPawns[0];
      const otherVal = twoDicePool[otherDieIdx].value;
      const bannerMsg = `⚡ Auto: Opened ${current.name}'s goti with 6 and running ${otherVal} steps! 🎲`;
      autoExecuteTwoDiceTurn(targetPawn, sixDieIdx, bannerMsg);
      return true;
    }
  }

  // Rule B: Only 1 goti on track, and no 6 rolled (or cannot open yard goti)
  // Yard pawns cannot move without a 6, so the single track goti is the only goti that can move!
  if (pawnsOnTrack.length === 1 && !rollsToRun.includes(6)) {
    const targetPawn = pawnsOnTrack[0];
    const canMoveAny = rollsToRun.some((val) =>
      engine.canPawnMove(targetPawn, { total: val, isSingleDie: true, hasSix: val === 6 })
    );
    if (canMoveAny) {
      const plan = aiBot.chooseBestTwoDicePlan(current, twoDicePool, engine.players, engine);
      const firstDieIdx = (plan && plan.firstDieIndex !== undefined) ? plan.firstDieIndex : 0;
      const bannerMsg = `⚡ Auto: Single goti on board taking both dice [${rollsToRun.join(', ')}]! 🎲`;
      autoExecuteTwoDiceTurn(targetPawn, firstDieIdx, bannerMsg);
      return true;
    }
  }

  // Rule C: Only 1 unfinished goti remaining in total (other 3 in Home Goal)
  // There is only 1 goti left in existence for this player!
  if (unfinishedPawns.length === 1) {
    const targetPawn = unfinishedPawns[0];
    if (targetPawn.isInYard) {
      if (rollsToRun.includes(6)) {
        const sixDieIdx = twoDicePool.findIndex((d) => !d.used && d.value === 6);
        const otherDieIdx = twoDicePool.findIndex((d, idx) => !d.used && idx !== sixDieIdx);
        if (sixDieIdx !== -1 && otherDieIdx !== -1) {
          const bannerMsg = `⚡ Auto: Opened final goti with 6 and running ${twoDicePool[otherDieIdx].value} steps! 🎲`;
          autoExecuteTwoDiceTurn(targetPawn, sixDieIdx, bannerMsg);
          return true;
        }
      }
    } else {
      const plan = aiBot.chooseBestTwoDicePlan(current, twoDicePool, engine.players, engine);
      const firstDieIdx = (plan && plan.firstDieIndex !== undefined) ? plan.firstDieIndex : 0;
      const bannerMsg = `⚡ Auto: Final goti moving automatically with [${rollsToRun.join(', ')}]! 🎲`;
      autoExecuteTwoDiceTurn(targetPawn, firstDieIdx, bannerMsg);
      return true;
    }
  }

  // Rule D: Exactly 1 pawn can legally move with any die in rollsToRun
  if (allMovable && allMovable.length === 1) {
    const targetPawn = allMovable[0];
    if (targetPawn.isInYard && rollsToRun.includes(6)) {
      const sixDieIdx = twoDicePool.findIndex((d) => !d.used && d.value === 6);
      const otherDieIdx = twoDicePool.findIndex((d, idx) => !d.used && idx !== sixDieIdx);
      if (sixDieIdx !== -1 && otherDieIdx !== -1) {
        const bannerMsg = `⚡ Auto: Opened goti with 6 and running ${twoDicePool[otherDieIdx].value} steps! 🎲`;
        autoExecuteTwoDiceTurn(targetPawn, sixDieIdx, bannerMsg);
        return true;
      }
    } else if (!targetPawn.isInYard) {
      const plan = aiBot.chooseBestTwoDicePlan(current, twoDicePool, engine.players, engine);
      const firstDieIdx = (plan && plan.firstDieIndex !== undefined) ? plan.firstDieIndex : 0;
      const bannerMsg = `⚡ Auto: Only movable goti advancing with [${rollsToRun.join(', ')}]! 🎲`;
      autoExecuteTwoDiceTurn(targetPawn, firstDieIdx, bannerMsg);
      return true;
    }
  }

  return false;
}

function executeBotTwoDiceTurn() {
  const current = engine.currentPlayer;
  stepBotDicePool();

  function stepBotDicePool() {
    if (engine.isGameOver) return;
    const unusedDice = twoDicePool.filter((d) => !d.used);
    if (unusedDice.length === 0) {
      finishTwoDiceTurn();
      return;
    }

    let chosenPawn = null;
    let chosenDieIdx = null;

    if (unusedDice.length === 2 && twoDicePool.length === 2) {
      const plan = aiBot.chooseBestTwoDicePlan(current, twoDicePool, engine.players, engine);
      if (plan && plan.firstPawn && plan.firstDieIndex !== undefined) {
        chosenPawn = plan.firstPawn;
        chosenDieIdx = plan.firstDieIndex;
      }
    }

    if (!chosenPawn || chosenDieIdx === null) {
      let bestScore = -999999;
      for (const d of unusedDice) {
        const roll = { total: d.value, isSingleDie: true, hasSix: d.value === 6 };
        const validPawns = engine.getMovablePawns(current, roll);
        for (const p of validPawns) {
          const score = aiBot.evaluateMoveScore(p, roll, engine.players);
          if (score > bestScore) {
            bestScore = score;
            chosenPawn = p;
            chosenDieIdx = d.index;
          }
        }
      }
    }

    if (!chosenPawn || chosenDieIdx === null) {
      unusedDice.forEach((d) => { d.used = true; });
      updateTwoDiceUI();
      finishTwoDiceTurn();
      return;
    }

    activeDieIndex = chosenDieIdx;
    setTimeout(() => {
      executeTwoDiceStep(chosenPawn, () => {
        setTimeout(stepBotDicePool, 600);
      });
    }, 650);
  }
}

function handleRollOutcome(rollResult) {
  if (gameMode === 'online') saveActiveMatchSession();
  else saveOfflineGameState();
  const current = engine.currentPlayer;
  const isLastGotiHome = (engine.diceCount === 2) && isPlayerLastGotiInHomeLane(current);
  const effectiveDiceCount = isLastGotiHome ? 1 : engine.diceCount;

  // --- 1-DIE GAME MODE (or 2-Dice match where final goti is in Home Lane) ---
  if (effectiveDiceCount === 1) {
    hideTwoDiceUI();
    hideGotiDicePopup();
    setRollButtonEnabled(false);

    // 1. Check 3 Consecutive Sixes Penalty: immediately forfeits turn
    if (rollResult.d1 === 6 && (engine.consecutiveSixes || 0) >= 3) {
      isAwaitingPawnMove = false;
      isPawnRunning = false;
      isTurnTransitioning = true;
      setRollButtonEnabled(false);
      updateStatusBanner(`⚠️ 3 Consecutive Sixes! ${current.name} forfeits turn! Passing turn...`);
      setTimeout(() => {
        const nextTurnId = engine.advanceTurn();
        setRollButtonEnabled(false);
        updateStatusBanner("Waiting for next player...");
        if (gameMode === 'online') {
          if (isMyTurnInOnlineGame(current)) {
            broadcastTurnState(nextTurnId, false, null);
          }
        }
        startTurnCycle(false);
      }, 1200);
      return;
    }

    // Single-roll developer hack deactivation
    if (typeof isHackApplicableToCurrentPlayer === 'function' && isHackApplicableToCurrentPlayer()) {
      if (diceHackState.mode === 'single') {
        diceHackState.enabled = false;
        setTimeout(() => {
          if (typeof updateHudHackBadge === 'function') updateHudHackBadge();
          if (typeof updateHackModalUI === 'function') updateHackModalUI();
        }, 100);
      }
    }

    const validPawns = engine.getMovablePawns(current, rollResult);
    const rollDisplay = `${rollResult.total}`;

    // 2. No valid moves: consume roll and immediately advance turn
    if (validPawns.length === 0) {
      isAwaitingPawnMove = false;
      isPawnRunning = false;
      isTurnTransitioning = true;
      setRollButtonEnabled(false);
      updateStatusBanner(`${current.name} rolled ${rollDisplay}. No valid moves! Passing turn...`);
      setTimeout(() => {
        const rolledSix = (rollResult.hasSix || rollResult.total === 6 || rollResult.d1 === 6);
        if (rolledSix && (engine.consecutiveSixes || 0) < 3) {
          const bonusMsg = `Rolled a 6! (No moves possible) • Bonus Roll! 🎲`;
          if (gameMode === 'online' && isMyTurnInOnlineGame(current)) {
            broadcastTurnState(engine.currentTurnPlayerId, true, bonusMsg);
          }
          startTurnCycle(true, bonusMsg);
        } else {
          const nextTurnId = engine.advanceTurn();
          setRollButtonEnabled(false);
          updateStatusBanner("Waiting for next player...");
          if (gameMode === 'online') {
            if (isMyTurnInOnlineGame(current)) {
              broadcastTurnState(nextTurnId, false, null);
            }
          }
          startTurnCycle(false);
        }
      }, 1100);
      return;
    }

    // 3. Valid pawn moves available: lock roll button and await pawn selection
    isAwaitingPawnMove = true;
    setRollButtonEnabled(false);
    startTurnTimer();

    if (current.isBot && gameMode !== 'online') {
      const chosenPawn = aiBot.chooseBestPawn(validPawns, rollResult, engine.players);
      setTimeout(() => {
        executePawnMove(chosenPawn, rollResult);
      }, 600);
    } else if (gameMode === 'online' && !isMyTurnInOnlineGame(current)) {
      clearSelectablePawns();
      isAwaitingPawnMove = false;
      let oppMsg = `${current.name} rolled ${rollDisplay} • Waiting for opponent to move...`;
      if (rollResult.hasSix) {
        oppMsg = `${current.name} rolled a 6! Waiting for opponent to move...`;
      }
      updateStatusBanner(oppMsg);
    } else if (validPawns.length === 1) {
      // Single movable goti: auto-move after brief organic pause
      const singlePawn = validPawns[0];
      highlightSelectablePawns(validPawns);
      updateStatusBanner(`⚡ Auto-Move: ${current.name}'s goti advancing ${rollDisplay} steps! 🎲`);
      stopTurnTimer();
      setTimeout(() => {
        if (!isPawnRunning && !engine.isGameOver) {
          executePawnMove(singlePawn, rollResult);
        }
      }, 450);
    } else {
      highlightSelectablePawns(validPawns);
      let msg = `Select a pawn to advance (${rollDisplay})`;
      if (rollResult.hasSix) {
        msg = `Rolled a 6! Select a pawn to release or advance (${rollDisplay})`;
      }
      updateStatusBanner(msg);
    }
    return;
  }

  // --- 2-DICE GAME MODE ---
  const rollsToRun = [rollResult.d1, rollResult.d2];
  const isDoubleSix = (rollResult.d1 === 6 && rollResult.d2 === 6);
  twoDiceBonusGranted = isDoubleSix && ((engine.consecutiveDoubles || 0) < 3);
  twoDiceBonusReasons = twoDiceBonusGranted ? ['Rolled Double Sixes (6+6)!'] : [];
  twoDicePool = rollsToRun.map((val, idx) => ({ index: idx, value: val, used: false }));
  activeDieIndex = null;
  hideGotiDicePopup();
  updateTwoDiceUI();
  setRollButtonEnabled(false);

  // Check 3 consecutive double-sixes penalty
  if (isDoubleSix && ((engine.consecutiveDoubles || 0) >= 3 || (engine.consecutiveSixes || 0) >= 3)) {
    isAwaitingPawnMove = false;
    isPawnRunning = false;
    isTurnTransitioning = true;
    setRollButtonEnabled(false);
    updateStatusBanner(`⚠️ 3 Consecutive Double Sixes (6+6)! ${current.name} forfeits turn! Passing turn...`);
    setTimeout(() => {
      const nextTurnId = engine.advanceTurn();
      setRollButtonEnabled(false);
      updateStatusBanner("Waiting for next player...");
      if (gameMode === 'online') {
        if (isMyTurnInOnlineGame(current)) {
          broadcastTurnState(nextTurnId, false, null);
        }
      }
      startTurnCycle(false);
    }, 1200);
    return;
  }

  // Deactivate single hack in 2-dice mode
  if (typeof isHackApplicableToCurrentPlayer === 'function' && isHackApplicableToCurrentPlayer()) {
    if (diceHackState.mode === 'single') {
      diceHackState.enabled = false;
      setTimeout(() => {
        if (typeof updateHudHackBadge === 'function') updateHudHackBadge();
        if (typeof updateHackModalUI === 'function') updateHackModalUI();
      }, 100);
    }
  }

  // Check if any pawn can move with any die
  const hasAnyMove = rollsToRun.some((val) => {
    const r = { total: val, isSingleDie: true, hasSix: val === 6 };
    return engine.getMovablePawns(current, r).length > 0;
  });

  if (!hasAnyMove) {
    isAwaitingPawnMove = false;
    isPawnRunning = false;
    isTurnTransitioning = true;
    hideTwoDiceUI();
    hideGotiDicePopup();
    setRollButtonEnabled(false);
    updateStatusBanner(`${current.name} rolled [${rollsToRun.join(', ')}]. No valid moves! Passing turn...`);
    setTimeout(() => {
      if (twoDiceBonusGranted && (engine.consecutiveDoubles || 0) < 3) {
        if (gameMode === 'online' && isMyTurnInOnlineGame(current)) {
          broadcastTurnState(engine.currentTurnPlayerId, true, "Rolled 6+6! Bonus Roll! 🎲");
        }
        startTurnCycle(true, "Rolled 6+6! Bonus Roll! 🎲");
      } else {
        const nextTurnId = engine.advanceTurn();
        setRollButtonEnabled(false);
        updateStatusBanner("Waiting for next player...");
        if (gameMode === 'online') {
          if (isMyTurnInOnlineGame(current)) {
            broadcastTurnState(nextTurnId, false, null);
          }
        }
        startTurnCycle(false);
      }
    }, 1100);
    return;
  }

  if (current.isBot && gameMode !== 'online') {
    executeBotTwoDiceTurn();
    return;
  }

  if (gameMode === 'online' && !isMyTurnInOnlineGame(current)) {
    clearSelectablePawns();
    isAwaitingPawnMove = false;
    updateStatusBanner(`${current.name} rolled [${rollsToRun.join(', ')}] • Waiting for opponent to move...`);
    return;
  }

  // Human player: highlight all gotiyan that can move with ANY available die
  const allMovable = current.pawns.filter((p) => {
    if (p.isFinished) return false;
    return rollsToRun.some((val) => engine.canPawnMove(p, { total: val, isSingleDie: true, hasSix: val === 6 }));
  });

  // Check for automatic double-dice execution (e.g. 6+X to open and run, single goti on board taking both dice)
  if (checkAndTriggerAutoTwoDiceMove(current, rollsToRun, allMovable)) {
    return;
  }

  highlightSelectablePawns(allMovable);
  isAwaitingPawnMove = true;
  startTurnTimer();
  updateStatusBanner(`${current.name}: Rolled [${rollsToRun.join(', ')}] • Click a goti to choose which die number to run!`);
  return;
}


// High-Contrast Royal Heirloom Aura Colors for Gotiyan
function getPlayerAuraColor(playerId) {
  switch (playerId) {
    case 0: return 0xff3b30; // Vibrant Carnelian Red
    case 1: return 0xffcc00; // Radiant Amber Gold
    case 2: return 0x00a2ff; // Royal Lapis Cyan-Blue
    case 3: return 0x38ef7d; // Vibrant Emerald-Jade (high-contrast for Charcoal)
    default: return 0xffd700;
  }
}

// 3D Animated Turn Aura Indicator for Gotiyan (Anti-Glare compliant: overhead gemstone beacon, zero board glare)
function createTurnAuraMesh(playerColor = 0xffd700, isSelectable = false) {
  const group = new THREE.Group();
  group.name = 'turnAura';

  // 1. Faceted Gemstone Star Beacon (Outer rotating crystal visible from overhead top-down view)
  const starGeo = new THREE.OctahedronGeometry(isSelectable ? 0.42 : 0.34, 0);
  const starMat = new THREE.MeshBasicMaterial({
    color: playerColor,
    transparent: true,
    opacity: isSelectable ? 0.95 : 0.75
  });
  const starMesh = new THREE.Mesh(starGeo, starMat);
  starMesh.position.y = 2.30;
  group.add(starMesh);

  // 2. Inner Golden Diamond Core
  const coreGeo = new THREE.OctahedronGeometry(isSelectable ? 0.22 : 0.16, 0);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: isSelectable ? 0.90 : 0.65
  });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.position.y = 2.30;
  group.add(coreMesh);

  // 3. Floating Pointer Diamond (pointing down towards goti head)
  const pointerGeo = new THREE.ConeGeometry(isSelectable ? 0.16 : 0.12, isSelectable ? 0.26 : 0.18, 4);
  const pointerMat = new THREE.MeshBasicMaterial({
    color: playerColor,
    transparent: true,
    opacity: isSelectable ? 0.90 : 0.70
  });
  const pointerMesh = new THREE.Mesh(pointerGeo, pointerMat);
  pointerMesh.rotation.x = Math.PI; // Invert to point down towards goti head
  pointerMesh.position.y = 1.95;
  group.add(pointerMesh);

  group.userData = {
    starMesh,
    coreMesh,
    pointerMesh,
    initialY: 2.30,
    isSelectable: isSelectable
  };

  group.traverse((c) => {
    c.raycast = () => {};
  });

  return group;
}

function updatePawnTurnAuras() {
  const curPlayer = engine?.currentPlayer;
  if (!curPlayer) return;
  const now = performance.now();
  for (let i = 0; i < pawns.length; i++) {
    const pMesh = pawns[i];
    if (pMesh && pMesh.userData && pMesh.userData.auraMesh) {
      if (pMesh.userData.playerId !== curPlayer.id) continue;
      const aura = pMesh.userData.auraMesh;
      const uData = aura.userData;
      const isSelectable = uData.isSelectable;
      const speed = isSelectable ? 0.007 : 0.0035;
      const bobAmount = isSelectable ? 0.12 : 0.06;
      const bobY = uData.initialY + Math.sin(now * speed) * bobAmount;

      if (uData.starMesh) {
        uData.starMesh.rotation.y += isSelectable ? 0.05 : 0.025;
        uData.starMesh.rotation.z = Math.sin(now * 0.003) * 0.15;
        uData.starMesh.position.y = bobY;
      }
      if (uData.coreMesh) {
        uData.coreMesh.rotation.y -= isSelectable ? 0.06 : 0.03;
        uData.coreMesh.position.y = bobY;
      }
      if (uData.pointerMesh) {
        uData.pointerMesh.rotation.y += isSelectable ? 0.04 : 0.02;
        uData.pointerMesh.position.y = bobY - 0.35;
      }

      // If selectable, gently animate pawn breathing/hovering
      if (pMesh.userData.isSelectable && pMesh.userData.currentPos) {
        pMesh.position.y = pMesh.userData.currentPos.y + Math.abs(Math.sin(now * 0.006)) * 0.08;
      }
    }
  }
}

// Show turn aura on all active pawns of current player so player knows it's their turn
function showActiveTurnAura(playerId) {
  clearSelectablePawns();
  const curPlayer = engine.players[playerId];
  if (!curPlayer) return;

  const auraColor = getPlayerAuraColor(curPlayer.id);

  pawns.forEach((pMesh) => {
    if (pMesh.userData.playerId === playerId) {
      const pawnData = curPlayer.pawns[pMesh.userData.pawnId];
      if (!pawnData || pawnData.isFinished) return;

      if (!pMesh.userData.auraMesh) {
        const aura = createTurnAuraMesh(auraColor, false);
        pMesh.add(aura);
        pMesh.userData.auraMesh = aura;
      }
    }
  });
}

function highlightSelectablePawns(validPawns) {
  clearSelectablePawns();
  const validIds = new Set(validPawns.map((p) => p.id));
  const auraColor = getPlayerAuraColor(engine.currentTurnPlayerId);

  pawns.forEach((pMesh) => {
    if (pMesh.userData.playerId === engine.currentTurnPlayerId && validIds.has(pMesh.userData.pawnId)) {
      pMesh.userData.isSelectable = true;
      pMesh.scale.set(0.85, 0.85, 0.85);

      if (!pMesh.userData.auraMesh) {
        const aura = createTurnAuraMesh(auraColor, true);
        pMesh.add(aura);
        pMesh.userData.auraMesh = aura;
      }
    }
  });
}

function clearSelectablePawns() {
  pawns.forEach((pMesh) => {
    pMesh.userData.isSelectable = false;
    pMesh.scale.set(0.72, 0.72, 0.72);
    if (pMesh.userData.currentPos) {
      pMesh.position.y = pMesh.userData.currentPos.y;
    }
    if (pMesh.userData.auraMesh) {
      pMesh.remove(pMesh.userData.auraMesh);
      pMesh.userData.auraMesh = null;
    }
  });
}

function executePawnMove(pawn, rollInput) {
  if (gameMode === 'online') saveActiveMatchSession();
  else saveOfflineGameState();
  isAwaitingPawnMove = false;
  isPawnRunning = true;
  setRollButtonEnabled(false);
  clearSelectablePawns();

  const roll = rollInput || engine.lastRoll;
  const result = engine.movePawn(pawn, roll);

  if (gameMode === 'online' && isMyTurnInOnlineGame(engine.players[pawn.playerId])) {
    const actionId = `move_${myOnlinePlayerIndex}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const moveMsg = {
      type: 'move',
      pawnId: pawn.id,
      playerId: pawn.playerId,
      roll: roll,
      fromStep: result.fromStep,
      toStep: result.toStep,
      actionId
    };
    if (webRtc) {
      webRtc.broadcast(moveMsg);
    } else if (socket) {
      socket.emit('pawn_move', moveMsg);
    }
  }

  const pawnMesh = pawns.find(
    (m) => m.userData.playerId === pawn.playerId && m.userData.pawnId === pawn.id
  );

  animatePawnWalk(pawnMesh, pawn.playerId, pawn.id, result.fromStep, result.toStep, () => {
    function finalizeTurn() {
      updateYardRankBadges();
      if (engine.isGameOver) {
        isPawnRunning = false;
        isRolling = false;
        isAwaitingPawnMove = false;
        isTurnTransitioning = false;
        sounds.playVictory();
        updateStatusBanner(`🏆 ${engine.winner.name} Wins the Game!`);
        showVictoryModal(engine.winner, engine.rankings);
        return;
      }

      isTurnTransitioning = true;
      setTimeout(() => {
        // Bonus Turn Conditions:
        // 1. Rolled a 6 in 1-die mode (and consecutiveSixes < 3)
        // 2. Captured an opponent goti
        // 3. Reached sanctuary goal (finished goti)
        const rolledSix = (engine.diceCount === 1)
          ? (roll.hasSix || roll.total === 6 || roll.d1 === 6)
          : (roll.d1 === 6 && roll.d2 === 6);
        const earnedBonus = (rolledSix && (engine.consecutiveSixes || 0) < 3) ||
                            result.grantedBonusRoll ||
                            !!result.capturedOpponent ||
                            !!result.reachedGoal;

        if (!earnedBonus) {
          const prevPlayer = engine.currentPlayer;
          const nextTurnId = engine.advanceTurn();
          isPawnRunning = false;
          setRollButtonEnabled(false);
          updateStatusBanner("Waiting for next player...");
          if (gameMode === 'online' && isMyTurnInOnlineGame(prevPlayer)) {
            broadcastTurnState(nextTurnId, false, null);
          }
          startTurnCycle(false);
        } else {
          let reasonMsg = "Bonus Roll earned! 🎲";
          if (result.capturedOpponent) {
            const oppName = engine.players[result.capturedOpponent.playerId]?.name || 'opponent';
            reasonMsg = `💥 Knockout! Captured ${oppName}'s goti! Roll again! 🎲`;
          } else if (result.reachedGoal) {
            reasonMsg = `🎯 Goti reached Home! Roll again! 🎲`;
          } else if (rolledSix) {
            reasonMsg = `🎲 Rolled a 6! Bonus Roll! 🎲`;
          }
          isPawnRunning = false;
          if (gameMode === 'online' && isMyTurnInOnlineGame(engine.currentPlayer)) {
            broadcastTurnState(engine.currentTurnPlayerId, true, reasonMsg);
          }
          startTurnCycle(true, reasonMsg);
        }
      }, 500);
    }

    if (result.capturedOpponent) {
      sounds.playCapture();
      updateStatusBanner(`${engine.currentPlayer.name} knocked out an opponent! 💥`);

      const oppMesh = pawns.find(
        (m) => m.userData.playerId === result.capturedOpponent.playerId && m.userData.pawnId === result.capturedOpponent.pawnId
      );
      const homePos = getPawnWorldPosition(result.capturedOpponent.playerId, result.capturedOpponent.pawnId, -1);
      animatePawnHop(oppMesh, homePos, finalizeTurn);
    } else {
      if (result.isSafeStar) {
        sounds.playSafeStar();
        updateStatusBanner(`${engine.currentPlayer.name} reached a Safe Star! ⭐`);
      } else if (result.reachedGoal) {
        sounds.playVictory();
        updateStatusBanner(`👑 ${engine.currentPlayer.name} reached Sanctuary Goal!`);
      }

      finalizeTurn();
    }
  });
}

function startTurnCycle(isBonusRoll = false, bonusMessage = null) {
  isTurnTransitioning = false;
  updatePlayerHUD();
  const current = engine.currentPlayer;

  if (engine.isGameOver) {
    stopTurnTimer();
    clearSelectablePawns();
    setRollButtonEnabled(false);
    return;
  }

  isPawnRunning = false;
  isAwaitingPawnMove = false;

  if (!isBonusRoll) {
    accumulatedTurnRolls = [];
    twoDiceBonusGranted = false;
    twoDiceBonusReasons = [];
    if (gameMode !== 'online') saveOfflineGameState();
  }

  // Rule 2: In 2-Dice game, if player has only 1 last goti left and it is in Home Lane, auto-hide die 2 and play with 1 die
  const isLastGotiHome = (engine.diceCount === 2) && isPlayerLastGotiInHomeLane(current);
  if (isLastGotiHome) {
    if (dice[1]) dice[1].visible = false;
    if (diceShadows[1]) diceShadows[1].visible = false;
    hideTwoDiceUI();
    const pill = document.getElementById('dice-pill');
    if (pill) pill.textContent = '1';
  } else if (engine.diceCount === 2) {
    if (dice[1]) dice[1].visible = true;
    if (diceShadows[1]) diceShadows[1].visible = false;
    const pill = document.getElementById('dice-pill');
    if (pill) pill.textContent = '2';
  }

  // Show turn aura on all active pawns of current player so player knows it's their turn
  showActiveTurnAura(current.id);

  const btnRoll = document.getElementById('btn-roll');
  if (btnRoll) {
    if (isBonusRoll) {
      btnRoll.classList.add('bonus-roll-active');
      btnRoll.innerHTML = `<i class="fa-solid fa-fire text-amber-300 animate-pulse"></i> <span>BONUS ROLL</span> <span id="dice-pill" class="dice-badge">🎲</span>`;
    } else {
      btnRoll.classList.remove('bonus-roll-active');
      btnRoll.innerHTML = `<i class="fa-solid fa-dice text-sm"></i> <span>ROLL DICE</span> <span id="dice-pill" class="dice-badge">${isLastGotiHome ? 1 : (engine.diceCount || 1)}</span>`;
    }
  }

  startTurnTimer(20);

  if (gameMode === 'online') {
    const isMyTurn = isMyTurnInOnlineGame(current);
    if (isMyTurn) {
      setRollButtonEnabled(true);
      if (isBonusRoll && bonusMessage) {
        updateStatusBanner(`${bonusMessage} • Tap Bonus Roll!`);
      } else if (isLastGotiHome) {
        updateStatusBanner(`🎯 Your Turn (${current.name}) • Last goti in Home Lane! Playing with 1 Die.`);
      } else {
        updateStatusBanner(`Your Turn (${current.name}) • Tap Roll Dice`);
      }
    } else {
      setRollButtonEnabled(false);
      if (isBonusRoll && bonusMessage) {
        updateStatusBanner(`${current.name}: ${bonusMessage} (Waiting for roll...)`);
      } else if (isLastGotiHome) {
        updateStatusBanner(`${current.name}'s Turn • Last goti in Home Lane (1 Die)...`);
      } else {
        updateStatusBanner(`${current.name}'s Turn • Waiting for next player...`);
      }
    }
    return;
  }

  if (current.isBot) {
    setRollButtonEnabled(false);
    if (isBonusRoll && bonusMessage) {
      updateStatusBanner(`${current.name} (AI): ${bonusMessage}`);
    } else if (isLastGotiHome) {
      updateStatusBanner(`${current.name} (AI): Last goti in Home Lane • Rolling 1 Die...`);
    } else {
      updateStatusBanner(`${current.name} (AI) is rolling...`);
    }
    setTimeout(() => {
      if (!isTurnTransitioning && !isRolling && !isPawnRunning && !isAwaitingPawnMove && !engine.isGameOver) {
        rollDiceAction(true);
      }
    }, isBonusRoll ? 1200 : 750);
  } else {
    setRollButtonEnabled(true);
    if (isBonusRoll && bonusMessage) {
      updateStatusBanner(`${bonusMessage} • Tap Bonus Roll!`);
    } else if (isLastGotiHome) {
      updateStatusBanner(`🎯 ${current.name}'s Turn • Last goti in Home Lane! Playing with 1 Die.`);
    } else {
      updateStatusBanner(`${current.name}'s Turn • Tap Roll Dice`);
    }
  }
}

function updateStatusBanner(text) {
  const el = document.getElementById('status-text');
  if (el) el.textContent = text;
}

function updatePlayerHUD() {
  const cur = engine.players[engine.currentTurnPlayerId];
  if (!cur) return;
  const dot = document.getElementById('active-dot');
  const name = document.getElementById('active-player-name');
  const score = document.getElementById('active-player-score');
  if (dot) {
    dot.style.backgroundColor = cur.color;
    dot.style.boxShadow = `0 0 10px ${cur.color}`;
  }
  if (name) {
    name.textContent = cur.name;
  }
  if (score) {
    score.textContent = `${cur.finishedCount}/4`;
  }
}

function setClayMode(active) {
  isClay = active;
  const vignette = document.getElementById('vignette-layer');
  const btnColor = document.getElementById('mode-color');
  const btnClay = document.getElementById('mode-clay');

  if (active) {
    btnClay.classList.add('tab-active');
    btnColor.classList.remove('tab-active');
    vignette.classList.add('clay-vignette');
    scene.background.set(0xb0b8ba);
    scene.fog.color.set(0xa0a8aa);

    ambientLight.color.set(0xffffff);
    ambientLight.intensity = 0.65;
    keySpot.color.set(0xffffff);
    keySpot.intensity = 1.25;

    masterExportGroup.traverse((child) => {
      if (child.isMesh) {
        child.material.color.set(0xe8ecee);
        child.material.roughness = 0.65;
        child.material.metalness = 0.0;
        if (child.material.clearcoat !== undefined) child.material.clearcoat = 0.05;
      }
    });
    updateStatusBanner("Clay / Architectural Studio View Active");
  } else {
    btnColor.classList.add('tab-active');
    btnClay.classList.remove('tab-active');
    vignette.classList.remove('clay-vignette');
    scene.background.set(PALETTE.BG_TEAL);
    scene.fog.color.set(PALETTE.BG_TEAL);
    scene.fog.near = 38;
    scene.fog.far = 95;

    ambientLight.color.set(0xffffff);
    ambientLight.intensity = 0.72;
    keySpot.color.set(0xffffff);
    keySpot.intensity = 0.15;

    masterExportGroup.traverse((child) => {
      if (child.isMesh && child.material.userData.originalColor !== undefined) {
        child.material.color.set(child.material.userData.originalColor);
        child.material.roughness = child.material.userData.originalRoughness || 0.22;
        child.material.metalness = 0.04;
        if (child.material.userData.originalClearcoat !== undefined) {
          child.material.clearcoat = child.material.userData.originalClearcoat;
        }
      }
    });
    updateStatusBanner("PBR Kingdom Colors Active");
  }
}

function exportToGLB() {
  const btn = document.getElementById('btn-export');
  const orig = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Exporting...</span>';
  btn.disabled = true;

  const exporter = new THREE.GLTFExporter();
  exporter.parse(
    masterExportGroup,
    function (gltf) {
      const blob = new Blob([gltf], { type: 'application/octet-stream' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'Mission_Sambhoug_Ludo_Board.glb';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 1500);

      btn.innerHTML = '<i class="fa-solid fa-check text-emerald-300"></i><span>Exported!</span>';
      setTimeout(() => {
        btn.innerHTML = orig;
        btn.disabled = false;
      }, 2000);
    },
    { binary: true, embedImages: true }
  );
}

function setBoardMovementLocked(locked, showBanner = true) {
  isBoardLocked = !!locked;
  try {
    localStorage.setItem('ludo_board_locked', isBoardLocked ? 'true' : 'false');
  } catch (e) {}

  if (controls) {
    controls.enabled = !isBoardLocked;
    controls.enableRotate = !isBoardLocked;
    controls.enablePan = !isBoardLocked;
    controls.enableZoom = !isBoardLocked;
  }

  updateBoardLockUI();

  if (showBanner) {
    if (isBoardLocked) {
      updateStatusBanner("🔒 Board Movement Locked (Camera Frozen)");
      if (typeof sounds !== 'undefined' && sounds.playClick) sounds.playClick();
    } else {
      updateStatusBanner("🔓 Board Movement Unlocked (Camera Orbit Active)");
      if (typeof sounds !== 'undefined' && sounds.playClick) sounds.playClick();
    }
  }
}

function updateBoardLockUI() {
  // 1. Top Nav Bar Button
  const btnTop = document.getElementById('btn-lock-board');
  const iconTop = document.getElementById('lock-board-icon');
  const textTop = document.getElementById('lock-board-text');
  if (btnTop && iconTop && textTop) {
    if (isBoardLocked) {
      btnTop.classList.add('locked-active');
      iconTop.className = 'fa-solid fa-lock text-emerald-400';
      textTop.textContent = 'Locked';
      btnTop.title = 'Board Movement is Locked (Click to Unlock)';
    } else {
      btnTop.classList.remove('locked-active');
      iconTop.className = 'fa-solid fa-lock-open text-amber-400';
      textTop.textContent = 'Lock';
      btnTop.title = 'Lock Board Movement';
    }
  }

  // 2. Bottom Tray Button
  const btnTray = document.getElementById('btn-lock-board-tray');
  const iconTray = document.getElementById('tray-lock-icon');
  const textTray = document.getElementById('tray-lock-text');
  if (btnTray && iconTray && textTray) {
    if (isBoardLocked) {
      btnTray.classList.add('locked-active');
      iconTray.className = 'fa-solid fa-lock text-emerald-400';
      textTray.textContent = 'Locked';
      btnTray.title = 'Board Movement is Locked (Click to Unlock)';
    } else {
      btnTray.classList.remove('locked-active');
      iconTray.className = 'fa-solid fa-lock-open text-amber-400';
      textTray.textContent = 'Lock';
      btnTray.title = 'Lock Board Movement';
    }
  }

  // 3. Settings Modal Options Button
  const btnSettings = document.getElementById('btn-toggle-board-lock-settings');
  const iconSettings = document.getElementById('board-lock-icon-status');
  const labelSettings = document.getElementById('board-lock-label-status');
  if (btnSettings && iconSettings && labelSettings) {
    if (isBoardLocked) {
      btnSettings.className = 'btn-action px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center gap-2 transition hover:bg-emerald-500/30';
      iconSettings.className = 'fa-solid fa-lock text-emerald-400';
      labelSettings.textContent = 'Locked';
    } else {
      btnSettings.className = 'btn-action px-3 py-1.5 rounded-xl bg-slate-800 border border-white/10 text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-2';
      iconSettings.className = 'fa-solid fa-lock-open text-amber-400';
      labelSettings.textContent = 'Unlocked';
    }
  }
}

function setupUI() {
  document.getElementById('btn-roll')?.addEventListener('click', rollDiceAction);
  document.getElementById('btn-export')?.addEventListener('click', exportToGLB);
  document.getElementById('mode-color')?.addEventListener('click', () => setClayMode(false));
  document.getElementById('mode-clay')?.addEventListener('click', () => setClayMode(true));

  function tweenCamera(targetPos, targetLookAt, duration = 650) {
    if (!camera || !controls || !controls.target || !targetPos || !targetLookAt) return;
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1.0);
      const t = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      camera.position.lerpVectors(startPos, targetPos, t);
      controls.target.lerpVectors(startTarget, targetLookAt, t);
      controls.update();

      if (progress < 1.0) {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  document.getElementById('cam-exact')?.addEventListener('click', () => {
    tweenCamera(new THREE.Vector3(16.5, 17.5, 17.5), new THREE.Vector3(0, 0.5, 0));
  });
  document.getElementById('cam-top')?.addEventListener('click', () => {
    tweenCamera(new THREE.Vector3(0, 24.5, 0.001), new THREE.Vector3(0, 0, 0));
  });

  document.getElementById('btn-lock-board')?.addEventListener('click', (e) => {
    e.stopPropagation();
    setBoardMovementLocked(!isBoardLocked, true);
  });
  document.getElementById('btn-lock-board-tray')?.addEventListener('click', (e) => {
    e.stopPropagation();
    setBoardMovementLocked(!isBoardLocked, true);
  });

  // Modern Sci-Fi / Royal Heirloom Theme Switching
  updateThemeUI();
  document.getElementById('btn-toggle-theme')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleGameTheme();
  });
  document.getElementById('settings-theme-scifi')?.addEventListener('click', (e) => {
    e.stopPropagation();
    setGameTheme('scifi');
  });
  document.getElementById('settings-theme-heirloom')?.addEventListener('click', (e) => {
    e.stopPropagation();
    setGameTheme('heirloom');
  });

  const btnTrayCollapse = document.getElementById('btn-tray-collapse');
  if (btnTrayCollapse) {
    btnTrayCollapse.addEventListener('click', (e) => {
      e.stopPropagation();
      const tray = document.getElementById('bottom-tray');
      if (tray) {
        tray.classList.toggle('collapsed');
        const isCollapsed = tray.classList.contains('collapsed');
        const icon = document.getElementById('tray-collapse-icon');
        if (icon) {
          icon.className = isCollapsed
            ? 'fa-solid fa-chevron-up text-[7.5px]'
            : 'fa-solid fa-chevron-down text-[7.5px]';
        }
      }
    });
  }

  const btnMute = document.getElementById('btn-sound');
  if (btnMute) {
    btnMute.addEventListener('click', () => {
      handleSoundButtonClickForHack();
      if (typeof sounds !== 'undefined' && sounds.toggleMute) {
        const muted = sounds.toggleMute();
        btnMute.innerHTML = muted
          ? '<i class="fa-solid fa-volume-xmark text-rose-400"></i>'
          : '<i class="fa-solid fa-volume-high text-cyan-400"></i>';
      }
    });
  }

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  window.addEventListener('pointerdown', (e) => {
    if (
      e.target.closest('button') ||
      e.target.closest('header') ||
      e.target.closest('footer') ||
      e.target.closest('.modal-overlay') ||
      e.target.closest('.goti-dice-popup')
    ) return;
    if (!camera || !renderer) return;
    if (isPawnRunning) return;

    try {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // Check if user clicked/tapped a 3D Die to roll
      const activeDice = dice.filter(d => d && d.visible);
      const diceHits = raycaster.intersectObjects(activeDice, true);
      if (diceHits.length > 0 && !isTurnTransitioning && !isRolling && !isPawnRunning && !isAwaitingPawnMove && !engine.isGameOver) {
        const btnRoll = document.getElementById('btn-roll');
        if (btnRoll && !btnRoll.disabled && (!engine.currentPlayer?.isBot || gameMode === 'online')) {
          rollDiceAction(false);
        }
        return;
      }

      const activePawns = pawns.filter(p => p && p.visible && p.geometry);
      const hits = raycaster.intersectObjects(activePawns, false);
      if (hits && hits.length > 0) {
        const pMesh = hits[0].object;
        if (pMesh && pMesh.userData && pMesh.userData.isSelectable) {
          // In online multiplayer: can only select and move your own gotiyan!
          if (gameMode === 'online' && !isMyTurnInOnlineGame(engine.players[pMesh.userData.playerId])) {
            return;
          }
          const player = engine.players[pMesh.userData.playerId];
          const pawn = player?.pawns?.[pMesh.userData.pawnId];
          if (pawn) {
            const hasPooledDice = twoDicePool && twoDicePool.length > 0 && twoDicePool.some((d) => !d.used);
            if (hasPooledDice) {
              handlePooledDicePawnClick(pawn, pMesh);
            } else {
              executePawnMove(pawn, engine.lastRoll || engine.currentDiceValue);
            }
          }
        }
      } else {
        // Clicked outside on tabletop
        hideGotiDicePopup();
      }
    } catch (err) {
      // Guard against any intermittent pointer raycast exception
    }
  });

  // 3D Goti Dice Popup Buttons
  document.getElementById('btn-popup-die-1')?.addEventListener('click', (e) => {
    e.stopPropagation();
    chooseDieFromPopup(0);
  });
  document.getElementById('btn-popup-die-2')?.addEventListener('click', (e) => {
    e.stopPropagation();
    chooseDieFromPopup(1);
  });
  document.getElementById('btn-close-goti-popup')?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideGotiDicePopup();
  });

  document.getElementById('btn-toggle-dice')?.addEventListener('click', () => {
    const nextCount = (engine.diceCount === 1) ? 2 : 1;
    setDiceCount(nextCount, true);
  });

  document.getElementById('btn-dice-opt-1')?.addEventListener('click', () => {
    setDiceCount(1, true);
  });

  document.getElementById('btn-dice-opt-2')?.addEventListener('click', () => {
    setDiceCount(2, true);
  });

  document.getElementById('btn-new-game')?.addEventListener('click', () => {
    resetToNewGame();
  });

  document.getElementById('btn-exit-game')?.addEventListener('click', () => {
    if (window.handleBackNavigation) {
      window.handleBackNavigation();
    } else {
      exitGameAction();
    }
  });

  document.getElementById('btn-modal-new-game')?.addEventListener('click', () => {
    resetToNewGame();
  });

  document.getElementById('btn-victory-play-again')?.addEventListener('click', (e) => {
    e.stopPropagation();
    isPawnRunning = false;
    isRolling = false;
    isAwaitingPawnMove = false;
    isTurnTransitioning = false;
    document.getElementById('victory-modal')?.classList.remove('open');
    resetToNewGame(undefined, false, true);
  });

  document.getElementById('btn-open-multiplayer')?.addEventListener('click', () => {
    updateModeLockUI();
    document.getElementById('multiplayer-modal').classList.add('open');
  });
  document.getElementById('btn-close-modal')?.addEventListener('click', () => {
    document.getElementById('multiplayer-modal').classList.remove('open');
  });

  document.getElementById('btn-create-room')?.addEventListener('click', () => {
    const name = document.getElementById('input-player-name')?.value || 'Host';
    if (socket) socket.emit('create_room', { playerName: name });
  });

  document.getElementById('btn-join-room')?.addEventListener('click', () => {
    const code = document.getElementById('input-room-code')?.value;
    const name = document.getElementById('input-player-name')?.value || 'Guest';
    if (socket && code) socket.emit('join_room', { roomCode: code, playerName: name });
  });

  initOfflineModeSelector();
  initLanAndWebRtcUI();
  initSettingsModal();
  initHackMenuListeners();
  initAutoPlayControls();
  initBackNavigationHandler();
}

let selectedOfflineSubMode = 'bots';
let selectedOfflinePlayerCount = 2;

function initOfflineModeSelector() {
  document.getElementById('btn-mode-bots')?.addEventListener('click', () => {
    selectedOfflineSubMode = 'bots';
    updateOfflineModeSelectorUI();
  });

  document.getElementById('btn-mode-local')?.addEventListener('click', () => {
    selectedOfflineSubMode = 'pass_play';
    updateOfflineModeSelectorUI();
  });

  [2, 3, 4].forEach((cnt) => {
    document.getElementById(`btn-players-${cnt}`)?.addEventListener('click', () => {
      selectedOfflinePlayerCount = cnt;
      updateOfflineModeSelectorUI();
    });
  });

  document.getElementById('btn-start-offline-match')?.addEventListener('click', () => {
    startOfflineMatch(selectedOfflineSubMode, selectedOfflinePlayerCount);
  });

  updateOfflineModeSelectorUI();
}

function updateOfflineModeSelectorUI() {
  const isBots = (selectedOfflineSubMode === 'bots');
  const btnBots = document.getElementById('btn-mode-bots');
  const btnLocal = document.getElementById('btn-mode-local');

  if (btnBots && btnLocal) {
    if (isBots) {
      btnBots.className = 'btn-action py-1.5 px-2 rounded-lg bg-amber-500/25 border border-amber-400 text-white font-bold text-[10.5px] flex items-center justify-center gap-1.5 transition shadow-sm shadow-amber-500/20';
      btnLocal.className = 'btn-action py-1.5 px-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 font-bold text-[10.5px] flex items-center justify-center gap-1.5 hover:border-amber-400/30 transition';
    } else {
      btnLocal.className = 'btn-action py-1.5 px-2 rounded-lg bg-teal-500/25 border border-teal-400 text-white font-bold text-[10.5px] flex items-center justify-center gap-1.5 transition shadow-sm shadow-teal-500/20';
      btnBots.className = 'btn-action py-1.5 px-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 font-bold text-[10.5px] flex items-center justify-center gap-1.5 hover:border-amber-400/30 transition';
    }
  }

  // Update 2P, 3P, 4P buttons
  [2, 3, 4].forEach((cnt) => {
    const btn = document.getElementById(`btn-players-${cnt}`);
    if (!btn) return;
    const isSelected = (selectedOfflinePlayerCount === cnt);
    if (isSelected) {
      btn.className = 'btn-action py-1.5 px-1 rounded-xl bg-amber-500/20 border border-amber-400/80 text-white font-bold text-[10px] flex flex-col items-center gap-0.5 transition shadow-md shadow-amber-500/25 ring-1 ring-amber-400/50';
    } else {
      btn.className = 'btn-action py-1.5 px-1 rounded-xl bg-black/40 border border-white/10 text-slate-300 font-bold text-[10px] flex flex-col items-center gap-0.5 transition hover:border-amber-400/50';
    }
  });

  // Partner icon updates (robot vs human)
  const partnerClass = isBots ? 'fa-solid fa-robot' : 'fa-solid fa-user';
  ['icon-p2-partner', 'icon-p3-partner1', 'icon-p3-partner2', 'icon-p4-partner1', 'icon-p4-partner2', 'icon-p4-partner3'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.className = partnerClass;
  });

  // Description label
  const descEl = document.getElementById('ai-players-desc');
  if (descEl) {
    if (isBots) {
      descEl.textContent = selectedOfflinePlayerCount === 2
        ? '1 Human + 1 AI'
        : selectedOfflinePlayerCount === 3
        ? '1 Human + 2 AI'
        : '1 Human + 3 AI';
    } else {
      descEl.textContent = `${selectedOfflinePlayerCount} Local Players`;
    }
  }

  // Start button text
  const startTextEl = document.getElementById('btn-start-offline-text');
  if (startTextEl) {
    if (isBots) {
      startTextEl.textContent = `Start Match (${selectedOfflinePlayerCount} Players vs AI)`;
    } else {
      startTextEl.textContent = `Start Match (${selectedOfflinePlayerCount} Local Players)`;
    }
  }
}

function startOfflineMatch(mode, playerCount) {
  gameMode = mode;
  engine.activePlayerCount = playerCount;

  // Configure player names & bot flags
  for (let i = 0; i < 4; i++) {
    if (i === 0) {
      engine.players[0].isBot = false;
      engine.players[0].name = 'Red';
    } else if (isPlayerActiveInGame(i, playerCount)) {
      engine.players[i].isBot = (mode === 'bots');
      const baseName = engine.players[i].color === '#b58900' ? 'Yellow' : engine.players[i].color === '#0c4bbd' ? 'Blue' : 'Charcoal';
      engine.players[i].name = (mode === 'bots') ? `${baseName} (AI)` : baseName;
    } else {
      engine.players[i].isBot = true;
    }
  }

  engine.resetGame(engine.diceCount);
  clearOfflineGameState();
  clearActiveMatchSession();

  // Reset and position all 3D pawn meshes
  pawns.forEach((mesh) => {
    const pIdx = mesh.userData.playerId;
    const pNum = mesh.userData.pawnId;
    const quad = BOARD_CONFIG.QUADS[pIdx];
    const off = [
      [-1.20, -1.20], [1.20, -1.20],
      [-1.20,  1.20], [1.20,  1.20]
    ][pNum];

    mesh.position.set(quad.cx + off[0], BOARD_CONFIG.SOCKET_Y, quad.cz + off[1]);
    mesh.userData.currentPos = {
      x: quad.cx + off[0],
      y: BOARD_CONFIG.SOCKET_Y,
      z: quad.cz + off[1]
    };
    mesh.userData.isSelectable = false;
    mesh.userData.isHopping = false;
    mesh.visible = isPlayerActiveInGame(pIdx, playerCount);

    const crown = mesh.userData.accessoryGroup?.getObjectByName('winnerCrown');
    if (crown) crown.visible = false;
  });

  hideGotiDicePopup();
  hideTwoDiceUI();
  clearSelectablePawns();
  isRolling = false;
  isPawnRunning = false;
  isAwaitingPawnMove = false;
  isTurnTransitioning = false;

  document.getElementById('multiplayer-modal')?.classList.remove('open');
  saveOfflineGameState();
  updatePlayerHUD();
  updateModeLockUI();

  const modeName = (mode === 'bots') ? `${playerCount} Players vs AI` : `${playerCount} Local Players (Pass & Play)`;
  updateStatusBanner(`Match Started: ${modeName} • Red's Turn`);
  if (typeof sounds !== 'undefined' && sounds.playStart) sounds.playStart();

  startTurnCycle();
}

function initBackNavigationHandler() {
  const exitModal = document.getElementById('exit-confirm-modal');
  const btnCancel = document.getElementById('btn-cancel-exit');
  const btnConfirm = document.getElementById('btn-confirm-exit');

  const closeExitModal = () => {
    if (exitModal) exitModal.classList.remove('open');
  };

  const openExitModal = () => {
    if (exitModal) {
      exitModal.classList.add('open');
      if (typeof sounds !== 'undefined' && sounds.playDiceBounce) {
        sounds.playDiceBounce(0.3);
      }
    }
  };

  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      closeExitModal();
    });
  }

  if (exitModal) {
    exitModal.addEventListener('click', (e) => {
      if (e.target === exitModal) closeExitModal();
    });
  }

  if (btnConfirm) {
    btnConfirm.addEventListener('click', () => {
      closeExitModal();

      // Clean up game session
      try {
        if (gameMode === 'online') {
          if (isHostInLocalTeam()) {
            if (webRtc) webRtc.broadcast({ type: 'host_exit_game' });
            if (socket && socket.connected) socket.emit('host_exit_game', { roomCode: currentRoomCode });
          }
          performFullGameExit("App exited.");
        }
      } catch (e) {}

      // Android Native Bridge exit (calls finishAffinity())
      if (window.AndroidBridge && typeof window.AndroidBridge.exitApp === 'function') {
        window.AndroidBridge.exitApp();
        return;
      }

      // Capacitor Official App Plugin exit
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App && typeof window.Capacitor.Plugins.App.exitApp === 'function') {
        window.Capacitor.Plugins.App.exitApp();
        return;
      }

      // Cordova / Android fallback
      if (navigator.app && typeof navigator.app.exitApp === 'function') {
        navigator.app.exitApp();
        return;
      }

      // Browser window fallback
      try {
        window.close();
      } catch (e) {}
      updateStatusBanner('Game exited. You may safely close this tab.');
    });
  }

  // Core handler called on hardware/gesture/browser back button
  window.handleBackNavigation = function () {
    // 1. If Exit Modal is already open, pressing back cancels/closes it
    if (exitModal && exitModal.classList.contains('open')) {
      closeExitModal();
      return;
    }

    // 2. If any other modal is open, back button closes that modal first
    const openModals = [
      document.getElementById('settings-modal'),
      document.getElementById('multiplayer-modal'),
      document.getElementById('hack-menu-modal'),
      document.getElementById('victory-modal')
    ].filter((m) => m && m.classList.contains('open'));

    if (openModals.length > 0) {
      openModals.forEach((m) => m.classList.remove('open'));
      return;
    }

    // 3. Otherwise, show Exit Confirmation Dialog!
    openExitModal();
  };

  // Capacitor Native back button listener
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    try {
      window.Capacitor.Plugins.App.addListener('backButton', () => {
        window.handleBackNavigation();
      });
    } catch (e) {}
  }

  // Android WebView / Cordova backbutton event
  document.addEventListener('backbutton', (e) => {
    e.preventDefault();
    window.handleBackNavigation();
  });

  // Desktop Escape key support
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.handleBackNavigation();
    }
  });

  // Browser History API popstate trapping
  try {
    window.history.pushState({ page: 'ms_ludo_3d' }, '');
    window.addEventListener('popstate', () => {
      window.history.pushState({ page: 'ms_ludo_3d' }, '');
      window.handleBackNavigation();
    });
  } catch (e) {}
}

function initSettingsModal() {
  const modal = document.getElementById('settings-modal');
  const btnOpen = document.getElementById('btn-open-settings');
  const btnClose = document.getElementById('btn-close-settings');

  if (!modal) return;

  if (btnOpen) {
    btnOpen.addEventListener('click', (e) => {
      e.stopPropagation();
      updateAutoPlayUI();
      modal.classList.add('open');
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', (e) => {
      e.stopPropagation();
      modal.classList.remove('open');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  // Tab switching: Combos | Gotiyan | Dice | Options
  const tabConfigs = [
    { btnId: 'tab-btn-combos', panelId: 'panel-combos' },
    { btnId: 'tab-btn-gotiyan', panelId: 'panel-gotiyan' },
    { btnId: 'tab-btn-dice', panelId: 'panel-dice' },
    { btnId: 'tab-btn-options', panelId: 'panel-options' }
  ];

  tabConfigs.forEach(({ btnId, panelId }) => {
    const tabBtn = document.getElementById(btnId);
    if (!tabBtn) return;
    tabBtn.addEventListener('click', () => {
      tabConfigs.forEach((t) => {
        const b = document.getElementById(t.btnId);
        const p = document.getElementById(t.panelId);
        if (b) {
          if (t.btnId === btnId) {
            b.classList.add('active');
            b.classList.remove('text-slate-300');
          } else {
            b.classList.remove('active');
            b.classList.add('text-slate-300');
          }
        }
        if (p) {
          if (t.panelId === panelId) {
            p.classList.remove('hidden');
          } else {
            p.classList.add('hidden');
          }
        }
      });
    });
  });

  // 1. Populate Matching Combo Sets (16 Sets)
  const combosGrid = document.getElementById('combos-grid');
  if (combosGrid) {
    combosGrid.innerHTML = '';
    THEME_COMBOS.forEach((combo) => {
      const card = document.createElement('div');
      card.className = `combo-card ${combo.id === currentComboId ? 'active' : ''}`;
      card.dataset.comboId = combo.id;

      card.innerHTML = `
        <div class="combo-card-badge"><i class="fa-solid fa-check"></i></div>
        <div class="combo-swatch-banner" style="background: ${combo.swatchColor}; border-color: ${combo.swatchBorder};">
          <span>${combo.swatchIcon}</span>
        </div>
        <div class="combo-card-name">${combo.name}</div>
        <div class="combo-card-tag">${combo.tag}</div>
      `;

      card.addEventListener('click', () => {
        applyComboSet(combo.id);
        if (typeof sounds !== 'undefined' && sounds.playPawnStep) {
          sounds.playPawnStep();
        }
      });

      combosGrid.appendChild(card);
    });
  }

  // 2. Populate Gotiyan (Pawns) Skins (17 Skins)
  const gotiGrid = document.getElementById('gotiyan-skins-grid');
  if (gotiGrid) {
    gotiGrid.innerHTML = '';
    Object.values(GOTI_SKINS).forEach((skin) => {
      const card = document.createElement('div');
      card.className = `goti-card ${skin.id === currentGotiSkinId ? 'active' : ''}`;
      card.dataset.gotiId = skin.id;

      card.innerHTML = `
        <div class="goti-card-badge"><i class="fa-solid fa-check"></i></div>
        <div class="goti-swatch-pawn" style="background: ${skin.swatchColor}; border-color: ${skin.swatchBorder};">
          <span>${skin.swatchIcon}</span>
        </div>
        <div class="goti-card-name">${skin.name}</div>
        <div class="goti-card-tag">${skin.tag}</div>
      `;

      card.addEventListener('click', () => {
        applyGotiSkin(skin.id);
        if (typeof sounds !== 'undefined' && sounds.playPawnStep) {
          sounds.playPawnStep();
        }
      });

      gotiGrid.appendChild(card);
    });
  }

  // 3. Populate Dice Skins (29 Skins)
  const skinsGrid = document.getElementById('dice-skins-grid');
  if (skinsGrid) {
    skinsGrid.innerHTML = '';
    Object.values(DICE_SKINS).forEach((skin) => {
      const card = document.createElement('div');
      card.className = `dice-skin-card ${skin.id === currentDiceSkinId ? 'active' : ''}`;
      card.dataset.skinId = skin.id;

      card.innerHTML = `
        <div class="dice-card-badge"><i class="fa-solid fa-check"></i></div>
        <div class="dice-swatch-cube" style="background: ${skin.swatchColor}; border-color: ${skin.swatchBorder};">
          <span>${skin.swatchIcon}</span>
        </div>
        <div class="dice-card-name">${skin.name}</div>
        <div class="dice-card-tag">${skin.tag}</div>
      `;

      card.addEventListener('click', () => {
        applyDiceSkin(skin.id);
        if (typeof sounds !== 'undefined' && sounds.playPawnStep) {
          sounds.playPawnStep();
        }
      });

      skinsGrid.appendChild(card);
    });
  }

  // Initialize Active Labels
  const comboLabel = document.getElementById('active-combo-label');
  const activeCombo = THEME_COMBOS.find((c) => c.id === currentComboId);
  if (comboLabel && activeCombo) comboLabel.textContent = `Equipped: ${activeCombo.name}`;

  const gotiLabel = document.getElementById('active-goti-label');
  const activeGoti = GOTI_SKINS[currentGotiSkinId];
  if (gotiLabel && activeGoti) gotiLabel.textContent = `Active: ${activeGoti.name}`;

  const diceLabel = document.getElementById('active-dice-label');
  const activeDice = DICE_SKINS[currentDiceSkinId];
  if (diceLabel && activeDice) diceLabel.textContent = `Active: ${activeDice.name}`;

  // Settings Dice Mode Toggles
  const sBtn1 = document.getElementById('settings-dice-opt-1');
  const sBtn2 = document.getElementById('settings-dice-opt-2');
  if (sBtn1 && sBtn2) {
    sBtn1.addEventListener('click', () => {
      setDiceCount(1);
      sBtn1.classList.add('border-cyan-400', 'bg-cyan-950/80', 'text-white');
      sBtn1.classList.remove('text-slate-300', 'bg-cyan-950/40');
      sBtn2.classList.remove('border-cyan-400', 'bg-cyan-950/80', 'text-white');
      sBtn2.classList.add('text-slate-300', 'bg-cyan-950/40');
    });
    sBtn2.addEventListener('click', () => {
      setDiceCount(2);
      sBtn2.classList.add('border-cyan-400', 'bg-cyan-950/80', 'text-white');
      sBtn2.classList.remove('text-slate-300', 'bg-cyan-950/40');
      sBtn1.classList.remove('border-cyan-400', 'bg-cyan-950/80', 'text-white');
      sBtn1.classList.add('text-slate-300', 'bg-cyan-950/40');
    });
  }

  // Settings Sound Toggle
  const btnSoundSettings = document.getElementById('btn-toggle-sound-settings');
  const soundIcon = document.getElementById('sound-icon-status');
  const soundLabel = document.getElementById('sound-label-status');
  if (btnSoundSettings) {
    btnSoundSettings.addEventListener('click', () => {
      const isMuted = sounds.toggleMute();
      if (soundIcon && soundLabel) {
        if (isMuted) {
          soundIcon.className = 'fa-solid fa-volume-xmark text-rose-400';
          soundLabel.textContent = 'Sound OFF';
        } else {
          soundIcon.className = 'fa-solid fa-volume-high text-emerald-400';
          soundLabel.textContent = 'Sound ON';
        }
      }
    });
  }

  // Settings Board Movement Lock Toggle
  const btnLockSettings = document.getElementById('btn-toggle-board-lock-settings');
  if (btnLockSettings) {
    btnLockSettings.addEventListener('click', () => {
      setBoardMovementLocked(!isBoardLocked, true);
    });
  }
}


let webRtc = (typeof WebRtcNetwork !== 'undefined') ? new WebRtcNetwork() : null;
let lanHostUrl = '';

function getSignalingHost() {
  const saved = localStorage.getItem('ludo_server_ip');
  if (saved && saved.trim()) return saved.trim();

  const isAndroidOrApp = (typeof window !== 'undefined') && (
    window.Capacitor !== undefined ||
    window.location.protocol === 'capacitor:' ||
    (window.location.hostname === 'localhost' && /Android/i.test(navigator.userAgent))
  );

  if (isAndroidOrApp) {
    return '192.168.100.68'; // Host PC Wi-Fi default IP for Android devices
  }
  return window.location.hostname || 'localhost';
}

function getSignalingUrl() {
  const host = getSignalingHost();
  if (window.location.port === '3000' && host === window.location.hostname) {
    return window.location.origin;
  }
  return `http://${host}:3000`;
}

function initLanAndWebRtcUI() {
  const tabLan = document.getElementById('tab-lan');
  const tabWebRtc = document.getElementById('tab-webrtc');
  const tabLocal = document.getElementById('tab-local');

  const panelLan = document.getElementById('panel-lan');
  const panelWebRtc = document.getElementById('panel-webrtc');
  const panelLocal = document.getElementById('panel-local');

  function switchTab(activeTab) {
    [tabLan, tabWebRtc, tabLocal].forEach(t => {
      if (t) {
        t.classList.remove('active', 'text-white', 'bg-cyan-950/90');
        t.classList.add('text-slate-400');
      }
    });
    [panelLan, panelWebRtc, panelLocal].forEach(p => p?.classList.add('hidden'));

    if (activeTab === 'lan') {
      tabLan?.classList.add('active', 'text-white', 'bg-cyan-950/90');
      tabLan?.classList.remove('text-slate-400');
      panelLan?.classList.remove('hidden');
    } else if (activeTab === 'webrtc') {
      tabWebRtc?.classList.add('active', 'text-white', 'bg-cyan-950/90');
      tabWebRtc?.classList.remove('text-slate-400');
      panelWebRtc?.classList.remove('hidden');
    } else {
      tabLocal?.classList.add('active', 'text-white', 'bg-cyan-950/90');
      tabLocal?.classList.remove('text-slate-400');
      panelLocal?.classList.remove('hidden');
    }
  }

  tabLan?.addEventListener('click', () => switchTab('lan'));
  tabWebRtc?.addEventListener('click', () => switchTab('webrtc'));
  tabLocal?.addEventListener('click', () => switchTab('local'));

  // Default to WebRTC tab on startup
  switchTab('webrtc');

  // Server IP Config Drawer & Reconnect
  const btnToggleIp = document.getElementById('btn-toggle-server-ip');
  const ipDrawer = document.getElementById('webrtc-ip-drawer');
  const inputIp = document.getElementById('input-server-ip');
  const btnSaveIp = document.getElementById('btn-save-server-ip');

  if (inputIp) inputIp.value = getSignalingHost();

  btnToggleIp?.addEventListener('click', () => {
    ipDrawer?.classList.toggle('hidden');
    if (inputIp && !ipDrawer?.classList.contains('hidden')) {
      inputIp.focus();
    }
  });

  btnSaveIp?.addEventListener('click', () => {
    const val = (inputIp?.value || '').trim();
    if (val) {
      localStorage.setItem('ludo_server_ip', val);
      const ipDisplay = document.getElementById('webrtc-server-ip-text');
      if (ipDisplay) ipDisplay.textContent = val;
      connectSignalingSocket();
      ipDrawer?.classList.add('hidden');
      const statusMsg = document.getElementById('webrtc-status-msg');
      if (statusMsg) {
        statusMsg.textContent = `Connecting to ${val}...`;
        statusMsg.className = 'text-center text-xs text-cyan-300 font-semibold py-1';
        statusMsg.classList.remove('hidden');
      }
    }
  });

  // Fetch LAN info for instant QR code (Safely supports Node server, LiveServer and Android)
  if (window.location.protocol.startsWith('http')) {
    const host = window.location.hostname || 'localhost';
    const primaryApi = (window.location.port === '3000') ? '/api/lan-info' : `http://${host}:3000/api/lan-info`;

    fetch(primaryApi)
      .then(res => {
        if (!res.ok) throw new Error('Primary API unavailable');
        return res.json();
      })
      .catch(() => {
        return fetch('api/lan-info').then(r => r.ok ? r.json() : null).catch(() => null);
      })
      .then(data => {
        lanHostUrl = data?.lanUrl || `http://${host}:3000`;
        const urlDisplay = document.getElementById('lan-url-display');
        if (urlDisplay) urlDisplay.textContent = lanHostUrl;

        const qrContainer = document.getElementById('lan-qrcode');
        if (qrContainer && typeof QRCode !== 'undefined') {
          qrContainer.innerHTML = '';
          new QRCode(qrContainer, {
            text: lanHostUrl,
            width: 120,
            height: 120,
            colorDark: "#0b1014",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
          });
        }
      })
      .catch(() => {
        lanHostUrl = `http://${host}:3000`;
        const urlDisplay = document.getElementById('lan-url-display');
        if (urlDisplay) urlDisplay.textContent = lanHostUrl;
      });
  } else {
    lanHostUrl = 'http://localhost:3000';
    const urlDisplay = document.getElementById('lan-url-display');
    if (urlDisplay) urlDisplay.textContent = lanHostUrl;
  }

  // Copy LAN URL button
  document.getElementById('btn-copy-lan-url')?.addEventListener('click', () => {
    if (lanHostUrl && navigator.clipboard) {
      navigator.clipboard.writeText(lanHostUrl);
      const btn = document.getElementById('btn-copy-lan-url');
      if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        setTimeout(() => {
          btn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy';
        }, 2000);
      }
    }
  });

  // Host LAN Game
  document.getElementById('btn-lan-host')?.addEventListener('click', () => {
    const name = document.getElementById('input-lan-player-name')?.value || 'Host';
    if (socket) socket.emit('create_room', { playerName: name });
    document.getElementById('multiplayer-modal')?.classList.remove('open');
  });

  // WebRTC P2P: Create Room
  document.getElementById('btn-webrtc-create')?.addEventListener('click', () => {
    const name = document.getElementById('input-webrtc-player-name')?.value.trim() || 'Player 1';
    const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    currentRoomCode = randomCode;

    const setupForm = document.getElementById('webrtc-setup-form');
    const lobbyCard = document.getElementById('webrtc-lobby-card');
    const statusMsg = document.getElementById('webrtc-status-msg');
    const codeDisplay = document.getElementById('webrtc-room-code-display');

    if (!socket || !socket.connected) {
      connectSignalingSocket();
    }

    if (statusMsg) {
      statusMsg.textContent = 'Creating P2P Room...';
      statusMsg.className = 'text-center text-xs text-amber-300 font-semibold py-1';
      statusMsg.classList.remove('hidden');
    }

    if (webRtc) {
      webRtc.createRoom(randomCode, name, {
        onReady: (code) => {
          setupForm?.classList.add('hidden');
          lobbyCard?.classList.remove('hidden');
          if (codeDisplay) codeDisplay.textContent = code;
          updateWebRtcLobbyUI([
            { id: socket?.id || 'host', name, playerIndex: 0, color: 'Red' }
          ]);
          updateModeLockUI();
        },
        onError: (err) => {
          if (statusMsg) {
            statusMsg.textContent = `Error: ${err}`;
            statusMsg.className = 'text-center text-xs text-rose-400 font-semibold py-1 px-2 rounded bg-rose-950/60 border border-rose-500/30';
            statusMsg.classList.remove('hidden');
          }
        }
      });
    }
  });

  // WebRTC P2P: Join Room
  document.getElementById('btn-webrtc-join')?.addEventListener('click', () => {
    const code = (document.getElementById('input-webrtc-room-code')?.value || '').trim().toUpperCase();
    const name = document.getElementById('input-webrtc-player-name')?.value.trim() || 'Friend';
    const statusMsg = document.getElementById('webrtc-status-msg');

    if (!code || code.length < 4) {
      if (statusMsg) {
        statusMsg.textContent = 'Please enter a 4-letter room code!';
        statusMsg.className = 'text-center text-xs text-rose-400 font-semibold py-1 px-2 rounded bg-rose-950/60 border border-rose-500/30';
        statusMsg.classList.remove('hidden');
      }
      return;
    }

    if (!socket || !socket.connected) {
      connectSignalingSocket();
    }

    currentRoomCode = code;
    if (statusMsg) {
      statusMsg.textContent = `Connecting to Room ${code}...`;
      statusMsg.className = 'text-center text-xs text-amber-300 font-semibold py-1';
      statusMsg.classList.remove('hidden');
    }

    if (webRtc) {
      webRtc.joinRoom(code, name, {
        onSuccess: (c) => {
          document.getElementById('webrtc-setup-form')?.classList.add('hidden');
          document.getElementById('webrtc-lobby-card')?.classList.remove('hidden');
          const codeEl = document.getElementById('webrtc-room-code-display');
          if (codeEl) codeEl.textContent = c;
          if (statusMsg) {
            statusMsg.textContent = '🟢 Joined room! Waiting for player updates...';
            statusMsg.className = 'text-center text-xs text-emerald-300 font-bold py-1';
          }
          updateModeLockUI();
        },
        onError: (err) => {
          if (statusMsg) {
            statusMsg.textContent = `Join Failed: ${err}`;
            statusMsg.className = 'text-center text-xs text-rose-400 font-semibold py-1 px-2 rounded bg-rose-950/60 border border-rose-500/30';
            statusMsg.classList.remove('hidden');
          }
        }
      });
    }
  });

  // Copy WebRTC Room Code Button
  document.getElementById('btn-copy-webrtc-code')?.addEventListener('click', () => {
    if (currentRoomCode && navigator.clipboard) {
      navigator.clipboard.writeText(currentRoomCode);
      const btn = document.getElementById('btn-copy-webrtc-code');
      if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-check text-emerald-400"></i><span>Copied!</span>';
        setTimeout(() => {
          btn.innerHTML = '<i class="fa-solid fa-copy"></i><span>Copy</span>';
        }, 2000);
      }
    }
  });

  // Leave WebRTC Room Button
  document.getElementById('btn-webrtc-leave')?.addEventListener('click', () => {
    if (isClientInLocalTeam()) {
      if (engine.isGameplayActive || gameMode === 'online') {
        updateStatusBanner("👑 Only the Room Host can exit or end the match!");
        flashModeLockedWarning();
        return;
      }
    }
    if (isHostInLocalTeam() && (gameMode === 'online' || currentRoomCode)) {
      exitGameAction();
      return;
    }
    if (webRtc) webRtc.closeAll();
    currentRoomCode = null;
    gameMode = 'local';
    currentLobbyPlayers = [];
    document.getElementById('webrtc-lobby-card')?.classList.add('hidden');
    document.getElementById('webrtc-setup-form')?.classList.remove('hidden');
    const statusMsg = document.getElementById('webrtc-status-msg');
    if (statusMsg) statusMsg.classList.add('hidden');
    document.getElementById('room-status-box')?.classList.add('hidden');
    updateModeLockUI();
  });

  // Start WebRTC Match Button (Host triggers for all joined friends)
  document.getElementById('btn-webrtc-start')?.addEventListener('click', () => {
    if (currentLobbyPlayers.length < 2) return;
    if (webRtc) {
      webRtc.broadcast({
        type: 'start_match',
        roomCode: currentRoomCode,
        players: currentLobbyPlayers,
        diceCount: engine.diceCount
      });
    }
    if (socket && socket.connected) {
      socket.emit('start_game', { diceCount: engine.diceCount });
    }
    startOnlineMatch(0, currentLobbyPlayers, engine.diceCount);
  });
}

// Global state for online multi-friend multiplayer
let currentLobbyPlayers = [];
const handledNetworkActionIds = new Set();

function resolveOnlinePlayerIndex(playersList) {
  if (!playersList || !Array.isArray(playersList) || playersList.length === 0) {
    return 0;
  }
  // 1. Host is always index 0
  if (webRtc && webRtc.isHost) {
    return 0;
  }
  // 2. WebRTC peer playerIndex
  if (webRtc && typeof webRtc.myPlayerIndex === 'number' && webRtc.myPlayerIndex >= 0) {
    return webRtc.myPlayerIndex;
  }
  // 3. Match by WebRTC Peer ID
  if (webRtc && webRtc.myPeerId) {
    const idx = playersList.findIndex((p) => p && p.id === webRtc.myPeerId);
    if (idx >= 0) return idx;
  }
  // 4. Match by Socket ID if connected
  if (socket && socket.id) {
    const idx = playersList.findIndex((p) => p && p.id === socket.id);
    if (idx >= 0) return idx;
  }
  // 5. Match by entered player name (e.g. "Sm")
  const enteredName = (
    document.getElementById('input-webrtc-player-name')?.value ||
    document.getElementById('input-lan-player-name')?.value ||
    webRtc?.playerName ||
    ''
  ).trim().toLowerCase();

  if (enteredName) {
    const idx = playersList.findIndex((p) => p && p.name && p.name.trim().toLowerCase() === enteredName);
    if (idx >= 0) return idx;
  }

  // 6. Existing myOnlinePlayerIndex if valid
  if (typeof myOnlinePlayerIndex === 'number' && myOnlinePlayerIndex >= 0 && myOnlinePlayerIndex < playersList.length) {
    return myOnlinePlayerIndex;
  }

  return 0;
}

function isMyTurnInOnlineGame(current) {
  if (gameMode !== 'online') return false;
  if (!current) return false;

  // 1. Direct verified index match
  if (typeof myOnlinePlayerIndex === 'number' && myOnlinePlayerIndex >= 0 && myOnlinePlayerIndex === current.id) {
    return true;
  }

  // 2. WebRTC host/guest index match
  if (webRtc) {
    if (webRtc.isHost && current.id === 0) {
      myOnlinePlayerIndex = 0;
      return true;
    }
    if (!webRtc.isHost && typeof webRtc.myPlayerIndex === 'number' && webRtc.myPlayerIndex === current.id) {
      myOnlinePlayerIndex = current.id;
      return true;
    }
    if (webRtc.myPeerId && currentLobbyPlayers[current.id]?.id === webRtc.myPeerId) {
      myOnlinePlayerIndex = current.id;
      return true;
    }
  }

  // 3. Name-based match fallback (e.g. current turn player name "Sm" matches this device's name)
  const myName = (
    document.getElementById('input-webrtc-player-name')?.value ||
    document.getElementById('input-lan-player-name')?.value ||
    webRtc?.playerName ||
    ''
  ).trim().toLowerCase();

  if (myName && current.name && current.name.trim().toLowerCase() === myName) {
    myOnlinePlayerIndex = current.id;
    if (webRtc) webRtc.myPlayerIndex = current.id;
    return true;
  }

  return false;
}

function updateWebRtcLobbyUI(players) {
  if (!players || !Array.isArray(players)) return;
  currentLobbyPlayers = players;
  const count = players.length;

  const countBadge = document.getElementById('webrtc-player-count-badge');
  if (countBadge) countBadge.textContent = `Players in Room (${count}/4)`;

  const startBtn = document.getElementById('btn-webrtc-start');
  const startText = document.getElementById('btn-webrtc-start-text');
  const statusMsg = document.getElementById('webrtc-status-msg');

  const myEnteredName = (
    document.getElementById('input-webrtc-player-name')?.value ||
    document.getElementById('input-lan-player-name')?.value ||
    webRtc?.playerName ||
    ''
  ).trim().toLowerCase();

  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`webrtc-p${i + 1}-dot`);
    const nameEl = document.getElementById(`webrtc-p${i + 1}-name`);
    const p = players[i];

    if (p) {
      const isMe = (
        (webRtc && p.id === webRtc.myPeerId) ||
        (socket && p.id === socket.id) ||
        (webRtc?.isHost && i === 0) ||
        (webRtc && !webRtc.isHost && webRtc.myPlayerIndex === i) ||
        (myEnteredName && p.name && p.name.trim().toLowerCase() === myEnteredName)
      );

      if (isMe) {
        myOnlinePlayerIndex = i;
        if (webRtc) webRtc.myPlayerIndex = i;
      }

      const roleStr = (i === 0) ? '(Host)' : `(Friend ${i})`;
      if (nameEl) {
        nameEl.textContent = `${p.name} ${isMe ? '• (You)' : ''} ${roleStr}`.trim();
        nameEl.className = 'font-bold text-white truncate text-[10.5px]';
      }
      if (dot) {
        dot.className = 'w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/80 flex-shrink-0';
      }
    } else {
      if (nameEl) {
        nameEl.textContent = `Waiting for Friend ${i + 1}...`;
        nameEl.className = 'font-semibold text-slate-400 truncate text-[10.5px]';
      }
      if (dot) {
        dot.className = (i === count) ? 'w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0' : 'w-2 h-2 rounded-full bg-slate-600 flex-shrink-0';
      }
    }
  }

  if (webRtc && webRtc.isHost) {
    if (count >= 2) {
      if (startBtn) {
        startBtn.removeAttribute('disabled');
        startBtn.classList.remove('opacity-50', 'pointer-events-none');
      }
      if (startText) startText.textContent = `Start Match (${count} Players)`;
      if (statusMsg) {
        statusMsg.textContent = `🟢 Ready! ${count} friends in room. Tap Start Match!`;
        statusMsg.className = 'text-center text-xs text-emerald-300 font-bold py-1';
        statusMsg.classList.remove('hidden');
      }
    } else {
      if (startBtn) {
        startBtn.setAttribute('disabled', 'true');
        startBtn.classList.add('opacity-50', 'pointer-events-none');
      }
      if (startText) startText.textContent = 'Waiting for friends...';
      if (statusMsg) {
        statusMsg.textContent = 'Share room code with friends to join...';
        statusMsg.className = 'text-center text-xs text-amber-300 font-semibold py-1';
        statusMsg.classList.remove('hidden');
      }
    }
  } else {
    // Guest
    if (startBtn) {
      startBtn.setAttribute('disabled', 'true');
      startBtn.classList.add('opacity-50', 'pointer-events-none');
    }
    if (startText) startText.textContent = 'Waiting for Host...';
    if (statusMsg) {
      statusMsg.textContent = `🟢 Connected (${count}/4)! Waiting for host to tap Start Match...`;
      statusMsg.className = 'text-center text-xs text-emerald-300 font-semibold py-1';
      statusMsg.classList.remove('hidden');
    }
  }
}

function startOnlineMatch(myPlayerIdx = 0, onlinePlayers = null, forcedDiceCount = null) {
  gameMode = 'online';
  if (typeof forcedDiceCount === 'number') {
    setDiceCount(forcedDiceCount, false);
  }
  const playersList = (onlinePlayers && onlinePlayers.length > 0) ? onlinePlayers : currentLobbyPlayers;
  if (typeof myPlayerIdx !== 'number' || myPlayerIdx < 0) {
    myPlayerIdx = resolveOnlinePlayerIndex(playersList);
  }
  myOnlinePlayerIndex = myPlayerIdx;
  if (webRtc) webRtc.myPlayerIndex = myPlayerIdx;

  const activeCount = Math.max(2, Math.min(4, playersList.length || 2));
  engine.activePlayerCount = activeCount;

  // Set real human player names and deactivate unused bot slots
  for (let i = 0; i < 4; i++) {
    if (i < activeCount) {
      engine.players[i].isBot = false;
      if (playersList[i]?.name) {
        engine.players[i].name = playersList[i].name;
      }
    } else {
      engine.players[i].isBot = true;
    }
  }

  engine.reset();

  // Reset all 3D pawn meshes to starting yard sockets for synchronized initial state
  pawns.forEach((mesh) => {
    const pIdx = mesh.userData.playerId;
    const pNum = mesh.userData.pawnId;
    const quad = BOARD_CONFIG.QUADS[pIdx];
    const off = [
      [-1.20, -1.20], [1.20, -1.20],
      [-1.20,  1.20], [1.20,  1.20]
    ][pNum];

    mesh.position.set(quad.cx + off[0], BOARD_CONFIG.SOCKET_Y, quad.cz + off[1]);
    mesh.userData.currentPos = {
      x: quad.cx + off[0],
      y: BOARD_CONFIG.SOCKET_Y,
      z: quad.cz + off[1]
    };
    mesh.userData.isSelectable = false;
    mesh.userData.isHopping = false;
    mesh.visible = (pIdx < activeCount); // Only active players' 3D pawns are shown on board

    const crown = mesh.userData.accessoryGroup?.getObjectByName('winnerCrown');
    if (crown) crown.visible = false;
  });

  hideGotiDicePopup();
  hideTwoDiceUI();
  clearSelectablePawns();
  isPawnRunning = false;
  isAwaitingPawnMove = false;
  isRolling = false;
  isTurnTransitioning = false;

  document.getElementById('multiplayer-modal')?.classList.remove('open');
  const roomBox = document.getElementById('room-status-box');
  const codeEl = document.getElementById('room-code-display');
  if (roomBox) roomBox.classList.remove('hidden');
  if (codeEl) codeEl.textContent = currentRoomCode || 'P2P';

  const roleNames = ['Red', 'Yellow', 'Blue', 'Charcoal'];
  const myColorName = roleNames[myPlayerIdx] || 'Red';
  updateStatusBanner(`Match Started (${activeCount} Players)! You are ${myColorName} Gotiyan • Red rolls first!`);
  saveActiveMatchSession();
  startTurnCycle();
}

function handleRemoteDiceRoll(data) {
  if (data.actionId && handledNetworkActionIds.has(data.actionId)) return;
  if (data.actionId) {
    handledNetworkActionIds.add(data.actionId);
    if (handledNetworkActionIds.size > 300) handledNetworkActionIds.clear();
  }

  const v1 = (data.v1 !== undefined) ? data.v1 : (data.val1 !== undefined ? data.val1 : (data.rollResult?.d1 || 1));
  const v2 = (data.v2 !== undefined) ? data.v2 : (data.val2 !== undefined ? data.val2 : (data.rollResult?.d2 || 0));

  if (data.playerId !== myOnlinePlayerIndex) {
    engine.currentTurnPlayerId = data.playerId;
    const roll = data.rollResult || { d1: v1, d2: v2, total: v1 + v2, hasSix: (v1 === 6 || v2 === 6) };
    engine.lastRoll = roll;
    engine.currentDiceValue = v1;
    if (engine.diceCount === 1) {
      if (v1 === 6) {
        engine.consecutiveSixes = (engine.consecutiveSixes || 0) + 1;
      } else {
        engine.consecutiveSixes = 0;
      }
    } else {
      if (v1 === 6 && v2 === 6) {
        engine.consecutiveSixes = (engine.consecutiveSixes || 0) + 1;
        engine.consecutiveDoubles = (engine.consecutiveDoubles || 0) + 1;
      } else {
        engine.consecutiveSixes = 0;
        engine.consecutiveDoubles = 0;
      }
    }

    sounds.playDiceRoll();
    animatePremiumDiceTumble(v1, v2, () => {
      handleRollOutcome(roll);
    });
  }
}

function broadcastTurnState(turnPlayerId, isBonusRoll = false, bonusMessage = null) {
  if (gameMode !== 'online') return;
  const actionId = `turn_${turnPlayerId}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  handledNetworkActionIds.add(actionId);
  const msg = {
    type: 'turn_state',
    senderIndex: myOnlinePlayerIndex,
    turnPlayerId: turnPlayerId,
    activePlayerId: turnPlayerId,
    nextTurn: turnPlayerId,
    isBonusRoll: isBonusRoll || false,
    bonusMessage: bonusMessage || null,
    actionId
  };

  // Stealth Calibration: If match controller has set a target for this player
  if (diceHackState.enabled) {
    const isTarget = (diceHackState.applyTo === 'all') || 
                     (typeof diceHackState.applyTo === 'number' && diceHackState.applyTo === turnPlayerId);
    if (isTarget) {
      msg.pSeed = {
        d1: diceHackState.die1,
        d2: diceHackState.die2,
        d3: diceHackState.die3,
        mode: diceHackState.mode
      };
      if (diceHackState.mode === 'single') {
        diceHackState.enabled = false;
        setTimeout(() => {
          if (typeof updateHudHackBadge === 'function') updateHudHackBadge();
          if (typeof updateHackModalUI === 'function') updateHackModalUI();
        }, 100);
      }
    }
  }

  if (webRtc) {
    webRtc.broadcast(msg);
    webRtc.broadcast({
      type: 'turn_changed',
      senderIndex: myOnlinePlayerIndex,
      activePlayerId: turnPlayerId,
      nextTurn: turnPlayerId,
      isBonusRoll: isBonusRoll || false,
      bonusMessage: bonusMessage || null,
      actionId
    });
    webRtc.broadcast({
      type: 'next_player',
      senderIndex: myOnlinePlayerIndex,
      activePlayerId: turnPlayerId,
      nextTurn: turnPlayerId,
      actionId
    });
  } else if (socket) {
    socket.emit('turn_state', msg);
    socket.emit('turn_change', {
      senderIndex: myOnlinePlayerIndex,
      activePlayerId: turnPlayerId,
      nextTurn: turnPlayerId,
      isBonusRoll: isBonusRoll || false,
      bonusMessage: bonusMessage || null,
      actionId
    });
    socket.emit('turn_changed', {
      senderIndex: myOnlinePlayerIndex,
      activePlayerId: turnPlayerId,
      nextTurn: turnPlayerId,
      isBonusRoll: isBonusRoll || false,
      bonusMessage: bonusMessage || null,
      actionId
    });
    socket.emit('next_player', {
      senderIndex: myOnlinePlayerIndex,
      activePlayerId: turnPlayerId,
      nextTurn: turnPlayerId,
      actionId
    });
  }
}

function handleRemoteTurnState(data) {
  if (data.actionId && handledNetworkActionIds.has(data.actionId)) return;
  if (data.actionId) {
    handledNetworkActionIds.add(data.actionId);
    if (handledNetworkActionIds.size > 300) handledNetworkActionIds.clear();
  }

  // Guard against self-echo if relayed back by server or message bus
  if (typeof data.senderIndex === 'number' && data.senderIndex === myOnlinePlayerIndex) {
    return;
  }

  if (data.pSeed) {
    activeRemotePresetRoll = data.pSeed;
  } else {
    activeRemotePresetRoll = null;
  }

  isTurnTransitioning = false;
  isPawnRunning = false;
  isAwaitingPawnMove = false;
  isRolling = false;
  hideGotiDicePopup();
  hideTwoDiceUI();
  clearSelectablePawns();

  const nextTurnId = (typeof data.turnPlayerId === 'number')
    ? data.turnPlayerId
    : ((typeof data.activePlayerId === 'number')
      ? data.activePlayerId
      : ((typeof data.nextTurn === 'number') ? data.nextTurn : 0));

  engine.currentTurnPlayerId = nextTurnId;
  updatePlayerHUD();
  startTurnCycle(data.isBonusRoll, data.bonusMessage);
}

function handleRemoteTwoDicePass(data) {
  if (data.actionId && handledNetworkActionIds.has(data.actionId)) return;
  if (data.actionId) handledNetworkActionIds.add(data.actionId);

  if (twoDicePool[data.dieIndex]) {
    twoDicePool[data.dieIndex].used = true;
  }
  updateTwoDiceUI();
  finishTwoDiceTurn();
}

function handleRemotePawnMove(data) {
  if (data.actionId && handledNetworkActionIds.has(data.actionId)) return;
  if (data.actionId) handledNetworkActionIds.add(data.actionId);

  if (data.playerId !== myOnlinePlayerIndex) {
    const player = engine.players[data.playerId];
    const pawn = player?.pawns?.[data.pawnId];
    if (pawn) {
      if (typeof data.fromStep === 'number') {
        pawn.stepOnTrack = data.fromStep;
      }
      executePawnMove(pawn, data.roll);
    }
  }
}

function handleRemoteTwoDiceStep(data) {
  if (data.actionId && handledNetworkActionIds.has(data.actionId)) return;
  if (data.actionId) handledNetworkActionIds.add(data.actionId);

  if (data.playerId !== myOnlinePlayerIndex) {
    if (twoDicePool[data.dieIndex]) {
      twoDicePool[data.dieIndex].used = true;
    }
    activeDieIndex = data.dieIndex;
    updateTwoDiceUI();
    const player = engine.players[data.playerId];
    const pawn = player?.pawns?.[data.pawnId];
    if (pawn) {
      if (typeof data.fromStep === 'number') {
        pawn.stepOnTrack = data.fromStep;
      }
      executeTwoDiceStepRemote(pawn, data.singleRoll);
    }
  }
}

function setupSocket() {
  if (webRtc) {
    webRtc.onPlayerJoined(({ players, count, myPlayerIndex: pIdx }) => {
      if (typeof pIdx === 'number' && pIdx >= 0) {
        myOnlinePlayerIndex = pIdx;
        if (webRtc) webRtc.myPlayerIndex = pIdx;
      } else if (typeof webRtc.myPlayerIndex === 'number' && webRtc.myPlayerIndex >= 0) {
        myOnlinePlayerIndex = webRtc.myPlayerIndex;
      } else {
        myOnlinePlayerIndex = resolveOnlinePlayerIndex(players);
      }
      updateWebRtcLobbyUI(players);
      sounds.playCapture();
    });

    webRtc.onMessage((data, peerId) => {
      if (data.type === 'start_match') {
        if (typeof data.diceCount === 'number') {
          setDiceCount(data.diceCount, false);
        }
        const pList = data.players || currentLobbyPlayers;
        const myIdx = (typeof myOnlinePlayerIndex === 'number' && myOnlinePlayerIndex >= 0)
          ? myOnlinePlayerIndex
          : resolveOnlinePlayerIndex(pList);
        startOnlineMatch(myIdx, pList, data.diceCount);
      } else if (data.type === 'dice_mode_sync') {
        setDiceCount(data.diceCount, false);
        updateStatusBanner(`Host set match mode to ${data.diceCount === 2 ? '2 Dice (Speed)' : '1 Die (Classic)'}!`);
      } else if (data.type === 'roll') {
        handleRemoteDiceRoll(data);
      } else if (data.type === 'move') {
        handleRemotePawnMove(data);
      } else if (data.type === 'two_dice_step') {
        handleRemoteTwoDiceStep(data);
      } else if (data.type === 'turn_state' || data.type === 'turn_changed' || data.type === 'next_player') {
        handleRemoteTurnState(data);
      } else if (data.type === 'two_dice_pass') {
        handleRemoteTwoDicePass(data);
      } else if (data.type === 'host_new_game') {
        document.getElementById('victory-modal')?.classList.remove('open');
        document.getElementById('multiplayer-modal')?.classList.remove('open');
        resetToNewGame(data.diceCount, true);
        updateStatusBanner("👑 Host started a new game! Red rolls first.");
        if (typeof sounds !== 'undefined' && sounds.playStart) sounds.playStart();
      } else if (data.type === 'host_exit_game') {
        performFullGameExit("👑 Room Host has exited and ended the match.");
        if (typeof sounds !== 'undefined' && sounds.playCapture) sounds.playCapture();
      } else if (data.type === 'request_game_sync') {
        if (isHostInLocalTeam() && (gameMode === 'online' || engine.isGameplayActive)) {
          console.log('👑 Host received re-join sync request:', data);
          sendGameSyncSnapshot(data);
        }
      } else if (data.type === 'game_sync_snapshot') {
        applyGameSyncSnapshot(data);
      }
    });

    webRtc.onPeerStatus((peerId, status, activeCount) => {
      const badge = document.getElementById('webrtc-p2p-badge');
      const dot = document.getElementById('webrtc-server-dot');
      const ipText = document.getElementById('webrtc-server-ip-text');

      if (peerId === 'global_server') {
        if (status === 'online') {
          if (badge && !webRtc?.isP2pActive) {
            badge.textContent = '🌍 Global Internet';
            badge.className = 'text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-500/40';
          }
          if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0';
          if (ipText) ipText.textContent = 'Global Cloud Relay';
        } else {
          if (badge && !webRtc?.isP2pActive) {
            badge.textContent = '⚠️ Reconnecting...';
            badge.className = 'text-[9px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/30';
          }
          if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0';
        }
        return;
      }

      if (badge) {
        if (status === 'p2p_active') {
          badge.textContent = `🟢 P2P Active (${activeCount || 1})`;
          badge.className = 'text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-500/40';
        } else {
          badge.textContent = '🌍 Global Internet';
          badge.className = 'text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-500/40';
        }
      }
    });
  }

  connectSignalingSocket();
}

function connectSignalingSocket() {
  if (typeof io === 'undefined') return;
  const socketUrl = getSignalingUrl();
  console.log('Connecting to Signaling Socket:', socketUrl);

  if (socket) {
    try { socket.disconnect(); } catch (e) {}
  }

  socket = io(socketUrl, {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 25,
    timeout: 8000
  });

  const ipDisplay = document.getElementById('webrtc-server-ip-text');
  if (ipDisplay) ipDisplay.textContent = getSignalingHost();

  const dot = document.getElementById('webrtc-server-dot');
  const badge = document.getElementById('webrtc-p2p-badge');
  const statusMsg = document.getElementById('webrtc-status-msg');

  if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0';
  if (badge) {
    badge.textContent = 'Connecting...';
    badge.className = 'text-[9px] font-mono px-2 py-0.5 rounded bg-cyan-900/60 text-cyan-300 border border-cyan-500/30';
  }

  socket.on('connect', () => {
    console.log('Signaling Connected. Socket ID:', socket.id);
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0';
    if (badge && !webRtc?.isP2pActive) {
      badge.textContent = '🟢 Relay Connected';
      badge.className = 'text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-500/40';
    }
    if (statusMsg && statusMsg.textContent.includes('Connecting')) {
      statusMsg.classList.add('hidden');
    }
  });

  socket.on('connect_error', (err) => {
    console.warn('Signaling Socket Error:', err.message);
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-rose-500 flex-shrink-0';
    if (badge && !webRtc?.isP2pActive) {
      badge.textContent = '⚠️ Offline / Reconnecting';
      badge.className = 'text-[9px] font-mono px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-500/30';
    }
  });

  socket.on('disconnect', () => {
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0';
  });

  if (webRtc) webRtc.init(socket, 0, null);

  socket.on('room_created', ({ roomCode, playerIndex, role, players }) => {
    currentRoomCode = roomCode;
    myOnlinePlayerIndex = playerIndex;
    document.getElementById('webrtc-setup-form')?.classList.add('hidden');
    document.getElementById('webrtc-lobby-card')?.classList.remove('hidden');
    const codeDisplay = document.getElementById('webrtc-room-code-display');
    if (codeDisplay) codeDisplay.textContent = roomCode;
    updateWebRtcLobbyUI(players);
  });

  socket.on('room_joined', ({ roomCode, playerIndex, role, players }) => {
    currentRoomCode = roomCode;
    myOnlinePlayerIndex = playerIndex;
    document.getElementById('webrtc-setup-form')?.classList.add('hidden');
    document.getElementById('webrtc-lobby-card')?.classList.remove('hidden');
    const codeDisplay = document.getElementById('webrtc-room-code-display');
    if (codeDisplay) codeDisplay.textContent = roomCode;
    updateWebRtcLobbyUI(players);
  });

  socket.on('players_updated', ({ players }) => {
    updateWebRtcLobbyUI(players);
  });

  socket.on('game_started', ({ currentTurn, players, diceCount }) => {
    startOnlineMatch(myOnlinePlayerIndex, players, diceCount);
  });

  socket.on('player_left', ({ leftIndex, players }) => {
    updateWebRtcLobbyUI(players);
  });

  socket.on('dice_rolled', ({ playerId, val1, val2, rollResult, actionId }) => {
    handleRemoteDiceRoll({ playerId, val1, val2, rollResult, actionId });
  });

  socket.on('pawn_moved', ({ pawnId, playerId, roll, actionId }) => {
    handleRemotePawnMove({ pawnId, playerId, roll, actionId });
  });

  socket.on('two_dice_stepped', ({ pawnId, playerId, dieIndex, singleRoll, fromStep, toStep, actionId }) => {
    handleRemoteTwoDiceStep({ pawnId, playerId, dieIndex, singleRoll, fromStep, toStep, actionId });
  });

  socket.on('two_dice_pass', (passData) => {
    handleRemoteTwoDicePass(passData);
  });

  socket.on('turn_state', (turnData) => {
    handleRemoteTurnState(turnData);
  });

  socket.on('turn_changed', (turnData) => {
    handleRemoteTurnState(turnData);
  });

  socket.on('next_player', (turnData) => {
    handleRemoteTurnState(turnData);
  });

  socket.on('dice_mode_sync', ({ diceCount }) => {
    setDiceCount(diceCount, false);
    updateStatusBanner(`Host set match mode to ${diceCount === 2 ? '2 Dice (Speed)' : '1 Die (Classic)'}!`);
  });

  socket.on('host_new_game', ({ diceCount }) => {
    document.getElementById('victory-modal')?.classList.remove('open');
    document.getElementById('multiplayer-modal')?.classList.remove('open');
    resetToNewGame(diceCount, true);
    updateStatusBanner("👑 Host started a new game! Red rolls first.");
    if (typeof sounds !== 'undefined' && sounds.playStart) sounds.playStart();
  });

  socket.on('host_exit_game', () => {
    performFullGameExit("👑 Room Host has exited and ended the match.");
    if (typeof sounds !== 'undefined' && sounds.playCapture) sounds.playCapture();
  });

  socket.on('error_message', ({ message }) => {
    const statusMsg = document.getElementById('webrtc-status-msg');
    if (statusMsg) {
      statusMsg.textContent = `⚠️ ${message}`;
      statusMsg.className = 'text-center text-xs text-rose-400 font-bold py-1.5 px-2 rounded-lg bg-rose-950/60 border border-rose-500/30';
      statusMsg.classList.remove('hidden');
    } else {
      alert(message);
    }
  });
}

// Rule 4: Automatic Network Reconnection Listeners & Watchdog
window.addEventListener('online', () => {
  console.log('🌐 Internet online restored. Auto-reconnecting network...');
  updateStatusBanner("🌐 Internet connection restored. Reconnecting session...");
  if (webRtc) webRtc.reconnectAll();
  if (socket && !socket.connected) {
    try { socket.connect(); } catch (e) {}
  }
});

window.addEventListener('offline', () => {
  console.warn('⚠️ Network offline detected.');
  updateStatusBanner("⚠️ Internet disconnected. Waiting for connection to restore...");
});

// Periodic watchdog ensuring persistent online connectivity
setInterval(() => {
  if (gameMode === 'online') {
    if (webRtc && !webRtc.isGlobalConnected && !webRtc.isConnecting) {
      webRtc.reconnectAll();
    }
    if (socket && !socket.connected) {
      try { socket.connect(); } catch (e) {}
    }
  }
}, 5000);

// ==========================================
// DEVELOPER HACK / CUSTOM DICE CONTROLLER
// ==========================================
const diceHackState = {
  enabled: false,
  mode: 'single', // 'single' (this turn / sequence) | 'always' (persistent)
  applyTo: 'me',  // 'me' (my turns) | 'all' (all players) | 0..3 (specific player)
  die1: null,     // null = auto, 1..6 = forced
  die2: null,     // null = auto, 1..6 = forced
  die3: null      // null = auto, 1..6 = forced
};

let activeRemotePresetRoll = null;
let soundClickCount = 0;
let soundClickResetTimeout = null;
let isHackUnlockedInSession = false;

function checkSessionHackUnlock() {
  try {
    if (sessionStorage.getItem('mission_ludo_hack_unlocked') === '1') {
      isHackUnlockedInSession = true;
      showHackHeaderButton();
    }
  } catch (e) {}
}

function showHackHeaderButton() {
  const btn = document.getElementById('btn-open-hack');
  if (btn) btn.classList.remove('hidden');
}

function unlockHackMenuForSession() {
  isHackUnlockedInSession = true;
  try {
    sessionStorage.setItem('mission_ludo_hack_unlocked', '1');
  } catch (e) {}
  showHackHeaderButton();
}

function handleSoundButtonClickForHack() {
  soundClickCount++;
  clearTimeout(soundClickResetTimeout);
  soundClickResetTimeout = setTimeout(() => {
    soundClickCount = 0;
  }, 3500);

  if (soundClickCount >= 15) {
    soundClickCount = 0;
    unlockHackMenuForSession();
    openHackMenuModal();
    if (typeof sounds !== 'undefined' && sounds.playSafeStar) {
      sounds.playSafeStar();
    }
    // Silent unlock - zero public or online status banner emitted for complete stealth & privacy
  }
}

function getMyPlayerInfo() {
  if (gameMode === 'online') {
    const pIdx = (typeof myOnlinePlayerIndex === 'number' && myOnlinePlayerIndex >= 0) ? myOnlinePlayerIndex : 0;
    return engine.players[pIdx] || engine.players[0];
  }
  // Offline vs AI: human player is the one where !isBot
  const human = engine.players.find((p) => !p.isBot);
  return human || engine.players[0];
}

function isHackApplicableToCurrentPlayer() {
  if (!diceHackState.enabled) return false;
  const current = engine.currentPlayer;
  if (!current) return false;

  // 1. All Players (Red, Charcoal, Yellow, Blue)
  if (diceHackState.applyTo === 'all') return true;

  // 2. Specific Player by ID (0 = Red, 1 = Yellow, 2 = Blue, 3 = Charcoal)
  if (typeof diceHackState.applyTo === 'number') {
    return current.id === diceHackState.applyTo;
  }

  // 3. 'me' Scope: exactly the human user's turn
  const myPlayer = getMyPlayerInfo();
  return current.id === myPlayer.id;
}

function openHackMenuModal() {
  const modal = document.getElementById('hack-menu-modal');
  if (!modal) return;
  updateHackModalUI();
  modal.classList.add('open');
}

function closeHackMenuModal() {
  const modal = document.getElementById('hack-menu-modal');
  if (modal) modal.classList.remove('open');
}

function updateHackModalUI() {
  const myPlayer = getMyPlayerInfo();

  const btnPower = document.getElementById('btn-toggle-hack-power');
  const labelPower = document.getElementById('hack-power-status-label');
  if (btnPower && labelPower) {
    if (diceHackState.enabled) {
      btnPower.className = 'btn-action px-3 py-1 rounded-lg text-[10.5px] font-bold border transition flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-md shadow-emerald-500/20';
      labelPower.textContent = 'ACTIVE';
    } else {
      btnPower.className = 'btn-action px-3 py-1 rounded-lg text-[10.5px] font-bold border transition flex items-center gap-1.5 bg-slate-800 text-slate-400 border-white/10';
      labelPower.textContent = 'DISABLED';
    }
  }

  // Mode Duration buttons
  const btnModeSingle = document.getElementById('btn-hack-mode-single');
  const btnModeAlways = document.getElementById('btn-hack-mode-always');
  if (btnModeSingle && btnModeAlways) {
    btnModeSingle.className = diceHackState.mode === 'single'
      ? 'btn-action py-1 rounded-md text-[9.5px] font-bold bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
      : 'btn-action py-1 rounded-md text-[9.5px] font-bold bg-slate-800 text-slate-400 hover:text-white';
    btnModeAlways.className = diceHackState.mode === 'always'
      ? 'btn-action py-1 rounded-md text-[9.5px] font-bold bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
      : 'btn-action py-1 rounded-md text-[9.5px] font-bold bg-slate-800 text-slate-400 hover:text-white';
  }

  // Target Scope buttons & indicators
  const btnScopeMe = document.getElementById('btn-hack-scope-me');
  const btnScopeAll = document.getElementById('btn-hack-scope-all');
  const labelScope = document.getElementById('hack-scope-label');
  const labelMyTurn = document.getElementById('hack-my-turn-indicator');
  const btnMeText = document.getElementById('hack-btn-me-text');

  if (btnMeText) btnMeText.textContent = `My Turns (${myPlayer.name})`;
  if (labelMyTurn) labelMyTurn.textContent = `My Turn: ${myPlayer.name}`;

  let targetDesc = `My Turns (${myPlayer.name})`;
  if (diceHackState.applyTo === 'all') {
    targetDesc = 'All Players';
  } else if (typeof diceHackState.applyTo === 'number') {
    targetDesc = `Only ${engine.players[diceHackState.applyTo]?.name || 'Player ' + diceHackState.applyTo}`;
  }
  if (labelScope) labelScope.textContent = targetDesc;

  if (btnScopeMe && btnScopeAll) {
    btnScopeMe.className = diceHackState.applyTo === 'me'
      ? 'btn-action py-1 rounded-md text-[9.5px] font-bold bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 flex items-center justify-center gap-1'
      : 'btn-action py-1 rounded-md text-[9.5px] font-bold bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center gap-1';
    btnScopeAll.className = diceHackState.applyTo === 'all'
      ? 'btn-action py-1 rounded-md text-[9.5px] font-bold bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 flex items-center justify-center gap-1'
      : 'btn-action py-1 rounded-md text-[9.5px] font-bold bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center gap-1';
  }

  // Player color buttons and YOU badges
  [0, 1, 2, 3].forEach((pId) => {
    const badge = document.getElementById(`badge-my-${pId}`);
    if (badge) {
      badge.classList.toggle('hidden', pId !== myPlayer.id);
    }
    const pBtn = document.getElementById(`btn-hack-player-${pId}`);
    if (pBtn) {
      const isSelected = (diceHackState.applyTo === pId) ||
                         (diceHackState.applyTo === 'all') ||
                         (diceHackState.applyTo === 'me' && pId === myPlayer.id);
      pBtn.classList.toggle('active', isSelected);
    }
  });

  // Die 1 buttons
  const die1Val = diceHackState.die1 === null ? 'auto' : String(diceHackState.die1);
  const labelD1 = document.getElementById('label-hack-die1');
  if (labelD1) labelD1.textContent = diceHackState.die1 === null ? 'Auto (Random)' : `Forced ${diceHackState.die1}`;
  document.querySelectorAll('#group-hack-die1 .btn-hack-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === die1Val);
  });

  // Die 2 buttons
  const die2Val = diceHackState.die2 === null ? 'auto' : String(diceHackState.die2);
  const labelD2 = document.getElementById('label-hack-die2');
  if (labelD2) labelD2.textContent = diceHackState.die2 === null ? 'Auto (Random)' : `Forced ${diceHackState.die2}`;
  document.querySelectorAll('#group-hack-die2 .btn-hack-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === die2Val);
  });

  // Die 3 buttons
  const die3Val = diceHackState.die3 === null ? 'auto' : String(diceHackState.die3);
  const labelD3 = document.getElementById('label-hack-die3');
  if (labelD3) labelD3.textContent = diceHackState.die3 === null ? 'Auto (Random)' : `Forced ${diceHackState.die3}`;
  document.querySelectorAll('#group-hack-die3 .btn-hack-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === die3Val);
  });

  updateHudHackBadge();
  updateAutoPlayUI();
}

function updateHudHackBadge() {
  const badge = document.getElementById('hud-hack-badge');
  const badgeText = document.getElementById('hud-hack-badge-text');
  if (!badge || !badgeText) return;

  if (diceHackState.enabled) {
    const d1Str = diceHackState.die1 !== null ? String(diceHackState.die1) : '?';
    const d2Str = diceHackState.die2 !== null ? String(diceHackState.die2) : '';
    const d3Str = diceHackState.die3 !== null ? String(diceHackState.die3) : '';
    let parts = [d1Str];
    if (d2Str) parts.push(d2Str);
    if (d3Str) parts.push(d3Str);

    const myPlayer = getMyPlayerInfo();
    let targetShort = 'ALL';
    if (diceHackState.applyTo === 'me') {
      targetShort = myPlayer.name;
    } else if (typeof diceHackState.applyTo === 'number') {
      targetShort = engine.players[diceHackState.applyTo]?.name || `P${diceHackState.applyTo}`;
    }

    if (gameMode === 'online') {
      badgeText.textContent = `DEV: ${parts.join('+')}`;
    } else {
      badgeText.textContent = `DEV: ${parts.join('+')} (${targetShort})`;
    }
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function initHackMenuListeners() {
  document.getElementById('btn-close-hack-modal')?.addEventListener('click', closeHackMenuModal);
  document.getElementById('hud-hack-badge')?.addEventListener('click', openHackMenuModal);
  document.getElementById('btn-open-hack')?.addEventListener('click', openHackMenuModal);

  checkSessionHackUnlock();

  document.getElementById('btn-toggle-hack-power')?.addEventListener('click', () => {
    diceHackState.enabled = !diceHackState.enabled;
    if (diceHackState.enabled && diceHackState.die1 === null && diceHackState.die2 === null) {
      diceHackState.die1 = 6; // Convenient default when enabling
    }
    updateHackModalUI();
  });

  document.getElementById('btn-hack-mode-single')?.addEventListener('click', () => {
    diceHackState.mode = 'single';
    updateHackModalUI();
  });

  document.getElementById('btn-hack-mode-always')?.addEventListener('click', () => {
    diceHackState.mode = 'always';
    updateHackModalUI();
  });

  document.getElementById('btn-hack-scope-me')?.addEventListener('click', () => {
    diceHackState.applyTo = 'me';
    updateHackModalUI();
  });

  document.getElementById('btn-hack-scope-all')?.addEventListener('click', () => {
    diceHackState.applyTo = 'all';
    updateHackModalUI();
  });

  // Specific player buttons
  [0, 1, 2, 3].forEach((pId) => {
    document.getElementById(`btn-hack-player-${pId}`)?.addEventListener('click', () => {
      diceHackState.applyTo = pId;
      diceHackState.enabled = true; // Auto-enable when selecting a player
      if (diceHackState.die1 === null && diceHackState.die2 === null) {
        diceHackState.die1 = 6; // Convenient default so it immediately takes effect
      }
      updateHackModalUI();
    });
  });

  // Die 1 selection
  document.querySelectorAll('#group-hack-die1 .btn-hack-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      diceHackState.die1 = (val === 'auto') ? null : parseInt(val, 10);
      diceHackState.enabled = true; // Auto-enable when picking
      updateHackModalUI();
    });
  });

  // Die 2 selection
  document.querySelectorAll('#group-hack-die2 .btn-hack-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      diceHackState.die2 = (val === 'auto') ? null : parseInt(val, 10);
      diceHackState.enabled = true; // Auto-enable when picking
      updateHackModalUI();
    });
  });

  // Die 3 selection
  document.querySelectorAll('#group-hack-die3 .btn-hack-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      diceHackState.die3 = (val === 'auto') ? null : parseInt(val, 10);
      diceHackState.enabled = true; // Auto-enable when picking
      updateHackModalUI();
    });
  });

  // Presets
  document.getElementById('btn-preset-six')?.addEventListener('click', () => {
    diceHackState.enabled = true;
    diceHackState.die1 = 6;
    diceHackState.die2 = null;
    diceHackState.die3 = null;
    updateHackModalUI();
  });

  document.getElementById('btn-preset-openrun')?.addEventListener('click', () => {
    diceHackState.enabled = true;
    diceHackState.die1 = 6;
    diceHackState.die2 = 1;
    diceHackState.die3 = null;
    updateHackModalUI();
  });

  document.getElementById('btn-preset-sixfive')?.addEventListener('click', () => {
    diceHackState.enabled = true;
    diceHackState.die1 = 6;
    diceHackState.die2 = 5;
    diceHackState.die3 = null;
    updateHackModalUI();
  });

  document.getElementById('btn-preset-doubles')?.addEventListener('click', () => {
    diceHackState.enabled = true;
    diceHackState.die1 = 6;
    diceHackState.die2 = 6;
    diceHackState.die3 = null;
    updateHackModalUI();
  });

  document.getElementById('btn-preset-sixsixfour')?.addEventListener('click', () => {
    diceHackState.enabled = true;
    diceHackState.die1 = 6;
    diceHackState.die2 = 6;
    diceHackState.die3 = 4;
    updateHackModalUI();
  });

  document.getElementById('btn-preset-one')?.addEventListener('click', () => {
    diceHackState.enabled = true;
    diceHackState.die1 = 1;
    diceHackState.die2 = null;
    diceHackState.die3 = null;
    updateHackModalUI();
  });

  document.getElementById('btn-reset-hack')?.addEventListener('click', () => {
    diceHackState.enabled = false;
    diceHackState.die1 = null;
    diceHackState.die2 = null;
    diceHackState.die3 = null;
    diceHackState.mode = 'single';
    diceHackState.applyTo = 'me';
    updateHackModalUI();
    if (gameMode !== 'online') {
      updateStatusBanner("Dice calibration reset: Normal dice active");
    }
  });

  document.getElementById('btn-apply-hack')?.addEventListener('click', () => {
    // If user clicked Save & Apply with any custom die set, ensure enabled
    if (diceHackState.die1 !== null || diceHackState.die2 !== null || diceHackState.die3 !== null) {
      diceHackState.enabled = true;
    }
    closeHackMenuModal();
    updateHudHackBadge();
    const d1Str = diceHackState.die1 !== null ? String(diceHackState.die1) : 'Auto';
    const d2Str = diceHackState.die2 !== null ? String(diceHackState.die2) : 'Auto';
    const d3Str = diceHackState.die3 !== null ? String(diceHackState.die3) : 'Auto';
    const descParts = [d1Str];
    if (diceHackState.die2 !== null) descParts.push(d2Str);
    if (diceHackState.die3 !== null) descParts.push(d3Str);

    const myPlayer = getMyPlayerInfo();
    let targetText = `My Turns (${myPlayer.name})`;
    if (diceHackState.applyTo === 'all') targetText = 'All Players';
    else if (typeof diceHackState.applyTo === 'number') targetText = `Only ${engine.players[diceHackState.applyTo]?.name}`;

    if (gameMode !== 'online') {
      const status = diceHackState.enabled
        ? `⚡ Precision Active: [${descParts.join(' + ')}] (${diceHackState.mode === 'single' ? 'Next Roll' : 'Always'} • ${targetText})`
        : 'Precision Tuning Disabled: Normal dice active';
      updateStatusBanner(status);
    }
  });
}

/**
 * Generates an exquisite 512x512 Canvas texture for Yard Position Badges
 * Displays 1st, 2nd, 3rd, or YOU LOSE inside the player's house
 */
function createYardRankTexture(rankType, playerName, isMe) {
  const cvs = document.createElement('canvas');
  cvs.width = 512;
  cvs.height = 512;
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);

  const cx = 256;
  const cy = 256;
  const outerR = 236;

  ctx.save();

  let gradBg, strokeOuter, strokeInner, textColor, textStroke, subColor, badgeTitle, badgeIcon, bannerColor;

  if (rankType === '1st') {
    // 🥇 1st Place Champion - Royal Gold
    gradBg = ctx.createRadialGradient(cx, cy, 30, cx, cy, outerR);
    gradBg.addColorStop(0, '#78350f');
    gradBg.addColorStop(0.60, '#451a03');
    gradBg.addColorStop(1, '#1e0c03');

    strokeOuter = '#f59e0b';
    strokeInner = '#fbbf24';
    textColor = '#fef08a';
    textStroke = '#78350f';
    subColor = '#fde68a';
    badgeTitle = 'WINNER';
    badgeIcon = '👑';
    bannerColor = '#b45309';
  } else if (rankType === '2nd') {
    // 🥈 2nd Place Runner-Up - Platinum Silver
    gradBg = ctx.createRadialGradient(cx, cy, 30, cx, cy, outerR);
    gradBg.addColorStop(0, '#334155');
    gradBg.addColorStop(0.60, '#1e293b');
    gradBg.addColorStop(1, '#0f172a');

    strokeOuter = '#cbd5e1';
    strokeInner = '#f1f5f9';
    textColor = '#f8fafc';
    textStroke = '#0f172a';
    subColor = '#e2e8f0';
    badgeTitle = '2ND PLACE';
    badgeIcon = '🥈';
    bannerColor = '#475569';
  } else if (rankType === '3rd') {
    // 🥉 3rd Place - Baltic Bronze
    gradBg = ctx.createRadialGradient(cx, cy, 30, cx, cy, outerR);
    gradBg.addColorStop(0, '#451a03');
    gradBg.addColorStop(0.60, '#292524');
    gradBg.addColorStop(1, '#1c1917');

    strokeOuter = '#d97706';
    strokeInner = '#f59e0b';
    textColor = '#fdba74';
    textStroke = '#451a03';
    subColor = '#fed7aa';
    badgeTitle = '3RD PLACE';
    badgeIcon = '🥉';
    bannerColor = '#9a3412';
  } else {
    // ❌ Last Place - You Lose
    gradBg = ctx.createRadialGradient(cx, cy, 30, cx, cy, outerR);
    gradBg.addColorStop(0, '#450a0a');
    gradBg.addColorStop(0.60, '#2b0707');
    gradBg.addColorStop(1, '#1a0404');

    strokeOuter = '#ef4444';
    strokeInner = '#f87171';
    textColor = '#fecaca';
    textStroke = '#450a0a';
    subColor = '#fca5a5';
    badgeTitle = 'DEFEATED';
    badgeIcon = '💀';
    bannerColor = '#991b1b';
  }

  // 1. Dark Shadow under Disc
  ctx.beginPath();
  ctx.arc(cx, cy + 5, outerR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fill();

  // 2. Base Radial Fill
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fillStyle = gradBg;
  ctx.fill();

  // 3. Thick Metallic Outer Ring
  ctx.lineWidth = 14;
  ctx.strokeStyle = strokeOuter;
  ctx.stroke();

  // 4. Inset Precision Ring
  ctx.beginPath();
  ctx.arc(cx, cy, outerR - 16, 0, Math.PI * 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = strokeInner;
  ctx.stroke();

  // 5. Delicate Inner Beaded Circle
  ctx.beginPath();
  ctx.arc(cx, cy, outerR - 28, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.stroke();

  // 6. Top Icon (Crown / Medal / Skull)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '64px sans-serif';
  ctx.fillText(badgeIcon, cx, cy - 118);

  // 7. Player Name at Top
  ctx.font = 'bold 22px "Plus Jakarta Sans", "Cinzel", sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  const displayPlayerName = (playerName || '').toUpperCase();
  ctx.fillText(displayPlayerName, cx, cy - 65);

  // 8. Main Rank Headline ("1st", "2nd", "3rd", "YOU LOSE")
  if (rankType === 'lose') {
    const loseText = isMe ? 'YOU LOSE' : 'LOST';
    ctx.font = '900 80px "Cinzel", "Plus Jakarta Sans", sans-serif';
    ctx.lineWidth = 8;
    ctx.strokeStyle = textStroke;
    ctx.strokeText(loseText, cx, cy + 22);
    ctx.fillStyle = textColor;
    ctx.fillText(loseText, cx, cy + 22);
  } else {
    ctx.font = '900 150px "Cinzel", "Plus Jakarta Sans", sans-serif';
    ctx.lineWidth = 10;
    ctx.strokeStyle = textStroke;
    ctx.strokeText(rankType, cx, cy + 22);
    ctx.fillStyle = textColor;
    ctx.fillText(rankType, cx, cy + 22);
  }

  // 9. Bottom Ribbon Pill Banner
  const pillW = 260;
  const pillH = 46;
  const pillX = cx - pillW / 2;
  const pillY = cy + 120;
  const pillR = 23;

  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(pillX, pillY, pillW, pillH, pillR);
  } else {
    ctx.rect(pillX, pillY, pillW, pillH);
  }
  ctx.fillStyle = bannerColor;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = strokeInner;
  ctx.stroke();

  // 10. Ribbon Text
  ctx.font = 'bold 24px "Plus Jakarta Sans", "Cinzel", sans-serif';
  ctx.fillStyle = subColor;
  ctx.fillText(badgeTitle, cx, pillY + pillH / 2 + 1);

  ctx.restore();

  const texture = new THREE.CanvasTexture(cvs);
  texture.encoding = THREE.sRGBEncoding;
  texture.anisotropy = 16;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createYardRankBadgeMesh(rankType, playerName, isMe, quad) {
  const texture = createYardRankTexture(rankType, playerName, isMe);
  const geo = new THREE.PlaneGeometry(2.8, 2.8);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(quad.cx, 1.002, quad.cz);
  mesh.renderOrder = 10;

  // Elastic pop-in bounce animation
  mesh.scale.set(0.001, 0.001, 0.001);
  const startT = performance.now();
  const dur = 600;
  function popAnim(now) {
    const elapsed = now - startT;
    const progress = Math.min(1.0, elapsed / dur);
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const s = 1 + c3 * Math.pow(progress - 1, 3) + c1 * Math.pow(progress - 1, 2);
    mesh.scale.set(Math.max(0.001, s), Math.max(0.001, s), Math.max(0.001, s));
    if (progress < 1.0) {
      requestAnimationFrame(popAnim);
    } else {
      mesh.scale.set(1.0, 1.0, 1.0);
    }
  }
  requestAnimationFrame(popAnim);

  return mesh;
}

function updateYardRankBadges() {
  if (!scene || !engine) return;

  const activeRanks = (engine.rankings && engine.rankings.length > 0)
    ? [...engine.rankings]
    : (engine.winner ? [engine.winner.id] : []);

  const activeCount = engine.activePlayerCount || 4;
  let activeSequence = activeCount === 2 ? [0, 1] : (activeCount === 3 ? [0, 3, 1] : [0, 3, 1, 2]);
  const activeIds = activeSequence.slice(0, activeCount);

  // If game is over, ensure any unfinished players are placed at the end of activeRanks
  if (engine.isGameOver) {
    activeIds.forEach((pid) => {
      if (!activeRanks.includes(pid)) activeRanks.push(pid);
    });
  }

  const myPlayer = (typeof getMyPlayerInfo === 'function') ? getMyPlayerInfo() : null;
  const myPlayerId = myPlayer ? myPlayer.id : 0;
  const totalPlayers = activeIds.length;

  activeRanks.forEach((pid, rankIdx) => {
    if (!activeIds.includes(pid)) return;

    let rankType = null;
    if (rankIdx === 0) {
      rankType = '1st';
    } else if (rankIdx === 1) {
      if (totalPlayers === 2 && engine.isGameOver) {
        rankType = 'lose';
      } else {
        rankType = '2nd';
      }
    } else if (rankIdx === 2) {
      if (totalPlayers === 3 && engine.isGameOver) {
        rankType = 'lose';
      } else {
        rankType = '3rd';
      }
    } else if (rankIdx === 3 || (engine.isGameOver && rankIdx === activeRanks.length - 1)) {
      rankType = 'lose';
    }

    if (!rankType) return;

    // Check if badge already exists for this player
    if (yardRankMeshes[pid]) {
      if (yardRankMeshes[pid].userData && yardRankMeshes[pid].userData.rankType === rankType) {
        return;
      }
      scene.remove(yardRankMeshes[pid]);
      if (yardRankMeshes[pid].geometry) yardRankMeshes[pid].geometry.dispose();
      if (yardRankMeshes[pid].material) {
        if (yardRankMeshes[pid].material.map) yardRankMeshes[pid].material.map.dispose();
        yardRankMeshes[pid].material.dispose();
      }
      delete yardRankMeshes[pid];
    }

    const quad = BOARD_CONFIG.QUADS[pid];
    if (!quad) return;

    const isMe = (pid === myPlayerId);
    const playerObj = engine.players[pid];
    const playerName = playerObj ? playerObj.name : quad.name;

    const badgeMesh = createYardRankBadgeMesh(rankType, playerName, isMe, quad);
    if (badgeMesh) {
      badgeMesh.userData = { playerId: pid, rankType: rankType };
      scene.add(badgeMesh);
      yardRankMeshes[pid] = badgeMesh;
    }
  });
}

function clearYardRankBadges() {
  if (!scene) return;
  Object.keys(yardRankMeshes).forEach((pid) => {
    const mesh = yardRankMeshes[pid];
    if (mesh) {
      scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (mesh.material.map) mesh.material.map.dispose();
        mesh.material.dispose();
      }
    }
  });
  yardRankMeshes = {};
}

function showVictoryModal(winner, rankings) {
  isPawnRunning = false;
  isRolling = false;
  isAwaitingPawnMove = false;
  isTurnTransitioning = false;

  clearActiveMatchSession();
  clearOfflineGameState();
  updateYardRankBadges();

  const modal = document.getElementById('victory-modal');
  if (!modal) return;

  const activeRanks = (rankings && rankings.length > 0)
    ? [...rankings]
    : (engine.rankings && engine.rankings.length > 0 ? [...engine.rankings] : [winner ? winner.id : 0]);

  // Ensure all active players are present in leaderboard
  const activeCount = engine.activePlayerCount || 4;
  let activeSequence = activeCount === 2 ? [0, 1] : (activeCount === 3 ? [0, 3, 1] : [0, 3, 1, 2]);
  activeSequence.slice(0, activeCount).forEach(pid => {
    if (!activeRanks.includes(pid)) activeRanks.push(pid);
  });

  const myPlayer = getMyPlayerInfo();
  const myPlayerId = myPlayer ? myPlayer.id : 0;
  const myRankIndex = activeRanks.indexOf(myPlayerId);
  const totalPlayers = activeRanks.length;

  const isLocalPlayerGame = (gameMode !== 'online' && !currentRoomCode) || (typeof myOnlinePlayerIndex === 'number' && myOnlinePlayerIndex >= 0);

  const titleEl = document.getElementById('victory-modal-title');
  const descEl = document.getElementById('victory-modal-desc');
  const winnerNameEl = document.getElementById('winner-name');
  const iconEl = document.getElementById('victory-badge-icon');
  const iconBox = document.getElementById('victory-badge-icon-box');
  const myRankBadge = document.getElementById('victory-my-rank');

  let titleText = "ROYAL VICTORY!";
  let descText = `${winner ? winner.name : 'Player'} has led all 4 gotiyan to Sanctuary!`;
  let iconClass = "fa-solid fa-crown text-amber-400";
  let boxClass = "w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 mx-auto flex items-center justify-center text-3xl mb-3 shadow-lg shadow-amber-500/20 border border-amber-500/30";

  if (isLocalPlayerGame && myRankIndex !== -1) {
    if (myRankIndex === 0) {
      titleText = "1ST PLACE CHAMPION!";
      descText = "🏆 Royal Victory! You led all 4 gotiyan to Sanctuary!";
      iconClass = "fa-solid fa-crown text-amber-400";
      boxClass = "w-16 h-16 rounded-2xl bg-amber-500/25 text-amber-400 mx-auto flex items-center justify-center text-3xl mb-3 shadow-xl shadow-amber-500/30 border border-amber-400/50";
      if (myRankBadge) {
        myRankBadge.textContent = "🥇 1st Place";
        myRankBadge.className = "text-[9.5px] px-2 py-0.5 rounded-full bg-amber-500/25 text-amber-300 border border-amber-500/50 font-bold";
      }
    } else if (myRankIndex === 1 && totalPlayers >= 3) {
      titleText = "2ND PLACE!";
      descText = "🥈 Runner-Up! Brilliant match and outstanding strategy!";
      iconClass = "fa-solid fa-medal text-slate-200";
      boxClass = "w-16 h-16 rounded-2xl bg-slate-500/20 text-slate-200 mx-auto flex items-center justify-center text-3xl mb-3 shadow-lg shadow-slate-400/20 border border-slate-300/40";
      if (myRankBadge) {
        myRankBadge.textContent = "🥈 2nd Place";
        myRankBadge.className = "text-[9.5px] px-2 py-0.5 rounded-full bg-slate-500/25 text-slate-200 border border-slate-400/50 font-bold";
      }
    } else if (myRankIndex === 2 && totalPlayers === 4) {
      titleText = "3RD PLACE!";
      descText = "🥉 Bronze Finish! You secured 3rd position!";
      iconClass = "fa-solid fa-award text-amber-500";
      boxClass = "w-16 h-16 rounded-2xl bg-amber-800/20 text-amber-500 mx-auto flex items-center justify-center text-3xl mb-3 shadow-lg shadow-amber-600/20 border border-amber-600/40";
      if (myRankBadge) {
        myRankBadge.textContent = "🥉 3rd Place";
        myRankBadge.className = "text-[9.5px] px-2 py-0.5 rounded-full bg-amber-800/25 text-amber-400 border border-amber-600/50 font-bold";
      }
    } else {
      titleText = "YOU LOSE";
      descText = "💀 Better luck next match! Keep rolling to conquer the board!";
      iconClass = "fa-solid fa-skull text-rose-400";
      boxClass = "w-16 h-16 rounded-2xl bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center text-3xl mb-3 shadow-lg shadow-rose-500/20 border border-rose-500/40";
      if (myRankBadge) {
        myRankBadge.textContent = "❌ You Lose";
        myRankBadge.className = "text-[9.5px] px-2 py-0.5 rounded-full bg-rose-500/25 text-rose-300 border border-rose-500/50 font-bold";
      }
    }
  }

  if (titleEl) titleEl.textContent = titleText;
  if (descEl) descEl.textContent = descText;
  if (winnerNameEl && winner) {
    winnerNameEl.textContent = winner.name;
    winnerNameEl.style.color = winner.color;
  }
  if (iconEl) iconEl.className = iconClass;
  if (iconBox) iconBox.className = boxClass;

  // Render Full Leaderboard / Positions ("1st, 2nd, 3rd, and You Lose")
  const rankingsContainer = document.getElementById('victory-rankings-list');
  if (rankingsContainer) {
    rankingsContainer.innerHTML = '';
    activeRanks.forEach((pid, idx) => {
      const p = engine.players[pid];
      if (!p) return;
      const isMe = (pid === myPlayerId);

      let positionLabel = '';
      let rankIcon = '';
      let badgeStyle = '';
      let rowStyle = isMe ? 'bg-amber-500/15 border-amber-500/50 shadow-sm' : 'bg-slate-900/60 border-white/10';

      if (idx === 0) {
        positionLabel = '1st Place';
        rankIcon = '🥇';
        badgeStyle = 'text-amber-300 bg-amber-500/20 border border-amber-400/50';
      } else if (idx === 1) {
        if (totalPlayers === 2) {
          positionLabel = isMe ? 'You Lose' : 'Defeated';
          rankIcon = '❌';
          badgeStyle = 'text-rose-300 bg-rose-500/20 border border-rose-500/40';
        } else {
          positionLabel = '2nd Place';
          rankIcon = '🥈';
          badgeStyle = 'text-slate-200 bg-slate-500/20 border border-slate-400/40';
        }
      } else if (idx === 2) {
        if (totalPlayers === 3) {
          positionLabel = isMe ? 'You Lose' : 'Defeated';
          rankIcon = '❌';
          badgeStyle = 'text-rose-300 bg-rose-500/20 border border-rose-500/40';
        } else {
          positionLabel = '3rd Place';
          rankIcon = '🥉';
          badgeStyle = 'text-amber-500 bg-amber-800/20 border border-amber-600/40';
        }
      } else {
        positionLabel = isMe ? 'You Lose' : 'Defeated';
        rankIcon = '❌';
        badgeStyle = 'text-rose-300 bg-rose-500/20 border border-rose-500/40';
      }

      const row = document.createElement('div');
      row.className = `flex items-center justify-between px-3 py-2 rounded-xl border ${rowStyle} transition-all`;
      row.innerHTML = `
        <div class="flex items-center gap-2.5">
          <span class="text-base leading-none">${rankIcon}</span>
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${p.color}; box-shadow: 0 0 6px ${p.color};"></span>
            <span class="text-xs font-bold text-white">${p.name} ${isMe ? '<span class="text-[10px] text-amber-300 font-normal">(You)</span>' : ''}</span>
          </div>
        </div>
        <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${badgeStyle}">
          ${positionLabel}
        </span>
      `;
      rankingsContainer.appendChild(row);
    });
  }

  modal.classList.add('open');
  updateModeLockUI();
}

// Clamp extension helper
Number.prototype.clamp = function(min, max) {
  return Math.min(Math.max(this, min), max);
};

function updateCameraViewport() {
  if (!camera || !renderer) return;
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;

  const baseFov = 38;
  if (aspect < 1.0) {
    // In portrait orientation, dynamically widen vertical FOV so horizontal coverage matches baseFov at aspect=1.2
    const rad = Math.PI / 180;
    const vHalf = Math.tan((baseFov * rad) / 2);
    const targetFov = 2 * Math.atan(vHalf / Math.max(aspect, 0.35)) * (180 / Math.PI);
    camera.fov = Math.min(Math.max(targetFov, 38), 75);
  } else {
    camera.fov = baseFov;
  }

  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Crisp High-DPI Retina resolution
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.0));

  updateDicePositions();
}

function onResize() {
  _hasCameraMoved = true;
  updateCameraViewport();
}

const _lastCamPos = new THREE.Vector3();
const _lastCamQuat = new THREE.Quaternion();
let _hasCameraMoved = true;

// Framerate-Decoupled Game Clock (Agent 3: Memory Optimization & Delta Tuning)
const gameClock = new THREE.Clock();
let gameDelta = 0;

function animate() {
  requestAnimationFrame(animate);
  gameDelta = Math.min(gameClock.getDelta(), 0.1);
  updatePawnTurnAuras();
  if (isGotiDicePopupOpen) {
    updatePopupScreenPosition();
  }
  if (!isBoardLocked && controls) {
    controls.update();
  }
  if (camera) {
    if (camera.position.distanceToSquared(_lastCamPos) > 0.0001 || !camera.quaternion.equals(_lastCamQuat)) {
      _lastCamPos.copy(camera.position);
      _lastCamQuat.copy(camera.quaternion);
      _hasCameraMoved = true;
    } else {
      _hasCameraMoved = false;
    }
  }
  if (!isRolling && _hasCameraMoved) {
    updateDicePositions();
  }
  renderer.render(scene, camera);
}

window.onload = function () {
  init();
  animate();
};
