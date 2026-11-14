// How often a player that has not changed still says where it is.
const PLAYER_MOVE_REPEAT_MS = 2000;

// What a binary frame of the server is, by the four bytes it starts with: 'MCA1' the kept animals around
// the player (js/game/animals.js, pkg/network/animals.go); anything else is a chunk ('MCK1',
// js/chunkDecoder.js).
function binaryFrameKind(buffer) {
    if (buffer.byteLength >= 4) {
        const magic = new Uint8Array(buffer, 0, 4);
        if (magic[0] === 77 && magic[1] === 67 && magic[2] === 65 && magic[3] === 49) return 'animalData';
    }
    return 'chunkData';
}

class NetworkClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.reconnectInterval = 3000;
        this.playerId = this.generatePlayerId();
        this.username = null;
        this.shirtColor = '#2f63c8';
        this.hairStyle = 'short';
        this.hairColor = '#5b3a29';
        this.messageHandlers = new Map();
        this.otherPlayers = new Map();
    }
    
    generatePlayerId() {
        return 'player_' + Math.random().toString(36).substr(2, 9);
    }
    
    connect(url) {
        console.log('WebSocket: Connecting to', url);
        this.ws = new WebSocket(url);
        // Chunks and the animals around arrive as binary frames.
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            console.log('WebSocket: Connected to server');
            this.connected = true;
            // A new connection knows nothing of where this player is, nor this one of the others.
            this.lastMoveSaid = null;
            for (const id of [...this.otherPlayers.keys()]) {
                this.otherPlayers.delete(id);
                this.emit('otherPlayerGone', id);
            }
            this.emit('connected');
            this.send('playerJoin', { playerId: this.playerId, username: this.username, shirtColor: this.shirtColor, hairStyle: this.hairStyle, hairColor: this.hairColor });
            this.updateStatus('Connected');
        };
        
        this.ws.onclose = (e) => {
            console.log('WebSocket: Disconnected', e.code, e.reason);
            this.connected = false;
            this.updateStatus('Disconnected - Reconnecting...');
            setTimeout(() => this.connect(url), this.reconnectInterval);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateStatus('Connection error');
        };
        
        this.ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                this.emit(binaryFrameKind(event.data), event.data);
                return;
            }
            this.handleMessage(JSON.parse(event.data));
        };
    }
    
    send(type, payload) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        const message = {
            type: type,
            payload: payload
        };
        
        this.ws.send(JSON.stringify(message));
    }

    // Asks the server for chunks; it answers nearest to the last focus first.
    requestChunks(chunks) {
        this.send('chunkRequest', { chunks });
    }

    sendChunkFocus(chunkX, chunkZ, radius) {
        this.send('chunkFocus', { chunkX, chunkZ, radius });
    }

    emit(type, payload) {
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
            handlers.forEach((handler) => handler(payload));
        }
    }
    
    handleMessage(message) {
        switch(message.type) {
            case 'init':
                this.handleInit(message.payload || message);
                break;
            case 'playerList':
                this.handlePlayerList(message.payload || message);
                break;
            case 'playerMove':
                this.handlePlayerMove(message.payload);
                break;
            case 'playerMoves':
                this.handlePlayerMoves(message.payload);
                break;
            case 'blockBreak':
                this.handleBlockBreak(message.payload);
                break;
            case 'blockPlace':
                this.handleBlockPlace(message.payload);
                break;
            case 'chat':
                this.emit('chat', message.payload);
                break;
            case 'system':
                this.emit('system', message.payload);
                break;
            case 'timeSync':
                this.emit('timeSync', message.payload || message);
                break;
            case 'voiceState':
                this.emit('voiceState', message.payload);
                break;
            case 'signVoteUpdate':
                this.emit('signVoteUpdate', message.payload);
                break;
            case 'sprayPaint':
                this.emit('sprayPaint', message.payload);
                break;
            case 'sprayPaintRemove':
                this.emit('sprayPaintRemove', message.payload);
                break;
            case 'webrtcOffer':
                this.emit('webrtcOffer', message.payload);
                break;
            case 'webrtcAnswer':
                this.emit('webrtcAnswer', message.payload);
                break;
            case 'webrtcIceCandidate':
                this.emit('webrtcIceCandidate', message.payload);
                break;
            case 'playerIdentity':
                // The stable player the server knows this browser as (js/game/identity.js); this.playerId
                // above is only this page load's.
                this.stablePlayerId = message.payload && typeof message.payload.playerId === 'string' ? message.payload.playerId : '';
                this.emit('playerIdentity', message.payload);
                break;
            case 'playerJoined':
                console.log('Player joined:', message.payload);
                break;
            default:
                this.emit(message.type, message.payload);
                break;
        }
    }
    
    handleInit(payload) {
        if (!payload) return;

        if (payload.players) {
            for (const [id, player] of Object.entries(payload.players)) {
                if (id !== this.playerId) {
                    this.otherPlayers.set(id, player);
                    this.emit('otherPlayerMove', player);
                }
            }
        }
        
        if (payload.blocks || payload.sprayPaints) {
            // Terrain streams per chunk; init only carries block metadata and spray paints.
            this.emit('worldInit', { blocks: payload.blocks || {}, sprayPaints: payload.sprayPaints || {} });
        }

        if (typeof payload.timeOfDay === 'number') {
            this.emit('timeSync', { timeOfDay: payload.timeOfDay, worldDay: payload.worldDay });
        }
    }
    
    handlePlayerList(payload) {
        if (!payload || !Array.isArray(payload.players)) return;

        const listEl = document.getElementById('player-list');
        if (listEl) {
            listEl.innerHTML = '';
            payload.players.forEach(p => {
                const li = document.createElement('li');
                li.dataset.playerId = p.id;
                li.textContent = `${p.voiceEnabled ? '🎙️' : '🔇'} ${p.name}`;
                if (p.id === this.playerId) {
                    li.classList.add('self');
                }
                listEl.appendChild(li);
            });
        }

        this.emit('playerList', payload);
    }
    
    handlePlayerMove(payload) {
        if (payload.id === this.playerId) return;
        
        this.otherPlayers.set(payload.id, payload);

        this.emit('otherPlayerMove', payload);
    }
    
    // What changed around this player since the server last said (pkg/network/player_moves.go): the
    // players near it, and in `gone` those that are no longer in range. A player's name and looks come
    // the first time and when they change; in between, the ones already known stand.
    handlePlayerMoves(payload) {
        if (!payload) return;
        for (const entry of payload.players || []) {
            if (!entry || entry.id === this.playerId) continue;
            const known = this.otherPlayers.get(entry.id);
            const player = known ? {
                username: known.username,
                shirtColor: known.shirtColor,
                hairStyle: known.hairStyle,
                hairColor: known.hairColor,
                ...entry
            } : entry;
            this.otherPlayers.set(entry.id, player);
            this.emit('otherPlayerMove', player);
        }
        for (const id of payload.gone || []) {
            if (this.otherPlayers.delete(id)) this.emit('otherPlayerGone', id);
        }
    }

    handleBlockBreak(payload) {
        this.emit('blockBreak', payload);
    }
    
    handleBlockPlace(payload) {
        this.emit('blockPlace', payload);
    }
    
    // Several mechanics can listen to one message (chests and microscopes both read storageContents);
    // a later listener never replaces an earlier one.
    on(type, handler) {
        const handlers = this.messageHandlers.get(type);
        if (handlers) handlers.push(handler);
        else this.messageHandlers.set(type, [handler]);
    }

    setUsername(username) {
        this.username = username;
    }

    setShirtColor(color) {
        this.shirtColor = color;
    }

    setHair(style, color) {
        this.hairStyle = style || 'short';
        this.hairColor = color || '#5b3a29';
    }

    setVoiceEnabled(enabled) {
        this.send('voiceState', { enabled: enabled });
    }

    requestSleep() {
        this.send('sleepInBed', {});
    }

    sendWebRTCOffer(toPlayerId, sdp) {
        this.send('webrtcOffer', { toPlayerId: toPlayerId, sdp: sdp });
    }

    sendWebRTCAnswer(toPlayerId, sdp) {
        this.send('webrtcAnswer', { toPlayerId: toPlayerId, sdp: sdp });
    }

    sendWebRTCIceCandidate(toPlayerId, candidate) {
        this.send('webrtcIceCandidate', { toPlayerId: toPlayerId, candidate: candidate });
    }
    
    updateStatus(text) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = text;
        }
    }
    
    // mount: { key: "species:variant", yaw } while riding, otherwise null.
    updatePosition(position, heldItem = null, action = '', mount = null, offhandItem = null) {
        const payload = {
            id: this.playerId,
            username: this.username,
            x: position.x,
            y: position.y,
            z: position.z,
            yaw: position.yaw,
            pitch: position.pitch,
            shirtColor: this.shirtColor,
            hairStyle: this.hairStyle,
            hairColor: this.hairColor,
            heldItem: heldItem || '',
            offhandItem: offhandItem || '',
            action: action || '',
            mount: mount ? mount.key : '',
            mountYaw: mount ? mount.yaw : 0
        };
        // A player standing still says so only now and then: enough for the server to know it is there.
        const said = JSON.stringify(payload);
        const now = Date.now();
        if (said === this.lastMoveSaid && now - this.lastMoveSaidAt < PLAYER_MOVE_REPEAT_MS) return;
        this.lastMoveSaid = said;
        this.lastMoveSaidAt = now;
        this.send('playerMove', payload);
    }
}
