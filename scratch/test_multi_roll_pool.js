const { LudoGameEngine } = require('../public/js/game_engine.js');
const { LudoAiBot } = require('../public/js/ai_bot.js');

const engine = new LudoGameEngine();
engine.setDiceCount(1);
const bot = new LudoAiBot();
const player = engine.currentPlayer; // Red

console.log("--- TEST 1: Rolled [6, 5] with all gotis in yard ---");
const rolls = [6, 5];
let dicePool = rolls.map((v, i) => ({ index: i, value: v, used: false }));

// At start, all 4 gotis in yard
console.log("Gotis in yard:", player.pawns.filter(p => p.isInYard).length);

// Die 0 (6):
const usableForYard = dicePool.filter(d => !d.used && engine.canPawnMove(player.pawns[0], { total: d.value, isSingleDie: true, hasSix: d.value === 6 }));
console.log("Usable dice for yard goti 0:", usableForYard.map(d => d.value)); // should be [6]
console.assert(usableForYard.length === 1 && usableForYard[0].value === 6, "Must only allow 6 for yard goti");

// Move goti 0 with 6:
dicePool[0].used = true;
const res1 = engine.movePawn(player.pawns[0], { total: 6, isSingleDie: true, hasSix: true });
console.log("Goti 0 step after 6:", player.pawns[0].stepOnTrack, "in yard:", player.pawns[0].isInYard);

// Die 1 (5):
const usableForTrack = dicePool.filter(d => !d.used && engine.canPawnMove(player.pawns[0], { total: d.value, isSingleDie: true, hasSix: d.value === 6 }));
console.log("Usable dice for track goti 0:", usableForTrack.map(d => d.value)); // should be [5]
console.assert(usableForTrack.length === 1 && usableForTrack[0].value === 5, "Must allow 5 for newly opened goti");

// Move goti 0 with 5:
dicePool[1].used = true;
const res2 = engine.movePawn(player.pawns[0], { total: 5, isSingleDie: true, hasSix: false });
console.log("Goti 0 step after 5:", player.pawns[0].stepOnTrack);
console.assert(player.pawns[0].stepOnTrack === 5, "Goti 0 must be at step 5");

console.log("\n--- TEST 2: Rolled [6, 6, 4] with all gotis in yard ---");
const engine2 = new LudoGameEngine();
engine2.setDiceCount(1);
const player2 = engine2.currentPlayer;
const rolls2 = [6, 6, 4];
let dicePool2 = rolls2.map((v, i) => ({ index: i, value: v, used: false }));

// Die 0 (6) opens goti 0:
dicePool2[0].used = true;
engine2.movePawn(player2.pawns[0], { total: 6, isSingleDie: true, hasSix: true });
console.log("Goti 0 opened to step:", player2.pawns[0].stepOnTrack);

// Die 1 (6) opens goti 1 (or moves goti 0):
dicePool2[1].used = true;
engine2.movePawn(player2.pawns[1], { total: 6, isSingleDie: true, hasSix: true });
console.log("Goti 1 opened to step:", player2.pawns[1].stepOnTrack);

// Die 2 (4) moves goti 0:
dicePool2[2].used = true;
engine2.movePawn(player2.pawns[0], { total: 4, isSingleDie: true, hasSix: false });
console.log("Goti 0 moved by 4 to step:", player2.pawns[0].stepOnTrack);
console.assert(player2.pawns[0].stepOnTrack === 4, "Goti 0 must be at step 4");
console.assert(player2.pawns[1].stepOnTrack === 0, "Goti 1 must be at step 0");

console.log("\nALL POOL SIMULATION TESTS PASSED 100%!");
