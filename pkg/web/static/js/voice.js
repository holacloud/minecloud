class VoiceChatManager {
    constructor(game, network) {
        this.game = game;
        this.network = network;
        this.enabled = false;
        this.localStream = null;
        this.peers = new Map();
        this.voiceStates = new Map();
        this.maxDistance = 18;
        this.button = null;
    }

    init() {
        this.button = document.getElementById('voice-toggle');
        if (this.button) {
            this.button.addEventListener('click', async () => {
                if (this.enabled) {
                    this.disable();
                } else {
                    await this.enable();
                }
            });
            this.renderButton();
        }
    }

    renderButton() {
        if (!this.button) return;
        this.button.textContent = this.enabled ? 'Voice On' : 'Voice Off';
        this.button.classList.toggle('active', this.enabled);
    }

    async enable() {
        try {
            this.game.ensureAudio();
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            this.enabled = true;
            this.network.setVoiceEnabled(true);
            this.renderButton();
            this.syncPeers();
        } catch (error) {
            console.error('Voice chat unavailable', error);
            this.enabled = false;
            this.renderButton();
        }
    }

    disable() {
        this.enabled = false;
        this.network.setVoiceEnabled(false);
        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => track.stop());
            this.localStream = null;
        }

        for (const peerId of this.peers.keys()) {
            this.removePeer(peerId);
        }
        this.renderButton();
    }

    updateVoiceState(playerId, enabled) {
        this.voiceStates.set(playerId, enabled);
        this.syncPeers();
    }

    syncPlayerList(players) {
        const activeIds = new Set();
        players.forEach((player) => {
            if (player.id === this.network.playerId) return;
            activeIds.add(player.id);
            this.voiceStates.set(player.id, !!player.voiceEnabled);
        });

        for (const peerId of this.peers.keys()) {
            if (!activeIds.has(peerId)) {
                this.removePeer(peerId);
            }
        }

        this.syncPeers();
    }

    syncPeers() {
        if (!this.enabled || !this.localStream) return;

        for (const [playerId, enabled] of this.voiceStates) {
            if (!enabled || playerId === this.network.playerId) {
                this.removePeer(playerId);
                continue;
            }

            const peer = this.ensurePeer(playerId);
            if (this.network.playerId < playerId && !peer.connected && !peer.makingOffer) {
                this.createOffer(playerId);
            }
        }
    }

    ensurePeer(playerId) {
        let peer = this.peers.get(playerId);
        if (peer) return peer;

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        const peerEntry = {
            pc: pc,
            connected: false,
            makingOffer: false,
            source: null,
            gain: null,
            panner: null,
            remoteStream: null
        };

        if (this.localStream) {
            this.localStream.getTracks().forEach((track) => pc.addTrack(track, this.localStream));
        }

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.network.sendWebRTCIceCandidate(playerId, event.candidate);
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
                peerEntry.connected = false;
            } else if (pc.connectionState === 'connected') {
                peerEntry.connected = true;
            }
        };

        pc.ontrack = (event) => {
            const audio = this.game.ensureAudio();
            if (!audio || !event.streams[0]) return;

            peerEntry.remoteStream = event.streams[0];
            peerEntry.source = audio.createMediaStreamSource(event.streams[0]);
            peerEntry.gain = audio.createGain();
            peerEntry.gain.gain.value = 0;

            if (typeof audio.createStereoPanner === 'function') {
                peerEntry.panner = audio.createStereoPanner();
                peerEntry.source.connect(peerEntry.gain).connect(peerEntry.panner).connect(audio.destination);
            } else {
                peerEntry.source.connect(peerEntry.gain).connect(audio.destination);
            }
        };

        this.peers.set(playerId, peerEntry);
        return peerEntry;
    }

    async createOffer(playerId) {
        const peer = this.ensurePeer(playerId);
        peer.makingOffer = true;
        try {
            const offer = await peer.pc.createOffer();
            await peer.pc.setLocalDescription(offer);
            this.network.sendWebRTCOffer(playerId, offer);
        } catch (error) {
            console.error('Failed to create voice offer', error);
        } finally {
            peer.makingOffer = false;
        }
    }

    async handleOffer(payload) {
        if (!this.enabled || !this.localStream) return;

        const playerId = payload.fromPlayerId;
        const peer = this.ensurePeer(playerId);
        try {
            await peer.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            const answer = await peer.pc.createAnswer();
            await peer.pc.setLocalDescription(answer);
            this.network.sendWebRTCAnswer(playerId, answer);
        } catch (error) {
            console.error('Failed to handle voice offer', error);
        }
    }

    async handleAnswer(payload) {
        const peer = this.peers.get(payload.fromPlayerId);
        if (!peer) return;
        try {
            await peer.pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        } catch (error) {
            console.error('Failed to handle voice answer', error);
        }
    }

    async handleIceCandidate(payload) {
        const peer = this.peers.get(payload.fromPlayerId);
        if (!peer || !payload.candidate) return;
        try {
            await peer.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (error) {
            console.error('Failed to apply voice ICE candidate', error);
        }
    }

    updateProximity() {
        if (!this.enabled) return;

        const local = this.game.cameraController.getPosition();
        for (const [playerId, peer] of this.peers) {
            if (!peer.gain) continue;

            const avatar = this.game.otherPlayerMeshes.get(playerId);
            if (!avatar) {
                peer.gain.gain.value = 0;
                continue;
            }

            const dx = avatar.position.x - local.x;
            const dz = avatar.position.z - local.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            const factor = distance >= this.maxDistance ? 0 : Math.pow(1 - distance / this.maxDistance, 1.8);
            peer.gain.gain.value = factor * this.game.masterVolume;

            if (peer.panner) {
                peer.panner.pan.value = THREE.MathUtils.clamp(dx / this.maxDistance, -1, 1);
            }
        }
    }

    removePeer(playerId) {
        const peer = this.peers.get(playerId);
        if (!peer) return;

        if (peer.source) {
            try { peer.source.disconnect(); } catch (_error) {}
        }
        if (peer.gain) {
            try { peer.gain.disconnect(); } catch (_error) {}
        }
        if (peer.panner) {
            try { peer.panner.disconnect(); } catch (_error) {}
        }
        peer.pc.close();
        this.peers.delete(playerId);
    }
}
