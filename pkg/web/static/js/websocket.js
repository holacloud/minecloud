class NetworkClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.reconnectInterval = 3000;
        this.playerId = this.generatePlayerId();
        this.messageHandlers = new Map();
        this.otherPlayers = new Map();
    }
    
    generatePlayerId() {
        return 'player_' + Math.random().toString(36).substr(2, 9);
    }
    
    connect(url) {
        console.log('WebSocket: Connecting to', url);
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
            console.log('WebSocket: Connected to server');
            this.connected = true;
            this.send('playerJoin', { playerId: this.playerId });
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

    emit(type, payload) {
        const handler = this.messageHandlers.get(type);
        if (handler) {
            handler(payload);
        }
    }
    
    handleMessage(message) {
        switch(message.type) {
            case 'init':
                this.handleInit(message.payload);
                break;
            case 'playerList':
                this.handlePlayerList(message.payload);
                break;
            case 'playerMove':
                this.handlePlayerMove(message.payload);
                break;
            case 'blockBreak':
                this.handleBlockBreak(message.payload);
                break;
            case 'blockPlace':
                this.handleBlockPlace(message.payload);
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
        if (payload.players) {
            for (const [id, player] of Object.entries(payload.players)) {
                if (id !== this.playerId) {
                    this.otherPlayers.set(id, player);
                }
            }
        }
        
        if (payload.blocks) {
            this.emit('worldInit', payload.blocks);
        }
    }
    
    handlePlayerList(payload) {
        const listEl = document.getElementById('player-list');
        if (listEl) {
            listEl.innerHTML = '';
            payload.players.forEach(p => {
                const li = document.createElement('li');
                li.textContent = p.name;
                if (p.id === this.playerId) {
                    li.classList.add('self');
                }
                listEl.appendChild(li);
            });
        }
    }
    
    handlePlayerMove(payload) {
        if (payload.id === this.playerId) return;
        
        this.otherPlayers.set(payload.id, payload);

        this.emit('otherPlayerMove', payload);
    }
    
    handleBlockBreak(payload) {
        this.emit('blockBreak', payload);
    }
    
    handleBlockPlace(payload) {
        this.emit('blockPlace', payload);
    }
    
    on(type, handler) {
        this.messageHandlers.set(type, handler);
    }
    
    updateStatus(text) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = text;
        }
    }
    
    updatePosition(position) {
        this.send('playerMove', {
            id: this.playerId,
            x: position.x,
            y: position.y,
            z: position.z,
            yaw: position.yaw,
            pitch: position.pitch
        });
    }
}
