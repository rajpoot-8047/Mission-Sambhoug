/**
 * Board Data & Coordinate Mapping for 3D Ludo
 * Calibrated directly to Mission Sambhoug 3D Ludo Spatial World
 */

const BOARD_CONFIG = {
  TILE_STEP: 1.04,
  BOARD_Y: 0.655,
  SOCKET_Y: 0.995,
  RUNWAY_Y: 0.795,
  TABLE_Y: 0.0,
  
  // Quadrant centers (exact 6x6 corner quadrant grid alignment)
  QUADS: [
    { id: 0, name: 'Red', cx: 4.68, cz: -4.68, color: 0xba1d1d, hex: '#ba1d1d' },
    { id: 1, name: 'Yellow', cx: -4.68, cz: 4.68, color: 0xb58900, hex: '#b58900' },
    { id: 2, name: 'Blue', cx: -4.68, cz: -4.68, color: 0x0c4bbd, hex: '#0c4bbd' },
    { id: 3, name: 'Charcoal', cx: 4.68, cz: 4.68, color: 0x2b3238, hex: '#2b3238' }
  ],

  // 4 Socket offsets on each quadrant platform
  SOCKET_OFFSETS: [
    [-1.20, -1.20],
    [1.20, -1.20],
    [-1.20, 1.20],
    [1.20, 1.20]
  ],

  // Outside staging coordinates (on table floor Y = 0)
  OUTSIDE_STAGING: [
    // Red (back-right)
    [{ x: 4.2, z: -8.8 }, { x: 5.4, z: -9.8 }, { x: 6.6, z: -8.6 }, { x: 8.8, z: -7.4 }],
    // Yellow (front-left)
    [{ x: -8.8, z: 4.2 }, { x: -9.8, z: 5.4 }, { x: -8.6, z: 6.6 }, { x: -7.4, z: 8.8 }],
    // Blue (back-left)
    [{ x: -8.8, z: -4.2 }, { x: -9.8, z: -5.4 }, { x: -8.6, z: -6.6 }, { x: -7.4, z: -8.8 }],
    // Charcoal (front-right)
    [{ x: 4.2, z: 8.8 }, { x: 5.4, z: 9.8 }, { x: 6.6, z: 8.6 }, { x: 8.8, z: 7.4 }]
  ]
};

// Generate 52 Perimeter Track Coordinates centered at (0, 0)
function generatePerimeterTrack() {
  const step = 1.04;
  const track = [];

  // Helper to convert grid row/col (0 to 14) to 3D (x, z)
  function gridTo3D(col, row) {
    const x = (col - 7) * step;
    const z = (row - 7) * step;
    return { x, z, y: BOARD_CONFIG.BOARD_Y };
  }

  // 52 tiles in clockwise order starting at Yellow's release tile [6, 13]
  const gridCells = [
    // Yellow start arm up (bottom arm towards center):
    [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
    // Left arm bottom:
    [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
    // Left arm tip:
    [0, 7],
    // Left arm top:
    [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
    // Top arm left:
    [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
    // Top arm tip:
    [7, 0],
    // Top arm right:
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
    // Right arm top:
    [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
    // Right arm tip:
    [14, 7],
    // Right arm bottom:
    [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
    // Bottom arm right:
    [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
    // Bottom arm tip:
    [7, 14],
    // Bottom arm return:
    [6, 14]
  ];

  gridCells.forEach(([c, r]) => {
    track.push(gridTo3D(c, r));
  });

  return track;
}

// Generate 5 Home Runway steps for each of the 4 players (exact 1.04 grid squares)
function generateHomeRunways() {
  const step = BOARD_CONFIG.TILE_STEP;
  const y = BOARD_CONFIG.RUNWAY_Y;
  const runways = {
    // Red (runs from row 1 to row 5 along Z-)
    0: [
      { x: 0, z: -6 * step, y },
      { x: 0, z: -5 * step, y },
      { x: 0, z: -4 * step, y },
      { x: 0, z: -3 * step, y },
      { x: 0, z: -2 * step, y }
    ],
    // Yellow (runs from row 13 to row 9 along Z+)
    1: [
      { x: 0, z: 6 * step, y },
      { x: 0, z: 5 * step, y },
      { x: 0, z: 4 * step, y },
      { x: 0, z: 3 * step, y },
      { x: 0, z: 2 * step, y }
    ],
    // Blue (runs from col 1 to col 5 along X-)
    2: [
      { x: -6 * step, z: 0, y },
      { x: -5 * step, z: 0, y },
      { x: -4 * step, z: 0, y },
      { x: -3 * step, z: 0, y },
      { x: -2 * step, z: 0, y }
    ],
    // Charcoal (runs from col 13 to col 9 along X+)
    3: [
      { x: 6 * step, z: 0, y },
      { x: 5 * step, z: 0, y },
      { x: 4 * step, z: 0, y },
      { x: 3 * step, z: 0, y },
      { x: 2 * step, z: 0, y }
    ]
  };

  return runways;
}

const PERIMETER_TRACK = generatePerimeterTrack();
const HOME_RUNWAYS = generateHomeRunways();

// Player start tile indices on the 52 ring: Red (top), Yellow (bottom), Blue (left), Charcoal (right)
const START_TILES = [26, 0, 13, 39]; // [Red, Yellow, Blue, Charcoal]

// The 4 Castle Star sanctuaries (universal safe tiles with star icons)
const CASTLE_STAR_INDICES = [8, 21, 34, 47];

// Safe star indices on the 52 ring (4 start tiles + 4 castle tiles)
const SAFE_STAR_INDICES = [0, 8, 13, 21, 26, 34, 39, 47];

// Zero-Allocation Structural Scratchpad Object Pool for Mobile 60 FPS
const VectorPool = {
  _pool: [],
  acquire(x = 0, y = 0, z = 0) {
    if (this._pool.length > 0) {
      const v = this._pool.pop();
      v.x = x;
      v.y = y;
      v.z = z;
      return v;
    }
    return { x, y, z };
  },
  release(v) {
    if (v && this._pool.length < 120) {
      this._pool.push(v);
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BOARD_CONFIG,
    PERIMETER_TRACK,
    HOME_RUNWAYS,
    START_TILES,
    CASTLE_STAR_INDICES,
    SAFE_STAR_INDICES,
    VectorPool
  };
}
