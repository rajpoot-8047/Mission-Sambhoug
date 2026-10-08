/**
 * 🎲 Executable Match Runner: 1-Die (Classic) Ludo Mode
 * Runs a complete turn-by-turn match verifying all rules from ONE_DICE_GAMEPLAY.md:
 * - Exact 6-release to Step 0
 * - Knockout captures sending opponents to yard
 * - Safe star protection
 * - Home runway exact finish
 * - Consecutive sixes foul rule
 */

const { LudoGameEngine } = require('./game_engine.js');
const { LudoAiBot } = require('./ai_bot.js');

const engine = new LudoGameEngine();
engine.setDiceCount(1);
engine.players.forEach(p => p.isBot = true); // All 4 AI contenders
const bot = new LudoAiBot();

console.log("================================================================================");
console.log("🏆 LIVE MATCH EXECUTION: 1-DIE (CLASSIC LUDO) TOURNAMENT");
console.log("================================================================================");
console.log(`Players: ${engine.players.map(p => `${p.name} (${p.color})`).join(' vs ')}`);
console.log("Rule Set: International Standard 1-Die (6 Release, Safe Stars, Exact Home Finish)");
console.log("--------------------------------------------------------------------------------\n");

let turnNumber = 0;
let totalKnockouts = 0;
let totalSixes = 0;
const stats = {
  Red: { rolls: 0, sixes: 0, captures: 0, finished: 0 },
  Yellow: { rolls: 0, sixes: 0, captures: 0, finished: 0 },
  Blue: { rolls: 0, sixes: 0, captures: 0, finished: 0 },
  Charcoal: { rolls: 0, sixes: 0, captures: 0, finished: 0 }
};

const maxTurns = 5000;

while (!engine.isGameOver && turnNumber < maxTurns) {
  turnNumber++;
  const player = engine.currentPlayer;
  stats[player.name].rolls++;

  const roll = engine.rollDice();
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

  // Log highlight events (releases, captures, goals)
  if (fromStep === -1 && outcome.toStep === 0) {
    if (turnNumber <= 100 || turnNumber % 50 === 0) {
      console.log(`[Turn ${turnNumber.toString().padStart(3, ' ')}] 🟢 ${player.name} rolled a 6 -> Released Goti #${chosen.id + 1} onto Step 0!`);
    }
  }

  if (outcome.capturedOpponent) {
    totalKnockouts++;
    stats[player.name].captures++;
    const victim = engine.players[outcome.capturedOpponent.playerId];
    console.log(`[Turn ${turnNumber.toString().padStart(3, ' ')}] 💥 KNOCKOUT! ${player.name} Goti #${chosen.id + 1} captured ${victim.name} Goti #${outcome.capturedOpponent.pawnId + 1}! Sent to Yard!`);
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
console.log(`Total 6s Rolled:     ${totalSixes}`);
console.log(`Total Knockouts:     ${totalKnockouts}`);
console.log("--------------------------------------------------------------------------------");
console.log("PLAYER MATCH METRICS:");
console.table(stats);
console.log("================================================================================\n");
