// Procedural sound effects and positional audio.
// Mixed into Game.prototype; `this` is the Game instance.

Object.assign(Game.prototype, {
    ensureAudio() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;

        if (!this.audioContext) {
            this.audioContext = new AudioCtx();
        }

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        this.audioUnlocked = this.audioContext.state === 'running';
        return this.audioContext;
    },

    getNoiseBuffer() {
        const audio = this.ensureAudio();
        if (!audio) return null;
        if (this.noiseBuffer) return this.noiseBuffer;

        const buffer = audio.createBuffer(1, audio.sampleRate * 0.2, audio.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }

        this.noiseBuffer = buffer;
        return buffer;
    },

    playTone({ frequency, duration, type = 'sine', volume = 0.04, attack = 0.005, release = 0.08, detune = 0 }) {
        const audio = this.ensureAudio();
        if (!audio || audio.state !== 'running') return;

        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
        oscillator.detune.setValueAtTime(detune, audio.currentTime);

        const scaledVolume = volume * this.masterVolume;
        gain.gain.setValueAtTime(0.0001, audio.currentTime);
        gain.gain.linearRampToValueAtTime(scaledVolume, audio.currentTime + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration + release);

        oscillator.connect(gain).connect(audio.destination);
        oscillator.start();
        oscillator.stop(audio.currentTime + duration + release + 0.02);
    },

    playNoiseBurst({ duration, volume = 0.03, highpass = 300, lowpass = 2400 }) {
        const audio = this.ensureAudio();
        const buffer = this.getNoiseBuffer();
        if (!audio || !buffer || audio.state !== 'running') return;

        const source = audio.createBufferSource();
        source.buffer = buffer;

        const gain = audio.createGain();
        const hp = audio.createBiquadFilter();
        const lp = audio.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(highpass, audio.currentTime);
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(lowpass, audio.currentTime);

        gain.gain.setValueAtTime(volume * this.masterVolume, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);

        source.connect(hp).connect(lp).connect(gain).connect(audio.destination);
        source.start();
        source.stop(audio.currentTime + duration + 0.02);
    },

    playMiningSound(blockType) {
        const isHard = ['stone', 'cobblestone', 'coal_ore', 'iron_ore', 'gold_ore', 'brick'].includes(blockType);
        this.playNoiseBurst({ duration: isHard ? 0.07 : 0.05, volume: isHard ? 0.032 : 0.022, highpass: isHard ? 480 : 220, lowpass: isHard ? 1800 : 1400 });
        this.playTone({ frequency: isHard ? 185 : 145, duration: 0.045, type: 'square', volume: isHard ? 0.028 : 0.02, release: 0.05, detune: (Math.random() - 0.5) * 50 });
    },

    playPlaceSound(blockType) {
        const isHard = ['stone', 'cobblestone', 'coal_ore', 'iron_ore', 'gold_ore', 'brick'].includes(blockType);
        this.playTone({ frequency: isHard ? 210 : 170, duration: 0.06, type: 'triangle', volume: 0.028, release: 0.07 });
        this.playNoiseBurst({ duration: 0.04, volume: 0.016, highpass: 180, lowpass: isHard ? 2000 : 1200 });
    },

    playPickupSound() {
        this.playTone({ frequency: 660, duration: 0.04, type: 'square', volume: 0.025, release: 0.04 });
        this.playTone({ frequency: 880, duration: 0.05, type: 'triangle', volume: 0.02, attack: 0.01, release: 0.05 });
    },

    playJumpSound() {
        this.playTone({ frequency: 240, duration: 0.05, type: 'triangle', volume: 0.03, release: 0.07 });
        this.playNoiseBurst({ duration: 0.03, volume: 0.012, highpass: 140, lowpass: 900 });
    },

    getProximityAudio(position, maxRange = this.remoteFootstepRange) {
        const listenerPos = this.cameraController.getPosition();
        const dx = position.x - listenerPos.x;
        const dz = position.z - listenerPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance >= maxRange) return null;

        const volume = Math.pow(1 - distance / maxRange, 1.7);
        const pan = THREE.MathUtils.clamp(dx / maxRange, -1, 1);
        return { volume, pan };
    },

    playPositionalFootstep(position, blockType) {
        const audio = this.ensureAudio();
        const proximity = this.getProximityAudio(position);
        const buffer = this.getNoiseBuffer();
        if (!audio || !buffer || !proximity || audio.state !== 'running') return;

        const source = audio.createBufferSource();
        source.buffer = buffer;

        const hp = audio.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(['stone', 'cobblestone', 'stone_bricks', 'brick', 'glass'].includes(blockType) ? 420 : 180, audio.currentTime);

        const lp = audio.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(['sand', 'dirt', 'grass', 'leaves', 'cactus'].includes(blockType) ? 1200 : 1800, audio.currentTime);

        const gain = audio.createGain();
        gain.gain.setValueAtTime(0.012 * proximity.volume * this.masterVolume, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.12);

        if (typeof audio.createStereoPanner === 'function') {
            const panner = audio.createStereoPanner();
            panner.pan.setValueAtTime(proximity.pan, audio.currentTime);
            gain.connect(panner).connect(audio.destination);
        } else {
            gain.connect(audio.destination);
        }

        source.connect(hp).connect(lp).connect(gain);
        source.start();
        source.stop(audio.currentTime + 0.13);

        this.playTone({
            frequency: ['stone', 'cobblestone', 'stone_bricks', 'brick', 'glass'].includes(blockType) ? 165 : 120,
            duration: 0.035,
            type: 'triangle',
            volume: 0.007 * proximity.volume,
            release: 0.03,
            detune: (Math.random() - 0.5) * 35
        });
    },

    playLocalFootstepSound(blockType) {
        const hardSurface = ['stone', 'cobblestone', 'stone_bricks', 'brick', 'glass'].includes(blockType);
        const softSurface = ['sand', 'dirt', 'grass', 'tall_grass', 'flower_red', 'flower_yellow', 'mushroom_red', 'mushroom_brown', 'leaves', 'cactus'].includes(blockType);

        this.playNoiseBurst({
            duration: hardSurface ? 0.065 : 0.05,
            volume: hardSurface ? 0.022 : softSurface ? 0.016 : 0.018,
            highpass: hardSurface ? 420 : 170,
            lowpass: hardSurface ? 1750 : 1200
        });
        this.playTone({
            frequency: hardSurface ? 155 : softSurface ? 108 : 128,
            duration: 0.03,
            type: 'triangle',
            volume: hardSurface ? 0.012 : 0.009,
            release: 0.025,
            detune: (Math.random() - 0.5) * 32
        });
    },

    playSoundBlockAt(payload) {
        const player = this.getLocalPlayerPosition();
        const dx = player.x - payload.x;
        const dy = player.y - payload.y;
        const dz = player.z - payload.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const volume = Math.max(0, 1 - distance / 18) * 0.055;
        if (volume <= 0.002) return;

        const note = this.soundBlockNotes[Math.max(0, Math.min(this.soundBlockNotes.length - 1, payload.note || 0))];
        const instrument = payload.instrument || 'bell';
        if (instrument === 'drum') {
            this.playNoiseBurst({ duration: 0.09, volume, highpass: 70, lowpass: 520 });
            this.playTone({ frequency: 95, duration: 0.06, type: 'sine', volume: volume * 0.7, release: 0.05 });
        } else if (instrument === 'pluck') {
            this.playTone({ frequency: note, duration: 0.08, type: 'triangle', volume, attack: 0.002, release: 0.09 });
        } else if (instrument === 'flute') {
            this.playTone({ frequency: note, duration: 0.18, type: 'sine', volume: volume * 0.75, attack: 0.02, release: 0.14 });
        } else if (instrument === 'bass') {
            this.playTone({ frequency: note / 2, duration: 0.16, type: 'sawtooth', volume: volume * 0.8, attack: 0.006, release: 0.12 });
        } else {
            this.playTone({ frequency: note * 2, duration: 0.12, type: 'triangle', volume, attack: 0.004, release: 0.16 });
            this.playTone({ frequency: note * 3, duration: 0.08, type: 'sine', volume: volume * 0.35, attack: 0.004, release: 0.12 });
        }
    }
});
