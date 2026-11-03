// Cinematic camera, for recording videos; only in creative mode and left out of /help and the
// guide. Fly around (double-tap Space; Space up, Shift down), press K to drop a keyframe where
// the camera is and where it looks, and J to open the camera editor: every keyframe with its
// zoom (field of view) and the seconds to the next one, buttons to jump to a keyframe, retake
// it from the current view, reorder or delete it, play the path, orbit what you look at, and
// save named paths. Playback glides along a smooth curve, easing in and out, with the interface
// hidden; the player stays where they were and gets the camera back when the shot ends (or on
// Escape).
//
// Chat commands (same things, for those who prefer typing):
//   /cam add [fov] | undo | clear | list | play [seconds] | orbit [seconds] [radius] [height]
//   /cam save <name> | load <name> | paths | edit | stop
// Mixed into Game.prototype.

const CINEMATIC_STORAGE_KEY = 'minecloud-cinematic-paths';
const CINEMATIC_DEFAULT_SEGMENT = 3;

const CINEMATIC_CSS = `
#cinematic-panel{position:absolute;top:50%;right:14px;transform:translateY(-50%);width:min(520px,calc(100vw - 28px));max-height:86vh;display:none;flex-direction:column;gap:10px;padding:14px;border-radius:12px;background:rgba(10,14,22,.94);border:1px solid rgba(255,211,107,.45);color:#fff;font:12px/1.4 'Consolas',monospace;z-index:40}
#cinematic-panel.visible{display:flex}
#cinematic-panel h3{margin:0;font-size:15px;color:#ffd36b;flex:1}
#cinematic-panel .cine-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
#cinematic-panel .cine-keys{overflow-y:auto;max-height:42vh;display:flex;flex-direction:column;gap:4px}
#cinematic-panel .cine-key{display:flex;align-items:center;gap:6px;padding:5px 7px;border-radius:7px;background:rgba(255,255,255,.06)}
#cinematic-panel .cine-key b{color:#ffd36b;min-width:22px}
#cinematic-panel .cine-key .cine-pos{flex:1;color:#a9bdd5;font-size:11px}
#cinematic-panel button{height:26px;padding:0 9px;border-radius:6px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font:700 11px/1 'Consolas',monospace;cursor:pointer}
#cinematic-panel button:hover{background:rgba(255,255,255,.16)}
#cinematic-panel button.cine-play{background:#2f8a4a}
#cinematic-panel button.cine-danger{background:#7a3029}
#cinematic-panel input,#cinematic-panel select{font:12px 'Consolas',monospace;background:rgba(0,0,0,.35);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:5px;padding:2px 4px}
#cinematic-panel input[type=number]{width:52px}
#cinematic-panel .cine-hint{color:#a9bdd5;font-size:11px}
#cinematic-panel fieldset{border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:6px 8px;margin:0}
#cinematic-panel legend{color:#ffd36b;padding:0 4px}
`;

Object.assign(Game.prototype, {
    cinematicKeysList() {
        this.cinematicKeys = this.cinematicKeys || [];
        return this.cinematicKeys;
    },

    // The current view as a keyframe. While the editor is open the camera is frozen where it was
    // when the editor opened, so that is the view taken.
    cinematicCurrentView(fov = null) {
        return {
            position: this.camera.position.clone(),
            yaw: this.cameraController.yaw,
            pitch: this.cameraController.pitch,
            fov: Number.isFinite(fov) ? THREE.MathUtils.clamp(fov, 10, 110) : this.camera.fov,
            seconds: CINEMATIC_DEFAULT_SEGMENT
        };
    },

    cinematicAddKey(fov = null) {
        const keys = this.cinematicKeysList();
        keys.push(this.cinematicCurrentView(fov));
        this.cinematicShowPath();
        this.cinematicRenderPanel();
        this.playTone({ frequency: 880, duration: 0.05, type: 'triangle', volume: 0.015, release: 0.05 });
        this.receiveSystemMessage({ text: `Camera keyframe ${keys.length} added` });
    },

    cinematicCommand(args) {
        const action = (args[0] || 'help').toLowerCase();
        const keys = this.cinematicKeysList();
        switch (action) {
            case 'add':
                this.cinematicAddKey(parseFloat(args[1]));
                break;
            case 'undo':
                keys.pop();
                this.cinematicChanged();
                this.receiveSystemMessage({ text: `${keys.length} camera keyframes left` });
                break;
            case 'clear':
                this.cinematicKeys = [];
                this.cinematicChanged();
                this.receiveSystemMessage({ text: 'Camera keyframes cleared' });
                break;
            case 'list':
                this.receiveSystemMessage({ text: keys.length
                    ? keys.map((key, i) => `${i + 1}: ${key.position.x.toFixed(1)}, ${key.position.y.toFixed(1)}, ${key.position.z.toFixed(1)} (fov ${Math.round(key.fov)}, ${key.seconds}s)`).join(' · ')
                    : 'No camera keyframes yet: press K or /cam add' });
                break;
            case 'play': {
                const seconds = parseFloat(args[1]);
                this.cinematicPlay(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
                break;
            }
            case 'orbit': {
                const seconds = parseFloat(args[1]);
                const radius = parseFloat(args[2]);
                const height = parseFloat(args[3]);
                this.cinematicOrbit(seconds, radius, height);
                break;
            }
            case 'save':
                this.cinematicSave(args.slice(1).join(' ').trim());
                break;
            case 'load':
                this.cinematicLoad(args.slice(1).join(' ').trim());
                break;
            case 'paths': {
                const names = Object.keys(this.cinematicLoadPaths());
                this.receiveSystemMessage({ text: names.length ? `Camera paths: ${names.join(', ')}` : 'No saved camera paths' });
                break;
            }
            case 'edit':
                this.cinematicOpenPanel();
                break;
            case 'stop':
                this.cinematicStop();
                break;
            default:
                this.receiveSystemMessage({ text: 'Camera: K adds a keyframe, J opens the editor, double Space flies. /cam add [fov] | undo | clear | list | play [s] | orbit [s] [radius] [height] | save <name> | load <name> | paths | edit | stop' });
        }
    },

    cinematicChanged() {
        this.cinematicShowPath();
        this.cinematicRenderPanel();
    },

    cinematicPlay(totalSeconds = null) {
        const keys = this.cinematicKeysList();
        if (keys.length < 2) {
            this.receiveSystemMessage({ text: 'Add at least two keyframes first (K)' });
            return;
        }
        // Seconds per segment; a total from /cam play scales them all.
        let segments = keys.slice(0, -1).map((key) => Math.max(0.2, key.seconds || CINEMATIC_DEFAULT_SEGMENT));
        if (totalSeconds) {
            const sum = segments.reduce((a, b) => a + b, 0);
            segments = segments.map((seconds) => seconds * totalSeconds / sum);
        }
        this.cinematicStart({ kind: 'path', segments, duration: segments.reduce((a, b) => a + b, 0) });
    },

    cinematicOrbit(seconds, radius, height) {
        const hit = this.raycastBlock(64);
        const center = hit ? hit.point.clone() : this.camera.position.clone().add(new THREE.Vector3(0, 0, -8).applyEuler(this.camera.rotation));
        const settings = this.cinematicOrbitSettings || { seconds: 12, radius: 10, height: 4 };
        const shot = {
            kind: 'orbit',
            duration: Number.isFinite(seconds) && seconds > 0 ? seconds : settings.seconds,
            radius: Number.isFinite(radius) && radius > 0 ? radius : settings.radius,
            height: Number.isFinite(height) ? height : settings.height,
            center
        };
        shot.startAngle = Math.atan2(this.camera.position.z - center.z, this.camera.position.x - center.x);
        this.cinematicStart(shot);
    },

    cinematicSave(name) {
        const keys = this.cinematicKeysList();
        if (!name || keys.length === 0) {
            this.receiveSystemMessage({ text: 'Give the path a name and add keyframes first' });
            return;
        }
        const paths = this.cinematicLoadPaths();
        paths[name] = keys.map((key) => ({ p: key.position.toArray(), yaw: key.yaw, pitch: key.pitch, fov: key.fov, s: key.seconds }));
        this.cinematicSavePaths(paths);
        this.cinematicRenderPanel();
        this.receiveSystemMessage({ text: `Camera path "${name}" saved (${keys.length} keyframes)` });
    },

    cinematicLoad(name) {
        const saved = this.cinematicLoadPaths()[name];
        if (!saved) {
            this.receiveSystemMessage({ text: `No camera path called "${name}"` });
            return;
        }
        this.cinematicKeys = saved.map((key) => ({
            position: new THREE.Vector3().fromArray(key.p), yaw: key.yaw, pitch: key.pitch, fov: key.fov, seconds: key.s || CINEMATIC_DEFAULT_SEGMENT
        }));
        this.cinematicChanged();
        this.receiveSystemMessage({ text: `Camera path "${name}" loaded` });
    },

    cinematicLoadPaths() {
        try {
            return JSON.parse(window.localStorage.getItem(CINEMATIC_STORAGE_KEY) || '{}') || {};
        } catch (_error) {
            return {};
        }
    },

    cinematicSavePaths(paths) {
        try {
            window.localStorage.setItem(CINEMATIC_STORAGE_KEY, JSON.stringify(paths));
        } catch (_error) {
            // Storage blocked: the path lives until the page reloads.
        }
    },

    // A line through the keyframes with a small marker on each, so the path can be seen.
    cinematicShowPath() {
        if (this.cinematicLine) {
            this.scene.remove(this.cinematicLine);
            this.cinematicLine.traverse((node) => { if (node.geometry) node.geometry.dispose(); });
            this.cinematicLine = null;
        }
        const keys = this.cinematicKeysList();
        if (keys.length === 0) return;
        const group = new THREE.Group();
        const lineMaterial = this.cinematicLineMaterial || (this.cinematicLineMaterial = new THREE.LineBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.85, depthTest: false }));
        const markerMaterial = this.cinematicMarkerMaterial || (this.cinematicMarkerMaterial = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.9, depthTest: false }));
        if (keys.length > 1) {
            const points = new THREE.CatmullRomCurve3(keys.map((key) => key.position), false, 'centripetal').getPoints(keys.length * 24);
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMaterial));
        }
        keys.forEach((key) => {
            const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), markerMaterial);
            marker.position.copy(key.position);
            group.add(marker);
            // A short tick showing where that keyframe looks.
            const look = new THREE.Vector3(0, 0, -1.2).applyEuler(new THREE.Euler(key.pitch, key.yaw, 0, 'YXZ'));
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([key.position, key.position.clone().add(look)]), lineMaterial));
        });
        group.renderOrder = 3000;
        group.traverse((node) => { node.renderOrder = 3000; });
        this.cinematicLine = group;
        this.scene.add(group);
    },

    cinematicStart(shot) {
        if (this.cinematic) this.cinematicStop();
        // The pointer stays free during a shot: with it locked the browser keeps Escape to itself.
        this.cinematicClosePanel(false);
        if (document.pointerLockElement === this.renderer.domElement) {
            this.suppressPointerLockPauseUntil = performance.now() + 1000;
            document.exitPointerLock();
        }
        this.stopMining();
        this.cinematic = {
            ...shot,
            t: 0,
            saved: {
                position: this.camera.position.clone(),
                yaw: this.cameraController.yaw,
                pitch: this.cameraController.pitch,
                fov: this.camera.fov,
                photoMode: this.photoMode
            }
        };
        if (shot.kind === 'path') {
            const keys = this.cinematicKeysList();
            this.cinematic.keys = keys.map((key) => ({ ...key, position: key.position.clone() }));
            this.cinematic.curve = new THREE.CatmullRomCurve3(this.cinematic.keys.map((key) => key.position), false, 'centripetal');
        }
        if (this.cinematicLine) this.cinematicLine.visible = false;
        if (!this.photoMode) this.togglePhotoMode();
    },

    cinematicStop() {
        const shot = this.cinematic;
        if (!shot) return;
        this.cinematic = null;
        // A trip to a keyframe (Go) leaves the player there, flying; a shot gives the camera back.
        const end = shot.kind === 'travel' ? { position: shot.to.position, yaw: shot.to.yaw, pitch: shot.to.pitch } : shot.saved;
        if (shot.kind === 'travel') {
            this.cameraController.flying = true;
            this.cameraController.velocityY = 0;
        }
        this.camera.position.copy(end.position);
        if (this.thirdPersonAnchor) this.thirdPersonAnchor.copy(end.position);
        this.cameraController.yaw = end.yaw;
        this.cameraController.pitch = end.pitch;
        this.camera.rotation.set(end.pitch, end.yaw, 0, 'YXZ');
        this.camera.fov = shot.saved.fov;
        this.camera.updateProjectionMatrix();
        if (this.photoMode !== shot.saved.photoMode) this.togglePhotoMode();
        if (this.cinematicLine) this.cinematicLine.visible = true;
        this.recapturePointerLock();
    },

    // Flies the camera from where it is to a keyframe in a moment (the editor's Go).
    cinematicTravel(key) {
        const from = { position: this.camera.position.clone(), yaw: this.cameraController.yaw, pitch: this.cameraController.pitch, fov: this.camera.fov };
        const distance = from.position.distanceTo(key.position);
        this.cinematicStart({ kind: 'travel', from, to: key, duration: THREE.MathUtils.clamp(distance / 12, 0.6, 3) });
    },

    // Moves the camera along the shot; called instead of the player's controls while it plays.
    cinematicUpdateCamera(delta) {
        const shot = this.cinematic;
        shot.t = Math.min(1, shot.t + delta / shot.duration);
        const eased = shot.t * shot.t * (3 - 2 * shot.t);
        if (shot.kind === 'travel') {
            const a = shot.from;
            const b = shot.to;
            this.camera.position.lerpVectors(a.position, b.position, eased);
            const yaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * eased;
            this.camera.rotation.set(THREE.MathUtils.lerp(a.pitch, b.pitch, eased), yaw, 0, 'YXZ');
        } else if (shot.kind === 'orbit') {
            const angle = shot.startAngle + eased * Math.PI * 2;
            this.camera.position.set(shot.center.x + Math.cos(angle) * shot.radius, shot.center.y + shot.height, shot.center.z + Math.sin(angle) * shot.radius);
            this.camera.lookAt(shot.center);
        } else {
            // Which segment the (eased) time is in, from the seconds of each segment.
            const keys = shot.keys;
            let time = eased * shot.duration;
            let index = 0;
            while (index < shot.segments.length - 1 && time > shot.segments[index]) {
                time -= shot.segments[index];
                index++;
            }
            const local = Math.min(1, time / shot.segments[index]);
            this.camera.position.copy(shot.curve.getPoint((index + local) / (keys.length - 1)));
            const f = local * local * (3 - 2 * local);
            const a = keys[index];
            const b = keys[index + 1];
            const yaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * f;
            this.camera.rotation.set(THREE.MathUtils.lerp(a.pitch, b.pitch, f), yaw, 0, 'YXZ');
            const fov = THREE.MathUtils.lerp(a.fov, b.fov, f);
            if (Math.abs(this.camera.fov - fov) > 0.01) {
                this.camera.fov = fov;
                this.camera.updateProjectionMatrix();
            }
        }
        if (shot.t >= 1) this.cinematicStop();
    },

    // One frame while a shot plays: the world keeps living, the player's controls rest.
    cinematicFrame(delta) {
        this.cinematicUpdateCamera(delta);
        this.updateDayNightCycle(delta);
        this.updateWeather(delta);
        this.updateCaveLighting();
        this.world.update(this.camera.position.x, this.camera.position.z);
        this.world.updateSprayPaints(this.worldDay, this.timeOfDay);
        this.updateWorldNotes();
        this.updateWorldPings(delta);
        this.updatePlayerReactions(delta);
        this.updateAmbientMobs(delta);
        this.updateRemotePlayers(delta);
        this.updateFallingBlockDrops(delta);
        this.updatePickups(delta);
        this.updateUnderwaterEffect();
        this.updateUI();
        this.renderFrame(delta);
    },

    // ---- The editor panel -----------------------------------------------------------------

    cinematicInstallPanel() {
        if (this.cinematicPanel) return;
        const style = document.createElement('style');
        style.textContent = CINEMATIC_CSS;
        document.head.appendChild(style);
        const panel = document.createElement('div');
        panel.id = 'cinematic-panel';
        panel.addEventListener('mousedown', (event) => event.stopPropagation());
        panel.addEventListener('pointerdown', (event) => event.stopPropagation());
        panel.addEventListener('click', (event) => this.cinematicOnClick(event));
        panel.addEventListener('change', (event) => this.cinematicOnChange(event));
        // Numbers take effect while typing, not only when the box loses focus.
        panel.addEventListener('input', (event) => { if (event.target.type === 'number') this.cinematicOnChange(event, false); });
        document.body.appendChild(panel);
        this.cinematicPanel = panel;
    },

    cinematicOpenPanel() {
        this.cinematicInstallPanel();
        this.cinematicPanelOpen = true;
        this.stopMining();
        this.closeChatInput();
        this.suppressPointerLockPauseUntil = performance.now() + 1000;
        if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
        this.cinematicPanel.classList.add('visible');
        this.cinematicRenderPanel();
        this.updatePointerLockHint();
    },

    cinematicClosePanel(recapture = true) {
        if (!this.cinematicPanelOpen) return;
        this.cinematicPanelOpen = false;
        this.cinematicPanel.classList.remove('visible');
        this.suppressPointerLockPauseUntil = performance.now() + 250;
        if (recapture) this.recapturePointerLock();
        this.updatePointerLockHint();
    },

    cinematicRenderPanel() {
        if (!this.cinematicPanelOpen) return;
        const keys = this.cinematicKeysList();
        const orbit = this.cinematicOrbitSettings || (this.cinematicOrbitSettings = { seconds: 12, radius: 10, height: 4 });
        const total = keys.slice(0, -1).reduce((sum, key) => sum + (key.seconds || CINEMATIC_DEFAULT_SEGMENT), 0);
        const names = Object.keys(this.cinematicLoadPaths());
        const flying = this.cameraController.flying;
        const rows = keys.map((key, i) => `
            <div class="cine-key">
                <b>${i + 1}</b>
                <span class="cine-pos">${key.position.x.toFixed(1)}, ${key.position.y.toFixed(1)}, ${key.position.z.toFixed(1)}</span>
                <label title="Field of view (zoom): smaller is closer">fov <input type="number" min="10" max="110" step="1" data-field="fov" data-index="${i}" value="${Math.round(key.fov)}"></label>
                ${i < keys.length - 1 ? `<label title="Seconds to the next keyframe">→ <input type="number" min="0.2" max="120" step="0.5" data-field="seconds" data-index="${i}" value="${key.seconds}">s</label>` : '<span class="cine-hint" style="width:74px">end</span>'}
                <button type="button" data-action="goto" data-index="${i}" title="Move there to look from it">Go</button>
                <button type="button" data-action="retake" data-index="${i}" title="Replace with the view you had when opening the editor">Retake</button>
                <button type="button" data-action="up" data-index="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" data-action="down" data-index="${i}" ${i === keys.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="cine-danger" data-action="delete" data-index="${i}">✕</button>
            </div>`).join('');
        this.cinematicPanel.innerHTML = `
            <div class="cine-row"><h3>🎬 Camera editor</h3><button type="button" data-action="close">Close (J)</button></div>
            <div class="cine-hint">Fly with a double tap on Space (Space up, Shift down, double-tap W to go fast). Press <b>K</b> to add a keyframe where you look, <b>J</b> to come back here. Any key or a click stops a shot.</div>
            <div class="cine-row">
                <button type="button" data-action="add">+ Keyframe from current view</button>
                <label><input type="checkbox" data-field="fly" ${flying ? 'checked' : ''}> Flying</label>
                <label><input type="checkbox" data-field="path" ${this.cinematicLine && this.cinematicLine.visible !== false ? 'checked' : ''}> Show path</label>
            </div>
            <div class="cine-keys">${rows || '<div class="cine-hint">No keyframes yet: fly to a spot, look at something and press K.</div>'}</div>
            <div class="cine-row">
                <button type="button" class="cine-play" data-action="play" ${keys.length < 2 ? 'disabled' : ''}>▶ Play (${total.toFixed(1)} s)</button>
                <button type="button" class="cine-danger" data-action="clear" ${keys.length ? '' : 'disabled'}>Clear all</button>
            </div>
            <fieldset><legend>Orbit what you were looking at</legend><div class="cine-row">
                <label>seconds <input type="number" min="1" max="120" step="1" data-field="orbit-seconds" value="${orbit.seconds}"></label>
                <label>radius <input type="number" min="1" max="80" step="1" data-field="orbit-radius" value="${orbit.radius}"></label>
                <label>height <input type="number" min="-20" max="60" step="1" data-field="orbit-height" value="${orbit.height}"></label>
                <button type="button" class="cine-play" data-action="orbit">⟳ Orbit</button>
            </div></fieldset>
            <fieldset><legend>Saved paths</legend><div class="cine-row">
                <input type="text" data-field="name" placeholder="name" maxlength="30" style="width:120px">
                <button type="button" data-action="save">Save</button>
                <select data-field="saved">${names.map((name) => `<option>${name.replace(/</g, '&lt;')}</option>`).join('') || '<option value="">—</option>'}</select>
                <button type="button" data-action="load" ${names.length ? '' : 'disabled'}>Load</button>
                <button type="button" class="cine-danger" data-action="forget" ${names.length ? '' : 'disabled'}>Delete</button>
            </div></fieldset>`;
    },

    cinematicOnClick(event) {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const keys = this.cinematicKeysList();
        const index = Number(button.dataset.index);
        switch (button.dataset.action) {
            case 'close': this.cinematicClosePanel(); break;
            case 'add': this.cinematicAddKey(); break;
            case 'play': this.cinematicPlay(); break;
            case 'orbit': this.cinematicOrbit(); break;
            case 'clear': this.cinematicKeys = []; this.cinematicChanged(); break;
            case 'goto':
                this.cinematicTravel(keys[index]);
                break;
            case 'retake': {
                const fresh = this.cinematicCurrentView(keys[index].fov);
                fresh.seconds = keys[index].seconds;
                keys[index] = fresh;
                this.cinematicChanged();
                break;
            }
            case 'up':
            case 'down': {
                const other = index + (button.dataset.action === 'up' ? -1 : 1);
                [keys[index], keys[other]] = [keys[other], keys[index]];
                this.cinematicChanged();
                break;
            }
            case 'delete': keys.splice(index, 1); this.cinematicChanged(); break;
            case 'save': this.cinematicSave(this.cinematicPanel.querySelector('[data-field="name"]').value.trim()); break;
            case 'load': this.cinematicLoad(this.cinematicPanel.querySelector('[data-field="saved"]').value); break;
            case 'forget': {
                const name = this.cinematicPanel.querySelector('[data-field="saved"]').value;
                const paths = this.cinematicLoadPaths();
                delete paths[name];
                this.cinematicSavePaths(paths);
                this.cinematicRenderPanel();
                break;
            }
            default:
        }
    },

    cinematicOnChange(event, rerender = true) {
        const field = event.target.dataset.field;
        const keys = this.cinematicKeysList();
        const value = parseFloat(event.target.value);
        const orbit = this.cinematicOrbitSettings;
        if (field === 'fov' && Number.isFinite(value)) keys[Number(event.target.dataset.index)].fov = THREE.MathUtils.clamp(value, 10, 110);
        else if (field === 'seconds' && Number.isFinite(value)) keys[Number(event.target.dataset.index)].seconds = THREE.MathUtils.clamp(value, 0.2, 120);
        else if (field === 'orbit-seconds' && value > 0) orbit.seconds = value;
        else if (field === 'orbit-radius' && value > 0) orbit.radius = value;
        else if (field === 'orbit-height' && Number.isFinite(value)) orbit.height = value;
        else if (field === 'fly') this.cameraController.flying = event.target.checked;
        else if (field === 'path' && this.cinematicLine) this.cinematicLine.visible = event.target.checked;
        else return;
        if (field === 'seconds' && rerender) this.cinematicRenderPanel();
    },

    cinematicOnKeyDown(event) {
        if (this.cinematic && !/Shift|Control|Alt|Meta/.test(event.key)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.cinematicStop();
            return;
        }
        if (this.cinematicPanelOpen) {
            const typing = event.target && /INPUT|SELECT|TEXTAREA/.test(event.target.tagName);
            if (!event.repeat && (event.code === 'Escape' || (event.code === 'KeyJ' && !typing))) this.cinematicClosePanel();
            // Nothing else reaches the game while the editor is open (key releases still do).
            if (!typing || event.code === 'Escape') event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        if (!this.creativeMode || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
        const target = event.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
        if (!this.isGameplayActive() || this.cinematic) return;
        if (event.code === 'KeyK') {
            event.preventDefault();
            this.cinematicAddKey();
        } else if (event.code === 'KeyJ') {
            event.preventDefault();
            this.cinematicOpenPanel();
        }
    }
});

registerModalPanel({
    isOpen() { return Boolean(this.cinematicPanelOpen); },
    close() { this.cinematicClosePanel(); }
});

// Flight is a creative-mode privilege.
registerFrameUpdate(function () {
    if (this.cameraController) this.cameraController.flightAllowed = Boolean(this.creativeMode);
});

// /cam, only in creative mode (otherwise it answers like any unknown command). Wrapped once the
// game starts, after every file has added its own commands.
registerGameContent(function () {
    if (Game.prototype.cinematicCommandWrapped) return;
    Game.prototype.cinematicCommandWrapped = true;
    const runChatCommand = Game.prototype.runChatCommand;
    Game.prototype.runChatCommand = function (commandLine) {
        const [command, ...args] = commandLine.slice(1).split(/\s+/);
        if (command.toLowerCase() === 'cam' && this.creativeMode) {
            this.cinematicCommand(args);
            return;
        }
        runChatCommand.call(this, commandLine);
    };
    window.addEventListener('keydown', (event) => this.cinematicOnKeyDown(event), true);
    // A click anywhere during a shot stops it too.
    window.addEventListener('mousedown', (event) => {
        if (!this.cinematic) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.cinematicStop();
    }, true);
});
