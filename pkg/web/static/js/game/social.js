// Chat, commands, signs, sound blocks, spray paint, pings, reactions and emotes.
// Mixed into Game.prototype; `this` is the Game instance.

Object.assign(Game.prototype, {
    refreshChatVisibility() {
        const chatContainer = document.getElementById('chat-container');
        const chatLog = document.getElementById('chat-log');
        if (!chatLog) return;

        if (chatContainer) chatContainer.classList.toggle('active', this.chatOpen);
        chatLog.style.opacity = this.chatOpen ? '1' : (this.chatMessages.length > 0 ? '0.86' : '0');
    },

    renderChatMessages() {
        const chatLog = document.getElementById('chat-log');
        if (!chatLog) return;

        chatLog.innerHTML = '';
        this.chatMessages.forEach((message) => {
            const row = document.createElement('div');
            row.className = 'chat-message' + (message.system ? ' system' : '') + (message.mentioned ? ' mentioned' : '');

            if (message.system) {
                row.textContent = message.text;
                chatLog.appendChild(row);
                return;
            }

            const name = document.createElement('span');
            name.className = 'chat-name';
            name.textContent = `${message.username}: `;

            const text = document.createElement('span');
            text.textContent = message.text;

            row.appendChild(name);
            row.appendChild(text);
            chatLog.appendChild(row);
        });

        this.refreshChatVisibility();
        chatLog.scrollTop = chatLog.scrollHeight;
    },

    isMentionForLocalPlayer(text, username) {
        if (!text || !this.playerName || username === this.playerName) return false;
        const variants = new Set([
            this.playerName,
            this.playerName.replace(/\s+/g, ''),
            this.playerName.replace(/\s+/g, '_')
        ].map((value) => value.trim().toLowerCase()).filter(Boolean));
        const normalized = String(text).toLowerCase();
        return Array.from(variants).some((name) => normalized.includes(`@${name}`));
    },

    playChatMentionAnimation() {
        const comet = document.createElement('div');
        comet.className = 'chat-mention-comet';
        document.body.appendChild(comet);
        comet.addEventListener('animationend', () => comet.remove(), { once: true });
    },

    receiveChatMessage(payload) {
        const username = payload.username || payload.playerId || 'Player';
        const text = payload.text || '';
        const mentioned = this.isMentionForLocalPlayer(text, username);
        this.chatMessages.push({
            username,
            text,
            mentioned
        });
        while (this.chatMessages.length > 10) {
            this.chatMessages.shift();
        }

        this.renderChatMessages();
        if (mentioned) {
            this.playChatMentionAnimation();
        }

        if (!this.chatOpen) {
            if (this.chatHideTimeout) {
                clearTimeout(this.chatHideTimeout);
            }
            this.chatHideTimeout = setTimeout(() => this.refreshChatVisibility(), 5000);
        }
    },

    receiveSystemMessage(payload) {
        this.chatMessages.push({
            text: payload.text || '',
            system: true
        });
        while (this.chatMessages.length > 10) {
            this.chatMessages.shift();
        }

        this.renderChatMessages();

        if (!this.chatOpen) {
            if (this.chatHideTimeout) {
                clearTimeout(this.chatHideTimeout);
            }
            this.chatHideTimeout = setTimeout(() => this.refreshChatVisibility(), 5000);
        }
    },

    updateSignVoteButtons(votes) {
        const labels = {
            thumbup: '👍',
            thumbdown: '👎',
            heart: '❤️',
            happy: '😊',
            star: '⭐'
        };
        document.querySelectorAll('#sign-votes .sign-vote-button').forEach((button) => {
            const emoji = button.dataset.emoji;
            button.textContent = `${labels[emoji]} ${votes[emoji] || 0}`;
        });
    },

    voteOnActiveSign(emoji) {
        if (!this.activeSignPosition) return;
        const votes = { ...this.world.getSignVotesAt(this.activeSignPosition.x, this.activeSignPosition.y, this.activeSignPosition.z) };
        votes[emoji] = (votes[emoji] || 0) + 1;
        this.updateSignVoteButtons(votes);
        if (this.network && this.network.connected) {
            this.network.send('signVote', { x: this.activeSignPosition.x, y: this.activeSignPosition.y, z: this.activeSignPosition.z, emoji });
        }
    },

    openSignReader(text, position) {
        const panel = document.getElementById('sign-reader');
        const content = document.getElementById('sign-reader-content');
        if (!panel || !content) return;

        this.signReaderOpen = true;
        this.activeSignPosition = position;
        this.stopMining();
        content.textContent = text;
        panel.classList.add('visible');
        this.updateSignVoteButtons(this.world.getSignVotesAt(position.x, position.y, position.z));
        document.querySelectorAll('#sign-votes .sign-vote-button').forEach((button) => {
            button.onclick = () => this.voteOnActiveSign(button.dataset.emoji);
        });
        if (document.pointerLockElement === this.renderer.domElement) {
            document.exitPointerLock();
        }
    },

    closeSignReader() {
        const panel = document.getElementById('sign-reader');
        if (!panel) return;

        this.signReaderOpen = false;
        this.activeSignPosition = null;
        panel.classList.remove('visible');
        this.recapturePointerLock();
    },

    tryReadSign() {
        const hit = this.raycastBlock(this.breakDistance);
        if (!hit) return false;

        const worldPos = this.world.getBlockPositionFromIntersection(hit);
        if (!worldPos) return false;
        if (this.world.getBlockTypeAt(worldPos.x, worldPos.y, worldPos.z) !== 'sign') return false;

        const text = this.world.getSignTextAt(worldPos.x, worldPos.y, worldPos.z);
        if (!text) return false;

        this.openSignReader(text, worldPos);
        return true;
    },

    openChatInput(prefill = '') {
        const input = document.getElementById('chat-input');
        if (!input) return;

        this.chatOpen = true;
        input.classList.add('visible');
        input.value = prefill;
        this.stopMining();
        if (document.pointerLockElement === this.renderer.domElement) {
            document.exitPointerLock();
        }
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        this.refreshChatVisibility();
    },

    closeChatInput() {
        const input = document.getElementById('chat-input');
        if (!input) return;

        this.chatOpen = false;
        input.classList.remove('visible');
        input.blur();
        this.refreshChatVisibility();
        this.recapturePointerLock();
    },

    submitChatMessage() {
        const input = document.getElementById('chat-input');
        if (!input) return;

        const text = input.value.trim();
        if (text.startsWith('/')) {
            this.runChatCommand(text);
        } else if (text) {
            this.network.send('chat', { text: text });
        }

        this.closeChatInput();
    },

    runChatCommand(commandLine) {
        const [command, ...args] = commandLine.slice(1).split(/\s+/);
        const normalized = command.toLowerCase();

        switch (normalized) {
            case 'help':
                this.receiveSystemMessage({ text: 'Commands: /help, /guide [page], /spawn, /mob <animal>, /sayhere, /ping, /react, /laugh, /cheer, /boo, /rtx, /time' });
                break;
            case 'spawn':
                this.cameraController.setPosition(this.respawnPoint || this.lastSafePosition || { x: 0, y: 20, z: 0, yaw: 0, pitch: 0 });
                this.receiveSystemMessage({ text: 'Teleported to your current spawn point' });
                break;
            case 'mob':
                this.spawnMobFromCommand(args);
                break;
            case 'guide':
                this.guideShow(args[0] || null);
                break;
            // Testing aids, not listed in /help (see creative.js).
            case 'creative':
                this.creativeToggle();
                break;
            case 'give':
                this.creativeGive(args);
                break;
            case 'rtx':
                this.toggleRTXMode();
                this.receiveSystemMessage({ text: `RTX mode ${this.rtxModeEnabled ? 'enabled' : 'disabled'}` });
                break;
            case 'time': {
                const dayHour = ((this.timeOfDay * 24) + 6) % 24;
                const hours = Math.floor(dayHour).toString().padStart(2, '0');
                const minutes = Math.floor((dayHour % 1) * 60).toString().padStart(2, '0');
                this.receiveSystemMessage({ text: `Current world time: ${hours}:${minutes}` });
                break;
            }
            case 'sayhere':
                this.sendWorldNote(args.join(' '));
                break;
            case 'ping':
                this.sendWorldPing();
                break;
            case 'react':
                this.sendPlayerReaction(args[0] || 'heart');
                break;
            case 'laugh':
            case 'cheer':
            case 'boo':
                this.sendProximityEmote(normalized);
                break;
            default:
                this.receiveSystemMessage({ text: `Unknown command: /${normalized}` });
                break;
        }
    },

    tryUseSoundBlock(tune) {
        const hit = this.raycastBlock(5);
        if (!hit) return false;

        const worldPos = this.world.getBlockPositionFromIntersection(hit);
        if (!worldPos || this.world.getBlockTypeAt(worldPos.x, worldPos.y, worldPos.z) !== 'sound_block') return false;

        const current = this.world.getSoundBlockStateAt(worldPos.x, worldPos.y, worldPos.z);
        const payload = {
            x: worldPos.x,
            y: worldPos.y,
            z: worldPos.z,
            blockType: 'sound_block',
            instrument: current.instrument,
            note: current.note
        };

        if (tune) {
            const instrumentIndex = this.soundBlockInstruments.indexOf(current.instrument);
            payload.instrument = this.soundBlockInstruments[(Math.max(0, instrumentIndex) + 1) % this.soundBlockInstruments.length];
            payload.note = (current.note + 1) % this.soundBlockNotes.length;
            this.world.addBlock(payload);
            if (this.network.connected) {
                this.network.send('blockPlace', payload);
            }
            this.receiveSystemMessage({ text: `Sound block set to ${payload.instrument} note ${payload.note + 1}` });
        } else {
            if (this.network.connected) {
                this.network.send('soundBlockPlay', payload);
            } else {
                this.playSoundBlockAt(payload);
            }
        }

        return true;
    },

    tryCycleSprayColor() {
        if (this.getSelectedBlockType() !== 'spray_paint') return false;
        this.sprayColorIndex = (this.sprayColorIndex + 1) % this.sprayColors.length;
        this.receiveSystemMessage({ text: `Spray color: ${this.sprayColors[this.sprayColorIndex]}` });
        return true;
    },

    getSprayFaceFromNormal(normal) {
        const axis = Math.max(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));
        if (axis === Math.abs(normal.x)) return normal.x > 0 ? 'px' : 'nx';
        if (axis === Math.abs(normal.y)) return normal.y > 0 ? 'py' : 'ny';
        return normal.z > 0 ? 'pz' : 'nz';
    },

    trySprayPaint(hit) {
        if (!hit || !hit.face) return false;
        if (this.getInventoryCount('spray_paint') <= 0 && performance.now() > this.sprayActiveUntil) return false;

        const worldPos = this.world.getBlockPositionFromIntersection(hit);
        if (!worldPos) return false;

        const now = performance.now();
        if (now > this.sprayActiveUntil) {
            this.inventoryCounts.spray_paint = Math.max(0, this.getInventoryCount('spray_paint') - 1);
            this.sprayActiveUntil = now + 30000;
            this.saveInventoryState();
            this.updateHotbarCounts();
            this.renderInventoryPanel();
        }

        const payload = {
            x: worldPos.x,
            y: worldPos.y,
            z: worldPos.z,
            face: this.getSprayFaceFromNormal(hit.face.normal),
            color: this.sprayColors[this.sprayColorIndex]
        };

        if (this.network.connected) {
            this.network.send('sprayPaint', payload);
        } else {
            this.world.addSprayPaint({ ...payload, expiresAtDay: this.worldDay + 1, expiresAtTime: this.timeOfDay });
        }

        this.playNoiseBurst({ duration: 0.06, volume: 0.018, highpass: 900, lowpass: 2800 });
        this.showHitIndicator();
        return true;
    },

    sendWorldNote(text) {
        const trimmed = text.trim().slice(0, 80);
        if (!trimmed) {
            this.receiveSystemMessage({ text: 'Usage: /sayhere message' });
            return;
        }

        const position = this.getLocalPlayerPosition();
        const payload = {
            text: trimmed,
            username: this.playerName,
            x: position.x,
            y: position.y + 0.4,
            z: position.z
        };

        if (this.network.connected) {
            this.network.send('worldNote', payload);
        } else {
            this.addFloatingWorldText(payload);
        }
    },

    addFloatingWorldText(payload) {
        const label = payload.username ? `${payload.username}: ${payload.text}` : payload.text;
        const sprite = this.createNameTagSprite(label.slice(0, 96));
        sprite.position.set(payload.x, payload.y + 1.2, payload.z);
        sprite.scale.set(3.2, 0.8, 1);
        this.scene.add(sprite);
        this.worldNotes.push({ sprite, expiresAt: performance.now() + 30000 });
    },

    updateWorldNotes() {
        const now = performance.now();
        this.worldNotes = this.worldNotes.filter((note) => {
            if (now < note.expiresAt) return true;
            this.scene.remove(note.sprite);
            if (note.sprite.material && note.sprite.material.map) note.sprite.material.map.dispose();
            if (note.sprite.material) note.sprite.material.dispose();
            return false;
        });
    },

    sendWorldPing() {
        const position = this.getLocalPlayerPosition();
        const payload = {
            username: this.playerName,
            x: position.x,
            y: position.y,
            z: position.z
        };

        if (this.network.connected) {
            this.network.send('worldPing', payload);
        } else {
            this.addWorldPing(payload);
        }
    },

    addWorldPing(payload) {
        const group = new THREE.Group();
        const material = new THREE.MeshBasicMaterial({ color: 0x58d7ff, transparent: true, opacity: 0.48, depthWrite: false });
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.18, 7, 12), material);
        beam.position.y = 3.5;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.035, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.08;
        const label = this.createNameTagSprite(payload.username ? `${payload.username} ping` : 'Ping');
        label.position.y = 7.3;
        group.add(beam);
        group.add(ring);
        group.add(label);
        group.position.set(payload.x, payload.y, payload.z);
        this.scene.add(group);
        this.worldPings.push({ group, expiresAt: performance.now() + 10000 });
    },

    updateWorldPings(delta) {
        const now = performance.now();
        this.worldPings = this.worldPings.filter((ping) => {
            ping.group.rotation.y += delta * 1.8;
            if (now < ping.expiresAt) return true;
            this.scene.remove(ping.group);
            ping.group.traverse((node) => {
                if (node.geometry) node.geometry.dispose();
                if (node.material) {
                    if (node.material.map) node.material.map.dispose();
                    node.material.dispose();
                }
            });
            return false;
        });
    },

    sendPlayerReaction(kind) {
        const normalized = ['heart', 'clap', 'confetti'].includes(kind) ? kind : 'heart';
        const hit = this.raycastPlayer(7);
        if (!hit) {
            this.receiveSystemMessage({ text: 'Aim at a player, then use /react heart, /react clap, or /react confetti' });
            return;
        }

        const payload = { targetId: hit.playerId, kind: normalized };
        if (this.network.connected) {
            this.network.send('playerReaction', payload);
        } else {
            this.addPlayerReaction(payload);
        }
    },

    getReactionAnchor(targetId) {
        if (this.network && targetId === this.network.playerId) {
            const position = this.getLocalPlayerPosition();
            return new THREE.Vector3(position.x, position.y + 1.6, position.z);
        }

        const avatar = this.otherPlayerMeshes.get(targetId);
        if (!avatar) return null;
        const position = new THREE.Vector3();
        avatar.getWorldPosition(position);
        position.y += 1.8;
        return position;
    },

    addPlayerReaction(payload) {
        const anchor = this.getReactionAnchor(payload.targetId);
        if (!anchor) return;

        const group = new THREE.Group();
        const kind = payload.kind || 'heart';
        const color = kind === 'heart' ? 0xff5f8a : kind === 'clap' ? 0xffd166 : 0x80ffdb;
        const count = kind === 'confetti' ? 16 : kind === 'clap' ? 6 : 8;
        for (let i = 0; i < count; i++) {
            const geometry = kind === 'clap' ? new THREE.BoxGeometry(0.12, 0.08, 0.04) : new THREE.SphereGeometry(0.07, 8, 8);
            const material = new THREE.MeshBasicMaterial({ color: kind === 'confetti' ? [0xff5f8a, 0x58d7ff, 0xffd166, 0x80ffdb][i % 4] : color, transparent: true, opacity: 0.9 });
            const mesh = new THREE.Mesh(geometry, material);
            const angle = (i / count) * Math.PI * 2;
            mesh.position.set(Math.cos(angle) * 0.55, 0.2 + (i % 4) * 0.12, Math.sin(angle) * 0.55);
            mesh.userData.velocity = new THREE.Vector3(Math.cos(angle) * 0.45, 0.65 + (i % 3) * 0.12, Math.sin(angle) * 0.45);
            group.add(mesh);
        }
        group.position.copy(anchor);
        this.scene.add(group);
        this.playerReactions.push({ group, expiresAt: performance.now() + 1800, startedAt: performance.now() });
    },

    updatePlayerReactions(delta) {
        const now = performance.now();
        this.playerReactions = this.playerReactions.filter((reaction) => {
            const age = (now - reaction.startedAt) / 1800;
            reaction.group.children.forEach((mesh) => {
                mesh.position.addScaledVector(mesh.userData.velocity, delta);
                mesh.rotation.x += delta * 4;
                mesh.rotation.y += delta * 3;
                if (mesh.material) mesh.material.opacity = Math.max(0, 1 - age);
            });
            if (now < reaction.expiresAt) return true;
            this.scene.remove(reaction.group);
            reaction.group.traverse((node) => {
                if (node.geometry) node.geometry.dispose();
                if (node.material) node.material.dispose();
            });
            return false;
        });
    },

    sendProximityEmote(kind) {
        const position = this.getLocalPlayerPosition();
        const payload = { kind, x: position.x, y: position.y, z: position.z };
        if (this.network.connected) {
            this.network.send('proximityEmote', payload);
        } else {
            this.playProximityEmoteAt(payload);
        }
    },

    playProximityEmoteAt(payload) {
        const player = this.getLocalPlayerPosition();
        const dx = player.x - payload.x;
        const dy = player.y - payload.y;
        const dz = player.z - payload.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const volume = Math.max(0, 1 - distance / 16) * 0.045;
        if (volume <= 0.002) return;

        if (payload.kind === 'laugh') {
            this.playTone({ frequency: 520, duration: 0.06, type: 'triangle', volume, release: 0.05 });
            setTimeout(() => this.playTone({ frequency: 680, duration: 0.06, type: 'triangle', volume: volume * 0.85, release: 0.05 }), 70);
            setTimeout(() => this.playTone({ frequency: 610, duration: 0.06, type: 'triangle', volume: volume * 0.75, release: 0.05 }), 140);
        } else if (payload.kind === 'cheer') {
            this.playTone({ frequency: 392, duration: 0.08, type: 'square', volume: volume * 0.75, release: 0.06 });
            setTimeout(() => this.playTone({ frequency: 523, duration: 0.1, type: 'triangle', volume, release: 0.08 }), 80);
            setTimeout(() => this.playTone({ frequency: 784, duration: 0.12, type: 'triangle', volume: volume * 0.9, release: 0.1 }), 170);
        } else if (payload.kind === 'boo') {
            this.playTone({ frequency: 130, duration: 0.18, type: 'sawtooth', volume: volume * 0.9, release: 0.16 });
            this.playNoiseBurst({ duration: 0.12, volume: volume * 0.55, highpass: 90, lowpass: 500 });
        }
    },

    promptSignText() {
        const requested = window.prompt('Write the sign message (up to 288 characters)', '');
        if (requested === null) return null;

        const normalized = requested.replace(/\r/g, '').trim();
        if (!normalized) return null;
        return normalized.slice(0, 288);
    },

    onChatKeyDown(event) {
        event.stopPropagation();
        if (event.code === 'Enter') {
            event.preventDefault();
            this.submitChatMessage();
        } else if (event.code === 'Escape') {
            event.preventDefault();
            this.closeChatInput();
        }
    }
});
