/**
 * Ludo Heuristic AI Bot
 * Evaluates possible moves and selects the best strategic option
 */

if (typeof SAFE_STAR_INDICES === 'undefined' && typeof require !== 'undefined') {
  const _bd = require('./board_data.js');
  global.START_TILES = _bd.START_TILES;
  global.SAFE_STAR_INDICES = _bd.SAFE_STAR_INDICES;
  global.CASTLE_STAR_INDICES = _bd.CASTLE_STAR_INDICES;
}

class LudoAiBot {
  chooseBestPawn(validPawns, roll, allPlayers) {
    if (!validPawns || validPawns.length === 0) return null;
    if (validPawns.length === 1) return validPawns[0];

    let bestPawn = validPawns[0];
    let maxScore = -999999;

    for (const pawn of validPawns) {
      const score = this.evaluateMoveScore(pawn, roll, allPlayers);
      if (score > maxScore) {
        maxScore = score;
        bestPawn = pawn;
      }
    }

    return bestPawn;
  }

  /**
   * Evaluates the strategic score of advancing a single pawn
   */
  evaluateMoveScore(pawn, rollInput, allPlayers) {
    let score = 0;
    const r = typeof rollInput === 'number'
      ? { d1: rollInput, d2: 0, total: rollInput, hasSix: rollInput === 6, isSingleDie: true }
      : rollInput;
    const hasSix = r.hasSix || (r.d1 === 6 || r.d2 === 6);
    const isTwoDice = !r.isSingleDie && (r.d1 > 0 && r.d2 > 0);

    // 1. Yard Release
    if (pawn.isInYard) {
      if (!hasSix && (!isTwoDice || (r.total !== 6 && !r.isDouble))) {
        return -99999;
      }

      if (isTwoDice && hasSix) {
        // Supercharged Release + Immediate Sprint
        let sprint = (r.d1 === 6) ? r.d2 : r.d1;
        if (r.d1 === 6 && r.d2 === 6) sprint = 6;
        score += 135 + sprint * 3;

        const startTile = START_TILES[pawn.playerId];
        const sprintRing = (startTile + sprint) % 52;
        if (SAFE_STAR_INDICES.includes(sprintRing)) {
          score += 45;
        }
        for (const opp of allPlayers) {
          if (opp.id === pawn.playerId) continue;
          for (const oppPawn of opp.pawns) {
            if (oppPawn.currentRingIndex === sprintRing && sprintRing !== START_TILES[opp.id]) {
              score += 150;
            }
          }
        }
      } else {
        score += 90;
      }
      return score;
    }

    // Determine steps delta
    let delta = r.total;
    if (isTwoDice && pawn.stepOnTrack + r.total > 56) {
      if (pawn.stepOnTrack + r.d1 === 56) delta = r.d1;
      else if (pawn.stepOnTrack + r.d2 === 56) delta = r.d2;
      else if (pawn.stepOnTrack + r.d1 <= 56 && pawn.stepOnTrack + r.d2 <= 56) delta = Math.max(r.d1, r.d2);
      else if (pawn.stepOnTrack + r.d1 <= 56) delta = r.d1;
      else if (pawn.stepOnTrack + r.d2 <= 56) delta = r.d2;
      else return -99999;
    } else if (pawn.stepOnTrack + delta > 56) {
      return -99999;
    }

    const nextStep = pawn.stepOnTrack + delta;

    // 2. Reaching Goal (Step 56)
    if (nextStep === 56) {
      score += 200;
      return score;
    }

    // 3. Entering the protected home runway (steps 51-55)
    if (nextStep >= 51) {
      score += 80 + (nextStep - 51) * 10;
      return score;
    }

    // 4. Knock-out capture check on ring
    const startTile = START_TILES[pawn.playerId];
    const targetRingIdx = (startTile + nextStep) % 52;
    const safeStars = (typeof SAFE_STAR_INDICES !== 'undefined') ? SAFE_STAR_INDICES : [0, 8, 13, 21, 26, 34, 39, 47];
    const isTargetSafeStar = safeStars.includes(targetRingIdx);

    let capturedEnemy = false;
    if (!isTargetSafeStar) {
      for (const opp of allPlayers) {
        if (opp.id === pawn.playerId) continue;
        for (const oppPawn of opp.pawns) {
          if (oppPawn.currentRingIndex === targetRingIdx) {
            score += 160; // Knockout capture on standard tile!
            capturedEnemy = true;
            break;
          }
        }
      }
    } else {
      score += 60; // Landing on safe star sanctuary
    }

    // 5. Threat avoidance: moving away if an opponent is right behind current tile
    const currentRingIdx = pawn.currentRingIndex;
    if (currentRingIdx !== -1 && !safeStars.includes(currentRingIdx)) {
      for (const opp of allPlayers) {
        if (opp.id === pawn.playerId) continue;
        for (const oppPawn of opp.pawns) {
          const oppRing = oppPawn.currentRingIndex;
          if (oppRing !== -1) {
            const dist = (currentRingIdx - oppRing + 52) % 52;
            if (dist >= 1 && dist <= 6) {
              score += 50; // Escape danger!
            }
          }
        }
      }
    }

    // 6. Danger penalty: landing on an unsafe ring tile where an opponent is 1-6 steps behind
    if (!isTargetSafeStar && !capturedEnemy) {
      for (const opp of allPlayers) {
        if (opp.id === pawn.playerId) continue;
        for (const oppPawn of opp.pawns) {
          const oppRing = oppPawn.currentRingIndex;
          if (oppRing !== -1) {
            const dist = (targetRingIdx - oppRing + 52) % 52;
            if (dist >= 1 && dist <= 6) {
              score -= 45; // Vulnerable to enemy strike!
            }
          }
        }
      }
    }

    // 7. Progressive forward distance
    score += nextStep * 2;

    return score;
  }

  /**
   * Master Combinatorial 2-Dice Tactical Planner
   * Evaluates all permutations of [Die 0, Die 1] across all gotiyan,
   * comparing compound single-goti sprints vs split dual-goti moves.
   */
  chooseBestTwoDicePlan(player, dicePool, allPlayers, engine) {
    if (!dicePool || dicePool.length < 2) return null;

    const d0 = dicePool[0];
    const d1 = dicePool[1];

    const canUseD0 = !d0.used;
    const canUseD1 = !d1.used;

    if (!canUseD0 && !canUseD1) return null;

    // Helper: evaluate single step for a pawn
    const evaluateStep = (pawn, dieValue, currentTrackStep) => {
      const isYard = currentTrackStep === -1;
      if (isYard) {
        if (dieValue !== 6) return { legal: false, score: -99999, nextStep: -1, ringIdx: -1 };
        const start = START_TILES[pawn.playerId];
        if (engine && engine.hasOpponentBlock(pawn.playerId, start)) {
          return { legal: false, score: -99999, nextStep: -1, ringIdx: -1 };
        }
        let score = 90; // Pawn released onto safe start star
        return { legal: true, score, nextStep: 0, ringIdx: start };
      }

      const nextStep = currentTrackStep + dieValue;
      if (nextStep > 56) return { legal: false, score: -99999, nextStep: -1, ringIdx: -1 };

      if (nextStep <= 50) {
        const start = START_TILES[pawn.playerId];
        const targetRing = (start + nextStep) % 52;
        if (engine && engine.hasOpponentBlock(pawn.playerId, targetRing)) {
          return { legal: false, score: -99999, nextStep: -1, ringIdx: -1 };
        }
      }

      let score = 0;
      if (nextStep === 56) {
        score += 220; // Goal finish!
        return { legal: true, score, nextStep, ringIdx: -1 };
      }

      if (nextStep >= 51) {
        score += 85 + (nextStep - 51) * 10;
        return { legal: true, score, nextStep, ringIdx: -1 };
      }

      const start = START_TILES[pawn.playerId];
      const targetRing = (start + nextStep) % 52;
      const safeStars = (typeof SAFE_STAR_INDICES !== 'undefined') ? SAFE_STAR_INDICES : [0, 8, 13, 21, 26, 34, 39, 47];
      const isSafe = safeStars.includes(targetRing);

      let captured = false;
      if (!isSafe) {
        for (const opp of allPlayers) {
          if (opp.id === pawn.playerId) continue;
          for (const op of opp.pawns) {
            if (op.currentRingIndex === targetRing) {
              score += 170; // Knockout on standard tile!
              captured = true;
              break;
            }
          }
          if (captured) break;
        }
      } else {
        score += 65; // Safe star sanctuary!
      }

      // Danger check on landing
      if (!isSafe && !captured) {
        for (const opp of allPlayers) {
          if (opp.id === pawn.playerId) continue;
          for (const op of opp.pawns) {
            if (op.currentRingIndex !== -1) {
              const dist = (targetRing - op.currentRingIndex + 52) % 52;
              if (dist >= 1 && dist <= 6) {
                score -= 45;
              }
            }
          }
        }
      }

      // Escape check
      const currentRing = currentTrackStep <= 50 ? (start + currentTrackStep) % 52 : -1;
      if (currentRing !== -1 && !safeStars.includes(currentRing)) {
        for (const opp of allPlayers) {
          if (opp.id === pawn.playerId) continue;
          for (const op of opp.pawns) {
            if (op.currentRingIndex !== -1) {
              const dist = (currentRing - op.currentRingIndex + 52) % 52;
              if (dist >= 1 && dist <= 6) {
                score += 45;
              }
            }
          }
        }
      }

      score += nextStep * 2;
      return { legal: true, score, nextStep, ringIdx: targetRing };
    };

    // If only one die is available:
    if (canUseD0 && !canUseD1) {
      let bestP = null;
      let maxS = -999999;
      for (const p of player.pawns) {
        if (p.isFinished) continue;
        const res = evaluateStep(p, d0.value, p.stepOnTrack);
        if (res.legal && res.score > maxS) {
          maxS = res.score;
          bestP = p;
        }
      }
      return bestP ? { firstDieIndex: 0, firstPawn: bestP, secondDieIndex: null, secondPawn: null } : null;
    }

    if (!canUseD0 && canUseD1) {
      let bestP = null;
      let maxS = -999999;
      for (const p of player.pawns) {
        if (p.isFinished) continue;
        const res = evaluateStep(p, d1.value, p.stepOnTrack);
        if (res.legal && res.score > maxS) {
          maxS = res.score;
          bestP = p;
        }
      }
      return bestP ? { firstDieIndex: 1, firstPawn: bestP, secondDieIndex: null, secondPawn: null } : null;
    }

    // Both dice are available: evaluate candidate sequences
    let bestPlan = null;
    let highestTotalScore = -999999;

    const permutations = [
      { firstIdx: 0, firstVal: d0.value, secondIdx: 1, secondVal: d1.value },
      { firstIdx: 1, firstVal: d1.value, secondIdx: 0, secondVal: d0.value }
    ];

    for (const perm of permutations) {
      for (const p1 of player.pawns) {
        if (p1.isFinished) continue;

        const res1 = evaluateStep(p1, perm.firstVal, p1.stepOnTrack);
        if (!res1.legal) continue;

        // Try using second die on same pawn p1 (Compound sprint)
        if (res1.nextStep < 56) {
          const res2Compound = evaluateStep(p1, perm.secondVal, res1.nextStep);
          if (res2Compound.legal) {
            const isReleaseSprint = (p1.stepOnTrack === -1 && res1.nextStep === 0 && res2Compound.nextStep > 0);
            const compoundBonus = isReleaseSprint ? 50 : 20;
            const totalScore = res1.score + res2Compound.score + compoundBonus;

            if (totalScore > highestTotalScore) {
              highestTotalScore = totalScore;
              bestPlan = {
                firstDieIndex: perm.firstIdx,
                firstPawn: p1,
                secondDieIndex: perm.secondIdx,
                secondPawn: p1,
                score: totalScore
              };
            }
          }
        }

        // Try using second die on different pawn p2 (Split move)
        let anySecondLegal = false;
        for (const p2 of player.pawns) {
          if (p2.id === p1.id || p2.isFinished) continue;

          const res2Split = evaluateStep(p2, perm.secondVal, p2.stepOnTrack);
          if (res2Split.legal) {
            anySecondLegal = true;
            const totalScore = res1.score + res2Split.score;

            if (totalScore > highestTotalScore) {
              highestTotalScore = totalScore;
              bestPlan = {
                firstDieIndex: perm.firstIdx,
                firstPawn: p1,
                secondDieIndex: perm.secondIdx,
                secondPawn: p2,
                score: totalScore
              };
            }
          }
        }

        // If no second move is possible, record single-move option
        if (!anySecondLegal && res1.score > highestTotalScore) {
          highestTotalScore = res1.score;
          bestPlan = {
            firstDieIndex: perm.firstIdx,
            firstPawn: p1,
            secondDieIndex: null,
            secondPawn: null,
            score: res1.score
          };
        }
      }
    }

    return bestPlan;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LudoAiBot };
}
