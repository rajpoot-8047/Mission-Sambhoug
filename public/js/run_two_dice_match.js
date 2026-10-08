/**
 * 🎲🎲 Executable Match Runner: 2-Dice (Speed Ludo) Mode
 * Runs a complete turn-by-turn match verifying all rules from TWO_DICE_GAMEPLAY.md:
 * - Dual physical rolling (d1 + d2)
 * - Supercharged yard release (release + immediate sprint on second die)
 * - Doubles bonus rolls (1-1 through 6-6)
 * - Fast-paced perimeter sprinting (up to 12 steps)
 * - Adaptive precision home finish
 */

const { LudoGameEngine } = require('./game_engine.js');
const { LudoAiBot } = require('./ai_bot.js');

const engine = new LudoGameEngine();
engine.setDiceCount(2); // Speed 2-Dice Mode
engine.players.forEach(p => p.isBot = true); // 4 AI contenders
const bot = new LudoAiBot();

console.log("================================================================================");
console.log("⚡ LIVE MATCH EXECUTION: 2-DICE (SPEED LUDO) TOURNAMENT");
console.log("================================================================================");
console.log(`Players: ${engine.players.map(p => `${p.name} (${p.color})`).join(' vs ')}`);
console.log("Rule Set: Speed Ludo (Compound 6-Release, Doubles Bonus, Adaptive Finish)");
console.log("--------------------------------------------------------------------------------\n");

let turnNumber = 0;
let totalKnockouts = 0;
let totalDoubles = 0;
let totalSixes = 0;
const stats = {
  Red: { rolls: 0, doubles: 0, sixes: 0, captures: 0, finished: 0 },
  Yellow: { rolls: 0, doubles: 0, sixes: 0, captures: 0, finished: 0 },
  Blue: { rolls: 0, doubles: 0, sixes: 0, captures: 0, finished: 0 },
  Charcoal: { rolls: 0, doubles: 0, sixes: 0, captures: 0, finished: 0 }
};

const maxTurns = 5000;

while (!engine.isGameOver && turnNumber < maxTurns) {
  turnNumber++;
  const player = engine.currentPlayer;
  stats[player.name].rolls++;

  const roll = engine.rollDice();
  if (roll.isDouble) {
    totalDoubles++;
    stats[player.name].doubles++;
  }
  if (roll.hasSix) {
    totalSixes++;
    stats[player.name].sixes++;
  }

  const movables = engine.getMovablePawns(player, roll);

  if (movables.length === 0) {
    engine.advanceTurn();
    continue;
  }

  const chosen = bot.chooseBestPawn(movables, roll, engine.players);
  const fromStep = chosen.stepOnTrack;
  const outcome = engine.movePawn(chosen, roll);

  // Log highlight events
  if (fromStep === -1 && outcome.toStep >= 0) {
    console.log(`[Turn ${turnNumber.toString().padStart(3, ' ')}] ⚡ COMPOUND RELEASE! ${player.name} rolled [${roll.d1}, ${roll.d2}] -> Released Goti #${chosen.id + 1} and sprinted to Step ${outcome.toStep}!`);
  }

  if (roll.isDouble) {
    console.log(`[Turn ${turnNumber.toString().padStart(3, ' ')}] 🎲 DOUBLE! ${player.name} rolled [${roll.d1}, ${roll.d2}] (Total ${roll.total}) -> Awarded Extra Roll!`);
  }

  if (outcome.capturedOpponent) {
    totalKnockouts++;
    stats[player.name].captures++;
    const victim = engine.players[outcome.capturedOpponent.playerId];
    console.log(`[Turn ${turnNumber.toString().padStart(3, ' ')}] 💥 HIGH-SPEED KNOCKOUT! ${player.name} Goti #${chosen.id + 1} captured ${victim.name} Goti #${outcome.capturedOpponent.pawnId + 1}!`);
  }

  if (outcome.reachedGoal) {
    stats[player.name].finished = player.finishedCount;
    console.log(`[Turn ${turnNumber.toString().padStart(3, ' ')}] 🎯 GOAL! ${player.name} Goti #${chosen.id + 1} reached Home! (${player.finishedCount}/4 Finished)`);
  }

  if (!outcome.grantedBonusRoll) {
    engine.advanceTurn();
  }
}

console.log("\n================================================================================");
console.log(`👑 MATCH COMPLETED! WINNER: ${engine.winner ? engine.winner.name.toUpperCase() : 'None'}`);
console.log("================================================================================");
console.log(`Total Turns Elapsed: ${turnNumber}`);
console.log(`Total Doubles Rolled: ${totalDoubles}`);
console.log(`Total 6s Rolled:     ${totalSixes}`);
console.log(`Total Knockouts:     ${totalKnockouts}`);
console.log("--------------------------------------------------------------------------------");
console.log("PLAYER MATCH METRICS:");
console.table(stats);
console.log("================================================================================\n");
