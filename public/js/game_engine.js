/**
 * Ludo Rules Engine
 * Implements standard competitive Ludo rules:
 * - 6 release rule
 * - Knock-out capture sending opponent back to yard
 * - Safe star protection
 * - Home runway sanctuary and exact-finish rule
 * - Bonus rolls on rolling a 6 or capturing an opponent
 */

if (typeof START_TILES === 'undefined' && typeof require !== 'undefined') {
  const _bd = require('./board_data.js');
  global.START_TILES = _bd.START_TILES;
  global.SAFE_STAR_INDICES = _bd.SAFE_STAR_INDICES;
  global.CASTLE_STAR_INDICES = _bd.CASTLE_STAR_INDICES;
}

class Pawn {
  constructor(id, playerId) {
    this.id = id;
    this.playerId = playerId;
    this.stepOnTrack = -1; // -1 = yard, 0..50 = ring, 51..55 = runway, 56 = goal
    this.isFinished = false;
  }

  get isInYard() {
    return this.stepOnTrack === -1;
  }

  get isInRunway() {
    return this.stepOnTrack >= 51 && this.stepOnTrack <= 55;
  }

  get currentRingIndex() {
    if (this.stepOnTrack < 0 || this.stepOnTrack > 50) return -1;
    const start = START_TILES[this.playerId];
    return (start + this.stepOnTrack) % 52;
  }
}

class Player {
  constructor(id, name, color, isBot = false) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.isBot = isBot;
    this.pawns = [
      new Pawn(0, id),
      new Pawn(1, id),
      new Pawn(2, id),
      new Pawn(3, id)
    ];
  }

  get isWinner() {
    return this.pawns.every((p) => p.isFinished);
  }

  get finishedCount() {
    return this.pawns.filter((p) => p.isFinished).length;
  }
}

class LudoGameEngine {
  constructor() {
    this.players = [
      new Player(0, 'Red', '#ba1d1d', false),
      new Player(1, 'Yellow', '#d9b300', true),
      new Player(2, 'Blue', '#0c4bbd', true),
      new Player(3, 'Charcoal', '#2b3238', true)
    ];
    this.currentTurnPlayerId = 0;
    this.currentDiceValue = 1;
    this.diceCount = 1; // 1 | 2
    this.lastRoll = { d1: 1, d2: 0, total: 1, isDouble: false, hasSix: false };
    this.isRolling = false;
    this.winner = null;
    this.rankings = []; // Ordered player IDs [1st, 2nd, 3rd, 4th (Lose)]
    this.isGameOver = false;
    this.consecutiveSixes = 0;
    this.gameplayStarted = false;
  }

  get currentPlayer() {
    return this.players[this.currentTurnPlayerId];
  }

  get isGameplayActive() {
    if (this.isGameOver) return false;
    if (this.gameplayStarted) return true;
    for (const player of this.players) {
      if (player.pawns.some((p) => p.stepOnTrack > -1)) {
        return true;
      }
    }
    return false;
  }

  setDiceCount(count, force = false) {
    if (!force && this.isGameplayActive) {
      return false; // Guard: cannot change dice mode during active gameplay
    }
    this.diceCount = count === 2 ? 2 : 1;
    return true;
  }

  resetGame(diceCount = this.diceCount) {
    this.diceCount = diceCount === 2 ? 2 : 1;
    this.players.forEach((player) => {
      player.pawns.forEach((pawn) => {
        pawn.stepOnTrack = -1;
        pawn.isFinished = false;
      });
    });
    this.currentTurnPlayerId = 0;
    this.currentDiceValue = 1;
    this.lastRoll = { d1: 1, d2: 0, total: 1, isDouble: false, hasSix: false, isSingleDie: (this.diceCount === 1) };
    this.isRolling = false;
    this.winner = null;
    this.rankings = [];
    this.isGameOver = false;
    this.consecutiveSixes = 0;
    this.consecutiveDoubles = 0;
    this.gameplayStarted = false;
    return true;
  }

  checkPlayerFinish(player) {
    if (player && player.isWinner && !this.rankings.includes(player.id)) {
      this.rankings.push(player.id);
      if (!this.winner) {
        this.winner = player;
      }
      const count = this.activePlayerCount || this.players.length;
      let activeSequence;
      if (count === 2) {
        activeSequence = [0, 1];
      } else if (count === 3) {
        activeSequence = [0, 3, 1];
      } else {
        activeSequence = [0, 3, 1, 2];
      }
      const activeIds = activeSequence.slice(0, count);

      if (this.rankings.length >= activeIds.length - 1) {
        for (const pid of activeIds) {
          if (!this.rankings.includes(pid)) {
            this.rankings.push(pid);
          }
        }
        this.isGameOver = true;
      }
      return true;
    }
    return false;
  }

  normalizeRoll(rollInput) {
    if (typeof rollInput === 'number') {
      return {
        d1: rollInput,
        d2: 0,
        total: rollInput,
        hasSix: rollInput === 6,
        isDouble: false,
        isSingleDie: true
      };
    }
    if (rollInput && typeof rollInput === 'object') {
      const isSingleDie = !!rollInput.isSingleDie;
      const d1 = rollInput.d1 !== undefined ? rollInput.d1 : (rollInput.total || 1);
      const d2 = rollInput.d2 !== undefined ? rollInput.d2 : 0;
      const total = rollInput.total !== undefined ? rollInput.total : (isSingleDie ? d1 : (d1 + d2));
      const isDouble = rollInput.isDouble !== undefined ? rollInput.isDouble : (!isSingleDie && d1 === d2 && d2 > 0);
      const hasSix = rollInput.hasSix !== undefined ? rollInput.hasSix : (isSingleDie ? (total === 6 || d1 === 6) : (d1 === 6 || d2 === 6));
      return { d1, d2, total, isDouble, hasSix, isSingleDie };
    }
    return this.lastRoll;
  }

  rollDice(forcedDiceCount = null, forcedD1 = null, forcedD2 = null) {
    this.gameplayStarted = true;
    const effectiveCount = (forcedDiceCount !== null) ? forcedDiceCount : this.diceCount;
    const d1 = (forcedD1 !== null && forcedD1 >= 1 && forcedD1 <= 6) ? forcedD1 : (Math.floor(Math.random() * 6) + 1);
    const d2 = (forcedD2 !== null && forcedD2 >= 1 && forcedD2 <= 6) ? forcedD2 : (Math.floor(Math.random() * 6) + 1);
    const isDouble = (d1 === d2);

    if (effectiveCount === 1) {
      this.currentDiceValue = d1;
      this.lastRoll = { d1, d2: 0, total: d1, isDouble: false, hasSix: d1 === 6, isSingleDie: true };
      if (d1 === 6) {
        this.consecutiveSixes++;
      } else {
        this.consecutiveSixes = 0;
      }
      this.consecutiveDoubles = 0;
      return this.lastRoll;
    } else {
      // 2 Dice Mode
      const total = d1 + d2;
      const isDoubleSix = (d1 === 6 && d2 === 6);
      const hasSix = (d1 === 6 || d2 === 6);
      this.currentDiceValue = total;
      this.lastRoll = { d1, d2, total, isDouble, isDoubleSix, hasSix, isSingleDie: false };
      if (isDoubleSix) {
        this.consecutiveSixes++;
        this.consecutiveDoubles = (this.consecutiveDoubles || 0) + 1;
      } else {
        this.consecutiveSixes = 0;
        this.consecutiveDoubles = 0;
      }
      return this.lastRoll;
    }
  }

  hasOpponentBlock(playerId, targetRingIndex) {
    if (targetRingIndex < 0 || targetRingIndex > 51) return false;
    if (SAFE_STAR_INDICES.includes(targetRingIndex)) return false; // Safe stars do not form blocking walls

    for (const opp of this.players) {
      if (opp.id === playerId) continue;
      const count = opp.pawns.filter((p) => !p.isFinished && p.currentRingIndex === targetRingIndex).length;
      if (count >= 2) return true; // Opponent has 2 pawns forming a Block
    }
    return false;
  }

  canPawnMove(pawn, rollInput) {
    if (pawn.isFinished) return false;
    const r = this.normalizeRoll(rollInput);

    if (r.isSingleDie) {
      if (pawn.isInYard) {
        if (this.consecutiveSixes >= 3) return false;
        if (r.total !== 6) return false;
        const start = START_TILES[pawn.playerId];
        if (this.hasOpponentBlock(pawn.playerId, start)) return false;
        return true;
      }
      const targetStep = pawn.stepOnTrack + r.total;
      if (targetStep > 56) return false; // Exact finish rule
      if (targetStep <= 50) {
        const start = START_TILES[pawn.playerId];
        const targetRing = (start + targetStep) % 52;
        if (this.hasOpponentBlock(pawn.playerId, targetRing)) return false;
      }
      return true;
    }

    // Pawn in yard requires a 6 to release
    if (pawn.isInYard) {
      if (this.consecutiveSixes >= 3) return false;
      const canRelease = r.hasSix || (this.diceCount === 2 && (r.total === 6 || r.isDouble));
      if (!canRelease) return false;
      const start = START_TILES[pawn.playerId];
      if (this.hasOpponentBlock(pawn.playerId, start)) return false;
      return true;
    }

    // Pawn on track
    if (this.diceCount === 1) {
      const targetStep = pawn.stepOnTrack + r.total;
      if (targetStep > 56) return false; // Exact finish rule
      if (targetStep <= 50) {
        const start = START_TILES[pawn.playerId];
        const targetRing = (start + targetStep) % 52;
        if (this.hasOpponentBlock(pawn.playerId, targetRing)) return false;
      }
      return true;
    } else {
      // 2-Dice Mode: check combined, d1, or d2
      const tryStep = (steps) => {
        if (pawn.stepOnTrack + steps > 56) return false;
        if (pawn.stepOnTrack + steps <= 50) {
          const start = START_TILES[pawn.playerId];
          const targetRing = (start + pawn.stepOnTrack + steps) % 52;
          if (this.hasOpponentBlock(pawn.playerId, targetRing)) return false;
        }
        return true;
      };

      if (tryStep(r.total)) return true;
      if (tryStep(r.d1)) return true;
      if (tryStep(r.d2)) return true;
      return false;
    }
  }

  getMovablePawns(player, rollInput) {
    if (this.consecutiveSixes >= 3) {
      return []; // 3 consecutive sixes penalty
    }
    if (this.diceCount === 2 && (this.consecutiveDoubles || 0) >= 3) {
      return []; // 3 consecutive doubles penalty
    }
    return player.pawns.filter((p) => this.canPawnMove(p, rollInput));
  }

  movePawn(pawn, rollInput) {
    this.gameplayStarted = true;
    const r = this.normalizeRoll(rollInput);
    const result = {
      pawnId: pawn.id,
      playerId: pawn.playerId,
      fromStep: pawn.stepOnTrack,
      toStep: -1,
      capturedOpponent: null,
      reachedGoal: false,
      isSafeStar: false,
      grantedBonusRoll: false
    };

    if (r.isSingleDie) {
      if (pawn.isInYard) {
        pawn.stepOnTrack = 0;
        result.toStep = 0;
      } else {
        pawn.stepOnTrack += r.total;
        result.toStep = pawn.stepOnTrack;
        if (pawn.stepOnTrack === 56) {
          pawn.isFinished = true;
          result.reachedGoal = true;
          result.grantedBonusRoll = true;
          this.checkPlayerFinish(this.currentPlayer);
        }
      }
    } else {
      if (pawn.isInYard) {
        if (this.diceCount === 2 && r.hasSix) {
          // In 2-dice mode: release to step 0 and advance by the second die!
          let extraSteps = 0;
          if (r.d1 === 6 && r.d2 === 6) {
            extraSteps = 6;
          } else if (r.d1 === 6) {
            extraSteps = r.d2;
          } else if (r.d2 === 6) {
            extraSteps = r.d1;
          }

          pawn.stepOnTrack = extraSteps;
          result.toStep = extraSteps;
        } else {
          // Standard 1-die release or sum-of-6 release
          pawn.stepOnTrack = 0;
          result.toStep = 0;
        }
      } else {
        let delta = r.total;
        if (this.diceCount === 2 && pawn.stepOnTrack + r.total > 56) {
          if (pawn.stepOnTrack + r.d1 === 56) {
            delta = r.d1;
          } else if (pawn.stepOnTrack + r.d2 === 56) {
            delta = r.d2;
          } else if (pawn.stepOnTrack + r.d1 <= 56 && pawn.stepOnTrack + r.d2 <= 56) {
            delta = Math.max(r.d1, r.d2);
          } else if (pawn.stepOnTrack + r.d1 <= 56) {
            delta = r.d1;
          } else if (pawn.stepOnTrack + r.d2 <= 56) {
            delta = r.d2;
          }
        }

        pawn.stepOnTrack += delta;
        result.toStep = pawn.stepOnTrack;

        if (pawn.stepOnTrack === 56) {
          pawn.isFinished = true;
          result.reachedGoal = true;
          result.grantedBonusRoll = true; // Complete travel to home grants bonus roll!
          this.checkPlayerFinish(this.currentPlayer);
        }
      }
    }

    // Check for collision / knock-out on standard ring
    if (pawn.stepOnTrack >= 0 && pawn.stepOnTrack <= 50) {
      const ringIdx = pawn.currentRingIndex;
      const safeStars = (typeof SAFE_STAR_INDICES !== 'undefined')
        ? SAFE_STAR_INDICES
        : [0, 8, 13, 21, 26, 34, 39, 47];
      const isStarTile = safeStars.includes(ringIdx);

      // A star tile is an absolute sanctuary for ALL players: zero eliminations allowed!
      result.isSafeStar = isStarTile;

      if (!isStarTile) {
        for (const opp of this.players) {
          if (opp.id === pawn.playerId) continue;
          for (const oppPawn of opp.pawns) {
            if (oppPawn.currentRingIndex === ringIdx) {
              // Knock opponent pawn back to yard
              oppPawn.stepOnTrack = -1;
              result.capturedOpponent = {
                playerId: opp.id,
                pawnId: oppPawn.id
              };
              result.grantedBonusRoll = true;
              break;
            }
          }
          if (result.capturedOpponent) break;
        }
      }
    }

    return result;
  }

  advanceTurn() {
    this.consecutiveSixes = 0;
    this.consecutiveDoubles = 0;
    const count = this.activePlayerCount || this.players.length;

    // Clockwise Board Turn Sequence:
    // 2 Players: RED (0) -> YELLOW (1) (Opposite diagonal corners)
    // 3 Players: RED (0) -> CHARCOAL (3) -> YELLOW (1) (3 corners clockwise)
    // 4 Players: RED (0) -> CHARCOAL (3) -> YELLOW (1) -> BLUE (2) (Full board clockwise)
    let activeSequence;
    if (count === 2) {
      activeSequence = [0, 1];
    } else if (count === 3) {
      activeSequence = [0, 3, 1];
    } else {
      activeSequence = [0, 3, 1, 2];
    }
    let currentIndex = activeSequence.indexOf(this.currentTurnPlayerId);

    if (currentIndex === -1) currentIndex = 0;

    // Advance to next active unfinished player
    for (let i = 1; i <= activeSequence.length; i++) {
      const nextId = activeSequence[(currentIndex + i) % activeSequence.length];
      const player = this.players[nextId];
      if (!this.isGameOver && player && player.isWinner) {
        continue; // Skip players who already finished all 4 gotiyan
      }
      this.currentTurnPlayerId = nextId;
      return this.currentTurnPlayerId;
    }

    this.currentTurnPlayerId = activeSequence[(currentIndex + 1) % activeSequence.length];
    return this.currentTurnPlayerId;
  }

  reset() {
    this.currentTurnPlayerId = 0;
    this.currentDiceValue = 1;
    this.isRolling = false;
    this.winner = null;
    this.rankings = [];
    this.isGameOver = false;
    this.consecutiveSixes = 0;
    this.consecutiveDoubles = 0;
    this.players.forEach((p) => {
      p.pawns.forEach((pawn) => {
        pawn.stepOnTrack = -1;
        pawn.isFinished = false;
      });
    });
  }
}

// Asynchronous Native C++ WebAssembly Bridge for Mobile 60 FPS
let nativeWasmModule = null;
async function initNativeWasmEngine() {
  if (typeof window !== 'undefined' && typeof window.LudoNativeEngine === 'function') {
    try {
      nativeWasmModule = await window.LudoNativeEngine();
      return nativeWasmModule;
    } catch (e) {
      nativeWasmModule = null;
    }
  }
  return null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LudoGameEngine, Player, Pawn, initNativeWasmEngine };
}
