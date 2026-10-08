const { LudoGameEngine } = require('../public/js/game_engine.js');
const { LudoAiBot } = require('../public/js/ai_bot.js');

const engine = new LudoGameEngine();
console.log("Engine initialized:");
console.log("activePlayerCount:", engine.activePlayerCount);
console.log("Players:", engine.players.map(p => ({ id: p.id, name: p.name, isBot: p.isBot })));

console.log("\nSimulating advanceTurn calls:");
for (let i = 0; i < 8; i++) {
  console.log(`Current player before advance: ${engine.currentPlayer.name} (id: ${engine.currentPlayer.id}, isBot: ${engine.currentPlayer.isBot})`);
  const nextId = engine.advanceTurn();
  console.log(` -> Advanced to: ${engine.currentPlayer.name} (id: ${nextId}, isBot: ${engine.currentPlayer.isBot})`);
}
