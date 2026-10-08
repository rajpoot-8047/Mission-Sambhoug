const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Enable universal CORS for cross-origin fetch requests from LiveServer/Vite/Localhost
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

function getLocalLanIp() {
  const interfaces = os.networkInterfaces();
  let wifiIp = null;
  let ethernetIp = null;
  let fallbackIp = null;

  for (const devName in interfaces) {
    const isVirtual = /virtual|vbox|vmware|pseudo|loopback/i.test(devName);
    const iface = interfaces[devName];

    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && !alias.internal) {
        if (/wi-fi|wifi|wireless|wlan/i.test(devName) && !isVirtual) {
          wifiIp = alias.address;
        } else if (/ethernet|eth/i.test(devName) && !isVirtual && !alias.address.startsWith('192.168.56.')) {
          ethernetIp = alias.address;
        } else if (!isVirtual && !alias.address.startsWith('192.168.56.')) {
          fallbackIp = alias.address;
        }
      }
    }
  }

  return wifiIp || ethernetIp || fallbackIp || '127.0.0.1';
}

const publicDir = path.resolve(__dirname, '..');
const assetsDir = path.resolve(__dirname, '../../assets');

app.use(express.static(publicDir));

// Serve raw GLB file if requested
app.use('/models', express.static(assetsDir));

// LAN info endpoint for instant QR code and Wi-Fi host discovery
app.get('/api/lan-info', (req, res) => {
  const lanIp = getLocalLanIp();
  res.json({
    localIp: lanIp,
    port: PORT,
    lanUrl: `http://${lanIp}:${PORT}`
  });
});

// Game rooms in memory
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

const PLAYER_ROLES = [
  { id: 0, color: 'Red', hex: '#ba1d1d' },
  { id: 1, color: 'Yellow', hex: '#b58900' },
  { id: 2, color: 'Blue', hex: '#0c4bbd' },
  { id: 3, color: 'Charcoal', hex: '#2b3238' }
];

io.on('connection', (socket) => {
  let currentRoom = null;
  let playerIndex = -1;

  socket.on('create_room', ({ playerName, roomCode }) => {
    const code = (roomCode && typeof roomCode === 'string' && roomCode.trim().length >= 4)
      ? roomCode.toUpperCase().trim()
      : generateRoomCode();

    const room = {
      code,
      hostId: socket.id,
      players: [
        {
          id: socket.id,
          name: playerName || 'Player 1',
          playerIndex: 0,
          color: PLAYER_ROLES[0].color,
          ready: true
        }
      ],
      currentTurn: 0,
      inGame: false,
      diceValue: 1,
      canRoll: true
    };

    rooms.set(code, room);
    currentRoom = code;
    playerIndex = 0;

    socket.join(code);
    socket.emit('room_created', {
      roomCode: code,
      playerIndex: 0,
      role: PLAYER_ROLES[0],
      players: room.players
    });
  });

  socket.on('join_room', ({ roomCode, playerName, rejoinIndex }) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('error_message', { message: `Room "${code}" not found. Verify the code with the host!` });
      return;
    }

    // Check if player is already in room or rejoining their existing slot
    let existingIdx = room.players.findIndex((p) => p.id === socket.id);
    if (existingIdx === -1 && (rejoinIndex !== undefined || playerName)) {
      existingIdx = room.players.findIndex((p) => 
        (typeof rejoinIndex === 'number' && p.playerIndex === rejoinIndex) ||
        (p.name && playerName && p.name.trim().toLowerCase() === playerName.trim().toLowerCase())
      );
      if (existingIdx !== -1) {
        room.players[existingIdx].id = socket.id;
        room.players[existingIdx].disconnected = false;
        console.log(`🔄 Re-admitted player ${room.players[existingIdx].name} to slot ${existingIdx} in room ${code}`);
      }
    }

    if (existingIdx !== -1) {
      currentRoom = code;
      playerIndex = existingIdx;
      socket.join(code);
      socket.emit('room_joined', {
        roomCode: code,
        playerIndex: existingIdx,
        role: PLAYER_ROLES[existingIdx],
        players: room.players,
        inGame: room.inGame
      });
      io.to(code).emit('players_updated', {
        players: room.players
      });
      return;
    }

    if (room.players.length >= 4) {
      socket.emit('error_message', { message: 'Room is already full (maximum 4 players).' });
      return;
    }

    const assignedIndex = room.players.length;
    const player = {
      id: socket.id,
      name: playerName || `Player ${assignedIndex + 1}`,
      playerIndex: assignedIndex,
      color: PLAYER_ROLES[assignedIndex].color,
      ready: true
    };

    room.players.push(player);
    currentRoom = code;
    playerIndex = assignedIndex;

    socket.join(code);

    socket.emit('room_joined', {
      roomCode: code,
      playerIndex: assignedIndex,
      role: PLAYER_ROLES[assignedIndex],
      players: room.players
    });

    io.to(code).emit('players_updated', {
      players: room.players
    });
  });

  socket.on('start_game', (data) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.hostId !== socket.id) return;

    room.inGame = true;
    room.currentTurn = 0;
    room.canRoll = true;
    const diceCount = (data && typeof data.diceCount === 'number') ? data.diceCount : (room.diceCount || 1);
    io.to(currentRoom).emit('game_started', {
      currentTurn: 0,
      players: room.players,
      diceCount
    });
  });

  socket.on('roll_dice', ({ val1, val2, rollResult, actionId }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    // Server-side turn validation: only the designated active player can roll
    if (room.inGame) {
      if (typeof room.currentTurn === 'number' && room.currentTurn !== playerIndex) {
        socket.emit('error_message', { message: "It is not your turn to roll!" });
        return;
      }
      if (!room.canRoll) {
        socket.emit('error_message', { message: "Dice already rolled for this turn!" });
        return;
      }
      room.canRoll = false; // Lock roll action immediately until turn completes or bonus is earned
    }

    io.to(currentRoom).emit('dice_rolled', {
      playerId: playerIndex,
      val1,
      val2,
      rollResult,
      actionId
    });
  });

  socket.on('pawn_move', (moveData) => {
    if (!currentRoom) return;
    io.to(currentRoom).emit('pawn_moved', {
      ...moveData,
      playerId: playerIndex
    });
  });

  socket.on('two_dice_step', (stepData) => {
    if (!currentRoom) return;
    io.to(currentRoom).emit('two_dice_stepped', {
      ...stepData,
      playerId: playerIndex
    });
  });

  socket.on('two_dice_pass', (passData) => {
    if (!currentRoom) return;
    io.to(currentRoom).emit('two_dice_pass', {
      ...passData,
      playerId: playerIndex
    });
  });

  const handleTurnAdvance = (turnData) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    const activePlayerId = (typeof turnData.turnPlayerId === 'number')
      ? turnData.turnPlayerId
      : ((typeof turnData.activePlayerId === 'number')
        ? turnData.activePlayerId
        : ((typeof turnData.nextTurn === 'number') ? turnData.nextTurn : (room ? room.currentTurn : 0)));

    if (room) {
      room.currentTurn = activePlayerId;
      room.canRoll = true; // Unlock roll action for the designated active player
    }
    const isBonus = turnData.isBonusRoll || turnData.grantedBonus || false;
    const bonusMsg = turnData.bonusMessage || null;

    io.to(currentRoom).emit('turn_state', {
      ...turnData,
      turnPlayerId: activePlayerId,
      activePlayerId,
      nextTurn: activePlayerId,
      isBonusRoll: isBonus,
      bonusMessage: bonusMsg
    });
    io.to(currentRoom).emit('turn_changed', {
      activePlayerId,
      nextTurn: activePlayerId,
      isBonusRoll: isBonus,
      bonusMessage: bonusMsg
    });
    io.to(currentRoom).emit('next_player', {
      activePlayerId,
      nextTurn: activePlayerId
    });
  };

  socket.on('turn_state', handleTurnAdvance);
  socket.on('turn_change', handleTurnAdvance);
  socket.on('turn_changed', handleTurnAdvance);
  socket.on('next_player', handleTurnAdvance);

  socket.on('chat_message', ({ text, sender }) => {
    if (!currentRoom) return;
    io.to(currentRoom).emit('chat_broadcast', {
      sender: sender || `Player ${playerIndex + 1}`,
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // WebRTC P2P Signaling Relay (Offer, Answer, ICE Candidates)
  socket.on('webrtc_signal', ({ targetPeerId, signalData, roomCode }) => {
    if (targetPeerId) {
      io.to(targetPeerId).emit('webrtc_signal', {
        fromPeerId: socket.id,
        fromIndex: playerIndex,
        signalData
      });
    } else if (currentRoom || roomCode) {
      socket.to(currentRoom || roomCode).emit('webrtc_signal', {
        fromPeerId: socket.id,
        fromIndex: playerIndex,
        signalData
      });
    }
  });

  socket.on('request_game_sync', (data) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('request_game_sync', data);
  });

  socket.on('game_sync_snapshot', (snapshot) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('game_sync_snapshot', snapshot);
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    if (room.inGame) {
      // In active game: preserve player slot for automatic re-joining
      const p = room.players.find((pl) => pl.id === socket.id);
      if (p) p.disconnected = true;
      io.to(currentRoom).emit('player_left', {
        leftIndex: playerIndex,
        players: room.players,
        temporary: true
      });
      return;
    }

    room.players = room.players.filter((p) => p.id !== socket.id);
    if (room.players.length === 0) {
      rooms.delete(currentRoom);
    } else {
      if (room.hostId === socket.id) {
        room.hostId = room.players[0].id;
      }
      io.to(currentRoom).emit('player_left', {
        leftIndex: playerIndex,
        players: room.players,
        newHost: room.hostId
      });
      io.to(currentRoom).emit('players_updated', {
        players: room.players
      });
    }
  });
});

server.listen(PORT, () => {
  const lanIp = getLocalLanIp();
  console.log(`=========================================`);
  console.log(`👑 Mission Sambhoug 3D Ludo Server Started!`);
  console.log(`   Local URL:  http://localhost:${PORT}`);
  console.log(`   LAN Wi-Fi:  http://${lanIp}:${PORT}`);
  console.log(`=========================================`);
});
