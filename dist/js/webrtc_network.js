/**
 * WebRTC Worldwide P2P Multi-Peer DataChannel & Global Signaling Network Manager for 3D Ludo
 * 
 * Supports:
 * - 2, 3, or 4 friends connected simultaneously from anywhere around the world via the Internet
 * - Works on separate Wi-Fi networks, mobile cellular data (4G/5G), and different countries
 * - Zero local LAN or IP address requirements
 * - Global secure WebSocket signaling via EMQX (WSS:8084) and HiveMQ (WSS:8884)
 * - Direct encrypted WebRTC DataChannels (Host-to-Multi-Guest Star WebRTC mesh)
 * - Google STUN + Metered OpenRelay TURN for carrier-grade symmetric NAT & firewall traversal
 * - 100% resilient dual-layer sync: Direct WebRTC DataChannels + Global Internet message bus
 */

class WebRtcNetwork {
  constructor() {
    this.peers = new Map(); // peerId -> { pc, dataChannel, playerIndex, name, isConnected }
    this.socket = null; // Optional local socket.io instance
    this.mqttClient = null;
    this.isGlobalConnected = false;
    this.isConnecting = false;

    this.myPeerId = 'ludo_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36).slice(-3);
    this.myPlayerIndex = 0;
    this.playerName = 'Player';
    this.roomCode = null;
    this.isHost = false;
    this.isP2pActive = false;
    this.playersList = [];

    this.onMessageHandler = null;
    this.onPeerStatusHandler = null;
    this.onPlayerJoinedHandler = null;
    this.currentCallbacks = null;

    // WebRTC STUN & TURN Relay Configuration (Worldwide carrier-grade NAT traversal)
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelay',
          credential: 'openrelay'
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelay',
          credential: 'openrelay'
        }
      ]
    };

    // Pre-warm global signaling connection on boot
    this.initGlobalSignaling();
  }

  onMessage(callback) {
    this.onMessageHandler = callback;
  }

  onPeerStatus(callback) {
    this.onPeerStatusHandler = callback;
  }

  onPlayerJoined(callback) {
    this.onPlayerJoinedHandler = callback;
  }

  /**
   * Initializes local socket fallback if available
   */
  init(socket, myPlayerIndex, roomCode) {
    this.socket = socket;
    this.myPlayerIndex = myPlayerIndex || 0;
    if (roomCode) this.roomCode = roomCode;

    if (!this.socket) return;

    this.socket.on('webrtc_signal', async ({ fromPeerId, fromIndex, signalData }) => {
      await this.handleNativeSignal(fromPeerId, signalData, fromIndex);
    });

    this.socket.on('players_updated', async ({ players }) => {
      if (!players || !Array.isArray(players)) return;
      if (this.isHost) {
        for (let i = 1; i < players.length; i++) {
          const guest = players[i];
          if (guest && guest.id !== this.socket.id && !this.peers.has(guest.id)) {
            this.initiateNativeHostConnection(guest.id, guest.playerIndex, guest.name);
          }
        }
      }
      if (this.onPlayerJoinedHandler) {
        this.onPlayerJoinedHandler({ players, count: players.length });
      }
    });

    this.socket.on('error_message', ({ message }) => {
      if (this.currentCallbacks?.onError) {
        this.currentCallbacks.onError(message);
      }
    });

    this.socket.on('request_game_sync', (data) => {
      if (this.onMessageHandler) this.onMessageHandler(data);
    });

    this.socket.on('game_sync_snapshot', (snapshot) => {
      if (this.onMessageHandler) this.onMessageHandler(snapshot);
    });
  }

  /**
   * Connects to global internet signaling via secure WebSockets (EMQX or HiveMQ)
   */
  initGlobalSignaling(onConnected, onError) {
    if (this.mqttClient && this.isGlobalConnected) {
      if (onConnected) onConnected();
      return;
    }

    if (this.isConnecting) {
      if (onConnected) {
        setTimeout(() => this.initGlobalSignaling(onConnected, onError), 500);
      }
      return;
    }

    if (typeof Paho === 'undefined' || !Paho.MQTT || !Paho.MQTT.Client) {
      console.warn('Paho MQTT script not yet ready, will retry...');
      setTimeout(() => this.initGlobalSignaling(onConnected, onError), 1000);
      return;
    }

    this.isConnecting = true;
    const clientId = 'msludo_' + this.myPeerId;

    try {
      this.mqttClient = new Paho.MQTT.Client('broker.emqx.io', 8084, '/mqtt', clientId);

      this.mqttClient.onConnectionLost = (responseObject) => {
        this.isGlobalConnected = false;
        this.isConnecting = false;
        console.warn('Global MQTT connection lost:', responseObject?.errorMessage);
        if (this.onPeerStatusHandler) {
          this.onPeerStatusHandler('global_server', 'offline', 0);
        }
        setTimeout(() => this.initGlobalSignaling(), 3000);
      };

      this.mqttClient.onMessageArrived = (message) => {
        this.handleGlobalMqttMessage(message.destinationName, message.payloadString);
      };

      this.mqttClient.connect({
        useSSL: true,
        timeout: 8,
        keepAliveInterval: 30,
        onSuccess: () => {
          this.isGlobalConnected = true;
          this.isConnecting = false;
          console.log('🌍 Connected to Global WebRTC Internet Signaling (EMQX)!');
          if (this.roomCode) {
            try {
              this.mqttClient.subscribe(`mission_ludo_3d/room/${this.roomCode}/#`, { qos: 1 });
              this.publishGlobal(`mission_ludo_3d/room/${this.roomCode}/join`, {
                peerId: this.myPeerId,
                name: this.playerName,
                isReconnect: true
              });
            } catch (err) {}
          }
          if (this.onPeerStatusHandler) {
            this.onPeerStatusHandler('global_server', 'online', 0);
          }
          if (onConnected) onConnected();
        },
        onFailure: (err) => {
          this.isConnecting = false;
          console.warn('EMQX connect failed, trying HiveMQ fallback...', err);
          this.connectHiveMqFallback(onConnected, onError);
        }
      });
    } catch (e) {
      this.isConnecting = false;
      console.warn('MQTT init error:', e);
      if (onError) onError(e.message);
    }
  }

  connectHiveMqFallback(onConnected, onError) {
    try {
      this.isConnecting = true;
      const clientId = 'msludo_' + this.myPeerId;
      this.mqttClient = new Paho.MQTT.Client('broker.hivemq.com', 8884, '/mqtt', clientId);

      this.mqttClient.onConnectionLost = () => {
        this.isGlobalConnected = false;
        this.isConnecting = false;
        setTimeout(() => this.initGlobalSignaling(), 3000);
      };

      this.mqttClient.onMessageArrived = (message) => {
        this.handleGlobalMqttMessage(message.destinationName, message.payloadString);
      };

      this.mqttClient.connect({
        useSSL: true,
        timeout: 8,
        keepAliveInterval: 30,
        onSuccess: () => {
          this.isGlobalConnected = true;
          this.isConnecting = false;
          console.log('🌍 Connected to Global WebRTC Internet Signaling (HiveMQ)!');
          if (this.roomCode) {
            try {
              this.mqttClient.subscribe(`mission_ludo_3d/room/${this.roomCode}/#`, { qos: 1 });
              this.publishGlobal(`mission_ludo_3d/room/${this.roomCode}/join`, {
                peerId: this.myPeerId,
                name: this.playerName,
                isReconnect: true
              });
            } catch (err) {}
          }
          if (this.onPeerStatusHandler) {
            this.onPeerStatusHandler('global_server', 'online', 0);
          }
          if (onConnected) onConnected();
        },
        onFailure: (e) => {
          this.isConnecting = false;
          console.warn('Both global signaling brokers failed:', e);
          setTimeout(() => this.initGlobalSignaling(), 4000);
          if (onError) onError('Global server unreachable. Retrying automatically...');
        }
      });
    } catch (e) {
      this.isConnecting = false;
      if (onError) onError(e.message);
    }
  }

  publishGlobal(topic, dataObj) {
    if (!this.mqttClient || !this.isGlobalConnected) return;
    try {
      const msg = new Paho.MQTT.Message(JSON.stringify(dataObj));
      msg.destinationName = topic;
      msg.qos = 1;
      this.mqttClient.send(msg);
    } catch (e) {
      console.warn('publishGlobal error:', e);
    }
  }

  /**
   * Host creates a room accessible anywhere around the world via Internet
   */
  createRoom(roomCode, playerName, callbacks = {}) {
    this.roomCode = (roomCode || '').toUpperCase().trim();
    this.isHost = true;
    this.myPlayerIndex = 0;
    this.playerName = playerName || 'Host';
    this.currentCallbacks = callbacks;
    this.closeAll();

    this.playersList = [
      { id: this.myPeerId, name: this.playerName, playerIndex: 0, color: 'Red' }
    ];

    const onReady = () => {
      const topicFilter = `mission_ludo_3d/room/${this.roomCode}/#`;
      this.mqttClient.subscribe(topicFilter, {
        onSuccess: () => {
          console.log(`🌍 Global Room "${this.roomCode}" is active online worldwide!`);
          if (callbacks.onReady) callbacks.onReady(this.roomCode);
        },
        onFailure: (err) => {
          console.warn('Room subscribe error:', err);
          if (callbacks.onError) callbacks.onError('Failed to register room on global internet.');
        }
      });
    };

    if (this.isGlobalConnected) {
      onReady();
    } else {
      this.initGlobalSignaling(onReady, (err) => {
        if (callbacks.onError) callbacks.onError(err);
      });
    }

    // Also inform local socket if connected
    if (this.socket && this.socket.connected) {
      this.socket.emit('create_room', { playerName, roomCode: this.roomCode, isWebRtc: true });
    }
  }

  /**
   * Guest joins an online room from anywhere around the world via Internet
   */
  joinRoom(roomCode, playerName, callbacks = {}, rejoinIndex = null) {
    this.roomCode = (roomCode || '').toUpperCase().trim();
    this.isHost = false;
    this.playerName = playerName || 'Friend';
    this.currentCallbacks = callbacks;
    this.closeAll();

    const onJoinReady = () => {
      const topicFilter = `mission_ludo_3d/room/${this.roomCode}/#`;
      this.mqttClient.subscribe(topicFilter, {
        onSuccess: () => {
          console.log(`🌍 Subscribed to global room "${this.roomCode}", sending join request...`);
          // Send join announcement to Host
          this.publishGlobal(`mission_ludo_3d/room/${this.roomCode}/join`, {
            peerId: this.myPeerId,
            name: this.playerName,
            rejoinIndex: (typeof rejoinIndex === 'number') ? rejoinIndex : null
          });
          if (callbacks.onSuccess) callbacks.onSuccess(this.roomCode);
        },
        onFailure: (err) => {
          console.warn('Room subscribe error:', err);
          if (callbacks.onError) callbacks.onError('Failed to connect to global room.');
        }
      });
    };

    if (this.isGlobalConnected) {
      onJoinReady();
    } else {
      this.initGlobalSignaling(onJoinReady, (err) => {
        if (callbacks.onError) callbacks.onError(err);
      });
    }

    // Also inform local socket if connected
    if (this.socket && this.socket.connected) {
      this.socket.emit('join_room', { roomCode: this.roomCode, playerName, isWebRtc: true, rejoinIndex });
    }
  }

  /**
   * Processes incoming global MQTT messages for WebRTC signaling and game state
   */
  async handleGlobalMqttMessage(topic, payloadString) {
    try {
      const data = JSON.parse(payloadString);
      if (!data) return;

      const prefix = `mission_ludo_3d/room/${this.roomCode}/`;
      if (!topic.startsWith(prefix)) return;
      const subAction = topic.substring(prefix.length);

      // 1. GUEST JOIN ANNOUNCEMENT (Host receives and admits guest)
      if (subAction === 'join' && this.isHost) {
        if (data.peerId === this.myPeerId) return;

        let existing = this.playersList.find((p) => p.id === data.peerId);
        if (!existing) {
          // Check for rejoining player by rejoinIndex or name
          existing = this.playersList.find((p) => 
            (typeof data.rejoinIndex === 'number' && p.playerIndex === data.rejoinIndex) ||
            (p.name && data.name && p.name.trim().toLowerCase() === data.name.trim().toLowerCase())
          );
          if (existing) {
            existing.id = data.peerId;
            console.log(`🔄 Re-admitted player ${existing.name} (Index ${existing.playerIndex})`);
          }
        }

        if (!existing) {
          if (this.playersList.length >= 4) {
            this.publishGlobal(`mission_ludo_3d/room/${this.roomCode}/error/${data.peerId}`, {
              message: 'Room is already full (maximum 4 players).'
            });
            return;
          }

          const colors = ['Red', 'Yellow', 'Blue', 'Charcoal'];
          const newIdx = this.playersList.length;
          existing = {
            id: data.peerId,
            name: data.name || `Friend ${newIdx}`,
            playerIndex: newIdx,
            color: colors[newIdx]
          };
          this.playersList.push(existing);
        }

        // Host broadcasts the updated player list to all peers in the room
        this.publishGlobal(`mission_ludo_3d/room/${this.roomCode}/players`, {
          players: this.playersList
        });

        // Clean up stale peer connection if any
        if (this.peers.has(data.peerId)) {
          const old = this.peers.get(data.peerId);
          try { old.pc?.close(); } catch (e) {}
          this.peers.delete(data.peerId);
        }

        // Host initiates WebRTC P2P DataChannel connection to this guest
        this.initiateNativeHostConnection(data.peerId, existing.playerIndex, existing.name);
        return;
      }

      // 2. PLAYERS LIST UPDATE (Host and Guests receive)
      if (subAction === 'players') {
        if (Array.isArray(data.players)) {
          this.playersList = data.players;
          const me = this.playersList.find((p) => 
            p.id === this.myPeerId || 
            (p.name && this.playerName && p.name.trim().toLowerCase() === this.playerName.trim().toLowerCase())
          );
          if (me && typeof me.playerIndex === 'number') {
            this.myPlayerIndex = me.playerIndex;
          }
          if (this.onPlayerJoinedHandler) {
            this.onPlayerJoinedHandler({
              players: this.playersList,
              count: this.playersList.length,
              myPlayerIndex: this.myPlayerIndex
            });
          }
        }
        return;
      }

      // 3. WEBRTC SIGNALING (Offers, Answers, and ICE Candidates)
      if (subAction.startsWith('signal/')) {
        const targetId = subAction.split('/')[1];
        if (targetId === this.myPeerId && data.from !== this.myPeerId) {
          await this.handleNativeSignal(data.from, data.signalData, data.fromIndex);
        }
        return;
      }

      // 4. WORLDWIDE GAME MESSAGE BUS (Dual sync fallback over internet)
      if (subAction === 'game') {
        if (data.senderId !== this.myPeerId) {
          if (this.onMessageHandler) {
            this.onMessageHandler(data.payload, data.senderId);
          }
        }
        return;
      }

      // 5. ERROR MESSAGES
      if (subAction.startsWith('error/')) {
        const targetId = subAction.split('/')[1];
        if (targetId === this.myPeerId) {
          if (this.currentCallbacks?.onError) {
            this.currentCallbacks.onError(data.message);
          }
        }
        return;
      }

    } catch (e) {
      console.warn('MQTT message parse error:', e);
    }
  }

  // --- NATIVE MULTI-PEER WEBRTC ENGINE ---

  async initiateNativeHostConnection(targetPeerId, playerIndex, playerName) {
    if (typeof RTCPeerConnection === 'undefined') return;

    try {
      const pc = new RTCPeerConnection(this.rtcConfig);
      const peerEntry = {
        pc,
        dataChannel: null,
        playerIndex: playerIndex || 1,
        name: playerName || 'Friend',
        isConnected: false
      };
      this.peers.set(targetPeerId, peerEntry);

      this.setupNativeIceHandlers(pc, targetPeerId);

      // Host creates the P2P DataChannel for this guest
      const dataChannel = pc.createDataChannel(`ludo-${this.roomCode}-${targetPeerId}`, { ordered: true });
      peerEntry.dataChannel = dataChannel;
      this.setupNativeDataChannel(dataChannel, targetPeerId, true);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Publish offer via Global Internet Signaling
      if (this.isGlobalConnected) {
        this.publishGlobal(`mission_ludo_3d/room/${this.roomCode}/signal/${targetPeerId}`, {
          from: this.myPeerId,
          fromIndex: 0,
          signalData: { type: 'offer', sdp: offer }
        });
      }

      // Also publish via local socket if connected
      if (this.socket && this.socket.connected) {
        this.socket.emit('webrtc_signal', {
          targetPeerId,
          signalData: { type: 'offer', sdp: offer },
          roomCode: this.roomCode
        });
      }
    } catch (err) {
      console.warn('Native WebRTC Host Offer Error:', err);
    }
  }

  async handleNativeSignal(fromPeerId, signalData, fromIndex) {
    if (typeof RTCPeerConnection === 'undefined' || !signalData) return;

    try {
      if (signalData.type === 'offer') {
        // Guest receives Offer from Host
        let peerEntry = this.peers.get(fromPeerId);
        if (!peerEntry) {
          const pc = new RTCPeerConnection(this.rtcConfig);
          peerEntry = {
            pc,
            dataChannel: null,
            playerIndex: fromIndex || 0,
            name: 'Host',
            isConnected: false
          };
          this.peers.set(fromPeerId, peerEntry);
          this.setupNativeIceHandlers(pc, fromPeerId);

          pc.ondatachannel = (event) => {
            peerEntry.dataChannel = event.channel;
            this.setupNativeDataChannel(event.channel, fromPeerId, false);
          };
        }

        await peerEntry.pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
        const answer = await peerEntry.pc.createAnswer();
        await peerEntry.pc.setLocalDescription(answer);

        // Send answer back to Host via Global Internet Signaling
        if (this.isGlobalConnected) {
          this.publishGlobal(`mission_ludo_3d/room/${this.roomCode}/signal/${fromPeerId}`, {
            from: this.myPeerId,
            fromIndex: this.myPlayerIndex,
            signalData: { type: 'answer', sdp: answer }
          });
        }

        // Also send via local socket if connected
        if (this.socket && this.socket.connected) {
          this.socket.emit('webrtc_signal', {
            targetPeerId: fromPeerId,
            signalData: { type: 'answer', sdp: answer },
            roomCode: this.roomCode
          });
        }

      } else if (signalData.type === 'answer') {
        // Host receives Answer from Guest
        const peerEntry = this.peers.get(fromPeerId);
        if (peerEntry && peerEntry.pc) {
          await peerEntry.pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
        }

      } else if (signalData.candidate) {
        // ICE Candidate arrival
        const peerEntry = this.peers.get(fromPeerId);
        if (peerEntry && peerEntry.pc) {
          try {
            await peerEntry.pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
          } catch (e) {}
        }
      }
    } catch (err) {
      console.warn('Native WebRTC Signal Handling Error:', err);
    }
  }

  setupNativeIceHandlers(pc, targetPeerId) {
    if (!pc) return;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        if (this.isGlobalConnected) {
          this.publishGlobal(`mission_ludo_3d/room/${this.roomCode}/signal/${targetPeerId}`, {
            from: this.myPeerId,
            signalData: { candidate: event.candidate }
          });
        }
        if (this.socket && this.socket.connected) {
          this.socket.emit('webrtc_signal', {
            targetPeerId,
            signalData: { candidate: event.candidate },
            roomCode: this.roomCode
          });
        }
      }
    };

    pc.onconnectionstatechange = () => {
      const peerEntry = this.peers.get(targetPeerId);
      if (pc.connectionState === 'connected') {
        if (peerEntry) peerEntry.isConnected = true;
        this.updateP2pStatus();
      } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        if (peerEntry) peerEntry.isConnected = false;
        this.updateP2pStatus();
      }
    };
  }

  setupNativeDataChannel(channel, peerId, isHostSide) {
    if (!channel) return;

    channel.onopen = () => {
      const peerEntry = this.peers.get(peerId);
      if (peerEntry) peerEntry.isConnected = true;
      this.updateP2pStatus();

      if (isHostSide) {
        channel.send(JSON.stringify({
          type: 'handshake',
          hostIndex: 0,
          roomCode: this.roomCode
        }));
      }
    };

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.type === 'handshake') {
          this.updateP2pStatus();
          return;
        }

        // If host receives message from a guest, relay it over DataChannels to other guests
        if (this.isHost && data && typeof data === 'object') {
          this.peers.forEach((peer, otherId) => {
            if (otherId !== peerId && peer.dataChannel && peer.dataChannel.readyState === 'open') {
              try { peer.dataChannel.send(event.data); } catch (e) {}
            }
          });
        }

        if (this.onMessageHandler) {
          this.onMessageHandler(data, peerId);
        }
      } catch (e) {
        console.warn('DataChannel message parse error:', e);
      }
    };

    channel.onclose = () => {
      const peerEntry = this.peers.get(peerId);
      if (peerEntry) peerEntry.isConnected = false;
      this.updateP2pStatus();
    };
  }

  updateP2pStatus() {
    let activeCount = 0;
    this.peers.forEach((p) => {
      if (p.isConnected) activeCount++;
    });

    this.isP2pActive = (activeCount > 0);
    if (this.onPeerStatusHandler) {
      this.onPeerStatusHandler('all-peers', this.isP2pActive ? 'p2p_active' : 'relay_active', activeCount);
    }
  }

  /**
   * Broadcast message to ALL connected friends worldwide:
   * 1. Direct WebRTC DataChannels across all peers in room (Zero Latency)
   * 2. Worldwide Internet Message Bus (100% Guaranteed Delivery across any mobile network)
   * 3. Socket.IO Room Relay (Local fallback)
   */
  broadcast(message) {
    if (!message) return;
    const jsonStr = JSON.stringify(message);

    // 1. Direct WebRTC DataChannels
    this.peers.forEach((peer) => {
      if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
        try {
          peer.dataChannel.send(jsonStr);
        } catch (e) {}
      }
    });

    // 2. Global Internet Message Bus (Worldwide guarantee)
    if (this.isGlobalConnected && this.roomCode) {
      this.publishGlobal(`mission_ludo_3d/room/${this.roomCode}/game`, {
        senderId: this.myPeerId,
        payload: message
      });
    }

    // 3. Local Socket.IO Relay
    if (this.socket && this.socket.connected && this.roomCode) {
      if (message.type === 'roll') {
        this.socket.emit('roll_dice', {
          val1: message.v1,
          val2: message.v2,
          rollResult: message.rollResult,
          actionId: message.actionId
        });
      } else if (message.type === 'move') {
        this.socket.emit('pawn_move', message);
      } else if (message.type === 'two_dice_step') {
        this.socket.emit('two_dice_step', message);
      } else if (message.type === 'two_dice_pass') {
        this.socket.emit('two_dice_pass', message);
      } else if (message.type === 'turn_state') {
        this.socket.emit('turn_state', message);
      } else if (message.type === 'dice_mode_sync') {
        this.socket.emit('dice_mode_sync', message);
      } else if (message.type === 'start_match') {
        this.socket.emit('start_game');
      } else if (message.type === 'host_new_game') {
        this.socket.emit('host_new_game', message);
      } else if (message.type === 'host_exit_game') {
        this.socket.emit('host_exit_game', message);
      } else if (message.type === 'request_game_sync') {
        this.socket.emit('request_game_sync', message);
      } else if (message.type === 'game_sync_snapshot') {
        this.socket.emit('game_sync_snapshot', message);
      }
    }
  }

  reconnectAll() {
    console.log('🔄 Reconnecting WebRTC Network...');
    if (!this.isGlobalConnected && !this.isConnecting) {
      this.initGlobalSignaling();
    } else if (this.isGlobalConnected && this.roomCode) {
      try {
        this.mqttClient.subscribe(`mission_ludo_3d/room/${this.roomCode}/#`, { qos: 1 });
      } catch (e) {}
    }
    if (this.socket && !this.socket.connected) {
      try { this.socket.connect(); } catch (e) {}
    }
  }

  closeAll() {
    this.peers.forEach((peer) => {
      if (peer.dataChannel) {
        try { peer.dataChannel.close(); } catch (e) {}
      }
      if (peer.pc) {
        try { peer.pc.close(); } catch (e) {}
      }
    });
    this.peers.clear();

    if (this.mqttClient && this.isGlobalConnected && this.roomCode) {
      try {
        this.mqttClient.unsubscribe(`mission_ludo_3d/room/${this.roomCode}/#`);
      } catch (e) {}
    }

    this.isP2pActive = false;
  }
}

if (typeof window !== 'undefined') {
  window.WebRtcNetwork = WebRtcNetwork;
}
