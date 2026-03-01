class NetworkClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.reconnectInterval = 3000;
        this.playerId = this.generatePlayerId();
        this.messageHandlers = new Map();
    }
    
    generatePlayerId() {
        return 'player_' + Math.random().toString(36).substr(2, 9);
    }
    
    connect(url) {
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
            console.log('Connected to server');
            this.connected = true;
            this.send('playerJoin', { playerId: this.playerId });
            this.updateStatus('Connected');
        };
        
        this.ws.onclose = () => {
            console.log('Disconnected from server');
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
        if (!this.connected) return;
        
        const message = {
            type: type,
            payload: payload
        };
        
        this.ws.send(JSON.stringify(message));
    }
    
    handleMessage(message) {
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
            handler(message.payload);
        }
        
        switch(message.type) {
            case 'pong':
                break;
            case 'playerJoined':
                console.log('Player joined:', message.payload);
                break;
            case 'playerLeft':
                console.log('Player left:', message.payload);
                break;
            case 'worldUpdate':
                break;
        }
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
            playerId: this.playerId,
            x: position.x,
            y: position.y,
            z: position.z,
            yaw: position.yaw,
            pitch: position.pitch
        });
    }
}
