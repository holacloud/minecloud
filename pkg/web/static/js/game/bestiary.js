// Bestiary: a field guide of every species. A species is discovered the first time the
// player sees one up close (within BESTIARY_SIGHT_RANGE blocks and roughly in view); the
// guide also keeps how many were met, when the first one was seen and how many the player
// defeated. B (or the button in the pause menu) opens a panel of cards: undiscovered ones
// are dark silhouettes with a hint of where to look, discovered ones show a portrait
// rendered from the species' voxel model and, when clicked, a slowly turning 3D preview,
// a description, habitat, activity, temperament and, when the taming / resources / traps
// mechanics define them, diet, drops and baits. Progress lives in localStorage.
// Mixed into Game.prototype; everything is wired from a registerGameContent hook.

const BESTIARY_STORAGE_KEY = 'minecloud-bestiary';
const BESTIARY_SIGHT_RANGE = 12;
// Cosine of the half-angle that counts as "in view" (about 55 degrees off-centre).
const BESTIARY_VIEW_COS = 0.57;
const BESTIARY_PORTRAIT_SIZE = 200;

// One entry per species. Species not yet in MOB_SPECIES are skipped; species in
// MOB_SPECIES but missing here still get a generic card.
const BESTIARY_ENTRIES = {
    sheep: {
        name: 'Sheep', habitat: 'Plains and rocky hills', activity: 'Day', temperament: 'Passive',
        hint: 'Grazes on open grassland.',
        description: 'A woolly grazer that wanders the meadows in small flocks, lowering its head to nibble the grass. It never fights back, it just bleats and trots away.'
    },
    duck: {
        name: 'Duck', habitat: 'Plains and desert oases', activity: 'Day', temperament: 'Passive',
        hint: 'Waddles near the water on the plains.',
        description: 'A cheerful waddler usually found in little groups. It quacks when poked and is happiest near a pond, even an oasis in the middle of the sand.'
    },
    pig: {
        name: 'Pig', habitat: 'Plains and forests', activity: 'Day', temperament: 'Passive',
        hint: 'Roots around in forests and fields.',
        description: 'A round, pink forager that snuffles through forests and fields, stopping to graze every few steps. Harmless and easily startled.'
    },
    giraffe: {
        name: 'Giraffe', habitat: 'Deserts and dry savanna', activity: 'Day', temperament: 'Passive',
        hint: 'Something very tall roams the dry lands.',
        description: 'A solitary giant whose neck towers over every bush. It strolls slowly across the dry lands and grazes peacefully. You will spot it from far away.'
    },
    dog: {
        name: 'Dog', habitat: 'Plains and forests', activity: 'Day', temperament: 'Friendly',
        hint: 'A loyal companion waits in the forests and fields.',
        description: 'Get close to a dog and it decides you are its new best friend: it follows you everywhere and even stands up to cave monsters on your behalf.'
    },
    cat: {
        name: 'Cat', habitat: 'Forests and plains', activity: 'Day', temperament: 'Friendly',
        hint: 'Purring can be heard in the woods.',
        description: 'A small, independent hunter in three coat colours. Walk up quietly and it may decide you are acceptable, then it will trail behind you and purr.'
    },
    spider: {
        name: 'Spider', habitat: 'Forests and rocky hills', activity: 'Day and night', temperament: 'Hostile',
        hint: 'Eight legs skitter in the forest shadows.',
        description: 'A large, dark arachnid that rushes at anyone who comes near. It hits hard but is quick to fall to a few solid blows.'
    },
    cave_monster: {
        name: 'Cave Monster', habitat: 'Rocky hills and caves', activity: 'Day and night', temperament: 'Hostile',
        hint: 'A heavy creature lurks among the rocks.',
        description: 'A hulking brute from the stony depths. It keeps its distance before charging and takes many hits to bring down. Dogs will fight it for you.'
    },
    macaw: {
        name: 'Macaw', habitat: 'Forests', activity: 'Day', temperament: 'Passive',
        hint: 'A flash of colour flutters through the trees.',
        description: 'A brightly coloured parrot that hovers a little above the ground in noisy flocks. Red, blue, green or yellow, no two flocks look alike.'
    },
    fish: {
        name: 'Fish', habitat: 'Lakes, rivers and seas', activity: 'Day and night', temperament: 'Passive',
        hint: 'Something glints beneath the water.',
        description: 'Fish swim in tight schools that cruise together, scatter when you dive in and now and then leap clear of the surface. Eagles love to snatch them.'
    },
    frog: {
        name: 'Frog', habitat: 'Shores and ponds', activity: 'Day and night', temperament: 'Passive',
        hint: 'Croaking echoes along the shore after dark.',
        description: 'A springy amphibian that hops along the shore, paddles at the surface and dives into the water when frightened. It croaks loudly at night.'
    },
    turtle: {
        name: 'Turtle', habitat: 'Beaches and shallow water', activity: 'Day', temperament: 'Passive',
        hint: 'A slow traveller plods along the beach.',
        description: 'A patient plodder that walks the beaches and sets off on long swims, surfacing to breathe. Startle it and it hides inside its shell.'
    },
    camel: {
        name: 'Camel', habitat: 'Deserts', activity: 'Day', temperament: 'Passive',
        hint: 'A humped shape crosses the dunes.',
        description: 'A sturdy desert traveller that grazes on sparse shrubs and now and then folds its long legs to rest on the warm sand.'
    },
    lizard: {
        name: 'Lizard', habitat: 'Deserts and rocky hills', activity: 'Day', temperament: 'Passive',
        hint: 'Something basks on the hot stones.',
        description: 'A sun-loving reptile that basks, does push-ups and then darts off in a blur. Strike it and it drops its tail to escape.'
    },
    scorpion: {
        name: 'Scorpion', habitat: 'Deserts and rocky hills', activity: 'Night', temperament: 'Hostile',
        hint: 'Beware the sand at night.',
        description: 'A desert stalker that hides by day and hunts at night. It lunges with its curled tail and its sting leaves you poisoned for a while.'
    },
    goat: {
        name: 'Goat', habitat: 'Rocky hills and mountains', activity: 'Day', temperament: 'Neutral',
        hint: 'Hooves clatter on the high ledges.',
        description: 'A nimble climber that leaps up ledges two blocks high and always seeks the highest ground. Every now and then it lowers its head and rams you.'
    },
    horse: {
        name: 'Horse', habitat: 'Plains', activity: 'Day', temperament: 'Passive',
        hint: 'Hoofbeats thunder across the open plains.',
        description: 'A swift grazer that roams the plains in small herds. Right click to ride it: it gallops fast and jumps high. Shift gets you off.'
    },
    bee: {
        name: 'Bee', habitat: 'Hives under tree canopies', activity: 'Day', temperament: 'Neutral',
        hint: 'Buzzing comes from under the treetops.',
        description: 'Bees live in colonies around a hive hanging under a tree. They visit flowers by day and shelter in the rain, but strike the hive or one of them and the whole swarm stings.'
    },
    firefly: {
        name: 'Firefly', habitat: 'Grassland and ponds', activity: 'Night', temperament: 'Passive',
        hint: 'Tiny lights blink over the grass at dusk.',
        description: 'From dusk to dawn fireflies drift in loose clouds over grass and ponds, blinking on and off. They shy away from you and scatter when swatted.'
    },
    shadow: {
        name: 'Wandering Shadow', habitat: 'Anywhere dark', activity: 'Night', temperament: 'Hostile',
        hint: 'Something watches you from the dark.',
        description: 'A tall hooded figure with glowing eyes that rises from the darkness and glides after you, freezing when watched. Daylight or a torch makes it dissolve into smoke.'
    },
    eagle: {
        name: 'Eagle', habitat: 'Mountains and plains', activity: 'Day', temperament: 'Passive',
        hint: 'A great bird circles high above the peaks.',
        description: 'A majestic raptor that rides the thermals in wide circles, perches on the highest point around and stoops on fish near the surface.'
    },
    bat: {
        name: 'Bat', habitat: 'Under roofs, overhangs and caves', activity: 'Night', temperament: 'Passive',
        hint: 'Look up under overhangs and canopies.',
        description: 'By day bats hang upside down under roofs and canopies, wrapped in their wings; come too close and the colony bursts out. At night they flit about erratically, chasing fireflies.'
    },
    crab: {
        name: 'Crab', habitat: 'Beaches and shores', activity: 'Day', temperament: 'Neutral',
        hint: 'Something scuttles sideways along the shore.',
        description: 'A shore dweller that scuttles sideways along the sand and buries itself when scared. Hit it and it pinches back with its claws.'
    },
    fox: {
        name: 'Fox', habitat: 'Forests and plains', activity: 'Day and night', temperament: 'Passive',
        hint: 'A russet tail vanishes into the woods.',
        description: 'A clever hunter that stalks rabbits and frogs. At night it sneaks around and steals items left lying on the ground, so keep your things close.'
    },
    rabbit: {
        name: 'Rabbit', habitat: 'Plains and forests', activity: 'Day', temperament: 'Passive',
        hint: 'Long ears twitch near the burrows.',
        description: 'A timid hopper that lives near its burrow, moving in short jumps. It bolts from foxes, owls and players alike.'
    },
    owl: {
        name: 'Owl', habitat: 'Forests', activity: 'Night', temperament: 'Passive',
        hint: 'Two round eyes follow you at night.',
        description: 'A silent night hunter that perches in the trees and turns its head to follow you. It swoops down on bats and rabbits in the dark.'
    },
    vulture: {
        name: 'Vulture', habitat: 'Deserts and rocky hills', activity: 'Day', temperament: 'Passive',
        hint: 'Dark wings circle where something has fallen.',
        description: 'A patient scavenger that circles above every fresh kill. If it starts circling over you, your health is running low.'
    },
    snake: {
        name: 'Snake', habitat: 'Deserts', activity: 'Day', temperament: 'Hostile',
        hint: 'A hiss rises from the sand.',
        description: 'It lies hidden in the sand and hisses as a warning before it strikes. Its bite is venomous, and it moves in smooth waves.'
    },
    storm_golem: {
        name: 'Storm Golem', habitat: 'Anywhere, during rain', activity: 'Rain', temperament: 'Neutral',
        hint: 'It only walks when storms roll in.',
        description: 'A towering figure that appears only in the rain and draws lightning to itself and to nearby metal blocks. Leave it be: strike it and it hurls bolts back.'
    },
    wisp: {
        name: 'Wisp', habitat: 'Wetlands and ravines', activity: 'Night', temperament: 'Passive',
        hint: 'A faint light beckons in the night.',
        description: 'A drifting light that tries to lure travellers towards water or a ravine. It never attacks, and if you catch one it leaves glowing dust behind.'
    },
    mole: {
        name: 'Giant Mole', habitat: 'Plains and forests', activity: 'Day', temperament: 'Passive',
        hint: 'Fresh mounds of earth appear and vanish.',
        description: 'A giant burrower that pops out of the ground, leaving mounds of soil that crumble away after a while. Watch for the mounds to find it.'
    }
};

// Movement modes whose mobs are lights or clouds: their position is all we need.
const BESTIARY_POINT_MOVEMENTS = new Set(['glow', 'swim']);

const _bestiaryForward = new THREE.Vector3();
const _bestiaryToMob = new THREE.Vector3();

const BESTIARY_CSS = `
#bestiary-panel{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(880px,calc(100vw - 28px));height:min(82vh,680px);display:none;flex-direction:column;gap:12px;padding:18px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(8,12,20,.93);color:#fff;font-family:'Consolas',monospace;z-index:275;box-sizing:border-box}
#bestiary-panel.visible{display:flex}
#bestiary-panel .bestiary-header{display:flex;align-items:center;gap:12px}
#bestiary-panel h3{font-size:16px;margin:0;flex:1}
#bestiary-progress{color:#a9bdd5;font-size:12px}
#bestiary-progress b{color:#9fe3b4}
#bestiary-panel button.bestiary-close,#bestiary-panel button.bestiary-back{height:30px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;font:700 12px/1 'Consolas',monospace;cursor:pointer}
#bestiary-panel .bestiary-body{display:flex;gap:14px;min-height:0;flex:1}
#bestiary-grid{flex:1;display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));grid-auto-rows:max-content;gap:10px;overflow:auto;min-height:0;padding-right:2px}
.bestiary-card{display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 6px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);color:#fff;cursor:pointer;text-align:center;font:12px/1.2 'Consolas',monospace}
.bestiary-card.selected{border-color:rgba(151,212,255,.9);box-shadow:0 0 0 2px rgba(151,212,255,.22)}
.bestiary-card.unknown{color:#7d8ba0}
.bestiary-card-portrait{width:72px;height:72px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:radial-gradient(circle at 50% 40%,rgba(120,160,210,.35),rgba(20,28,44,.6));background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;font-size:24px;color:rgba(255,255,255,.25)}
.bestiary-card.unknown .bestiary-card-portrait{background:radial-gradient(circle at 50% 40%,rgba(60,70,90,.4),rgba(10,14,22,.7))}
.bestiary-card-portrait img{width:100%;height:100%;object-fit:contain;pointer-events:none}
.bestiary-card.unknown .bestiary-card-portrait img{filter:brightness(0);opacity:.7}
.bestiary-card-meta{color:#a9bdd5;font-size:10px}
#bestiary-detail{width:300px;flex:none;display:none;flex-direction:column;gap:10px;padding:14px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:rgba(5,9,16,.68);overflow:auto;min-height:0;box-sizing:border-box}
#bestiary-panel.detail-open #bestiary-detail{display:flex}
#bestiary-detail .bestiary-preview{align-self:center;width:200px;height:200px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:radial-gradient(circle at 50% 40%,rgba(120,160,210,.35),rgba(20,28,44,.6));display:flex;align-items:center;justify-content:center;font-size:48px;color:rgba(255,255,255,.2);overflow:hidden;flex:none}
#bestiary-detail .bestiary-preview canvas{width:200px!important;height:200px!important;display:block}
#bestiary-detail .bestiary-preview img{width:100%;height:100%;object-fit:contain;filter:brightness(0);opacity:.7}
.bestiary-title{font-size:15px;font-weight:700}
.bestiary-tags{display:flex;flex-wrap:wrap;gap:6px}
.bestiary-tag{padding:3px 8px;border-radius:999px;font-size:11px;background:rgba(255,255,255,.08);color:#d9e6f7}
.bestiary-tag.hostile{background:rgba(220,70,70,.28);color:#ffc4c4}
.bestiary-tag.neutral{background:rgba(230,170,60,.25);color:#ffe0a8}
.bestiary-tag.passive,.bestiary-tag.friendly{background:rgba(70,180,110,.25);color:#bff0cf}
.bestiary-description{color:#d9e6f7;font-size:12px;line-height:1.45}
.bestiary-facts{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:12px;color:#c7d7ec}
.bestiary-facts dt{color:#8ea3bd}
.bestiary-facts dd{margin:0}
#bestiary-panel .bestiary-back{display:none;align-self:flex-start}
#bestiary-toast{position:fixed;left:50%;top:14%;transform:translate(-50%,-10px);padding:10px 18px;border-radius:10px;border:1px solid rgba(159,227,180,.4);background:rgba(8,12,20,.88);color:#fff;font:700 14px 'Consolas',monospace;pointer-events:none;z-index:300;opacity:0;transition:opacity .4s,transform .4s}
#bestiary-toast.visible{opacity:1;transform:translate(-50%,0)}
#bestiary-toast span{color:#9fe3b4}
@media (max-width:640px){
#bestiary-panel.detail-open #bestiary-grid{display:none}
#bestiary-detail{width:100%}
#bestiary-panel .bestiary-back{display:block}
}`;

Object.assign(Game.prototype, {
    bestiaryInstall() {
        if (this.bestiaryInstalled) return;
        this.bestiaryInstalled = true;
        this.bestiaryOpen = false;
        this.bestiarySelected = null;
        this.bestiaryPortraits = new Map();
        this.bestiaryPortraitQueue = [];
        this.bestiaryTextureCache = new Map();
        this.bestiarySeenMobs = new WeakSet();
        this.bestiaryData = this.bestiaryLoad();

        const style = document.createElement('style');
        style.textContent = BESTIARY_CSS;
        document.head.appendChild(style);
        this.bestiaryBuildPanel();

        // Capture phase on window: runs before the game's own keydown handlers.
        window.addEventListener('keydown', (event) => this.bestiaryOnKeyDown(event), true);
        // The pause menu markup exists by now; its listeners are wired later, which is fine.
        this.bestiaryAddPauseButton();
    },

    bestiaryLoad() {
        try {
            const raw = window.localStorage.getItem(BESTIARY_STORAGE_KEY);
            const data = raw ? JSON.parse(raw) : null;
            if (data && typeof data === 'object') return data;
        } catch (_error) { /* storage unavailable or corrupt */ }
        return {};
    },

    bestiarySave() {
        if (this.bestiarySaveTimer) return;
        this.bestiarySaveTimer = setTimeout(() => {
            this.bestiarySaveTimer = null;
            try {
                window.localStorage.setItem(BESTIARY_STORAGE_KEY, JSON.stringify(this.bestiaryData));
            } catch (_error) { /* storage full or blocked */ }
        }, 500);
    },

    bestiaryRecord(species) {
        let record = this.bestiaryData[species];
        if (!record) {
            record = this.bestiaryData[species] = { firstSeen: new Date().toISOString(), encounters: 0, defeated: 0 };
        }
        return record;
    },

    // Species listed in the guide: known entries whose species exists, then any other species.
    bestiarySpeciesList() {
        const species = typeof MOB_SPECIES === 'object' ? MOB_SPECIES : {};
        const list = Object.keys(BESTIARY_ENTRIES).filter((id) => species[id]);
        Object.keys(species).forEach((id) => { if (!BESTIARY_ENTRIES[id]) list.push(id); });
        return list;
    },

    bestiaryEntry(species) {
        const entry = BESTIARY_ENTRIES[species] || {};
        const info = (typeof getMobSpecies === 'function' && getMobSpecies(species)) || {};
        const pretty = species.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        return {
            name: entry.name || pretty,
            habitat: entry.habitat || this.bestiarySpawnBiomes(species) || 'Unknown',
            activity: entry.activity || (info.nocturnal ? 'Night' : 'Day'),
            temperament: entry.temperament || (info.hostile ? 'Hostile' : 'Passive'),
            hint: entry.hint || 'Keep exploring to find it.',
            description: entry.description || 'Little is known about this creature yet.'
        };
    },

    bestiarySpawnBiomes(species) {
        if (typeof this.getBiomeSpawnTable !== 'function') return '';
        const names = { plains: 'Plains', desert: 'Deserts', forest: 'Forests', rocky: 'Rocky hills' };
        return Object.keys(names)
            .filter((biome) => this.getBiomeSpawnTable(biome).some(([id]) => id === species))
            .map((biome) => names[biome]).join(', ');
    },

    // Discovery: a few times per second, every mob close enough and roughly in view.
    bestiaryScan() {
        if (this.titleScreenOpen || !this.camera || !this.ambientMobs) return;
        const eye = this.camera.position;
        this.camera.getWorldDirection(_bestiaryForward);
        for (const mob of this.ambientMobs) {
            if (this.bestiarySeenMobs.has(mob)) continue;
            const species = mob.userData.species;
            if (!species || mob.userData.modelSpecies || !mob.visible || !mob.parent) continue;
            _bestiaryToMob.copy(mob.position);
            const info = getMobSpecies(species) || {};
            if (!BESTIARY_POINT_MOVEMENTS.has(info.movement)) _bestiaryToMob.y += 0.4;
            _bestiaryToMob.sub(eye);
            const distance = _bestiaryToMob.length();
            if (distance > BESTIARY_SIGHT_RANGE) continue;
            if (distance > 2.5 && _bestiaryToMob.dot(_bestiaryForward) / distance < BESTIARY_VIEW_COS) continue;
            this.bestiarySeenMobs.add(mob);
            this.bestiaryEncounter(species);
        }
    },

    bestiaryEncounter(species) {
        const isNew = !this.bestiaryData[species];
        const record = this.bestiaryRecord(species);
        record.encounters = (record.encounters || 0) + 1;
        this.bestiarySave();
        if (isNew) {
            this.bestiaryAnnounce(species);
            if (this.bestiaryOpen) this.bestiaryRender();
        } else if (this.bestiaryOpen && this.bestiarySelected === species) {
            this.bestiaryRenderDetail();
        }
    },

    bestiaryOnDefeated(mob, cause) {
        const species = mob && mob.userData && mob.userData.species;
        if (!species || mob.userData.modelSpecies) return;
        if (cause && cause !== 'player') return;
        if (!this.bestiaryData[species]) {
            this.bestiarySeenMobs.add(mob);
            this.bestiaryEncounter(species);
        }
        const record = this.bestiaryRecord(species);
        record.defeated = (record.defeated || 0) + 1;
        this.bestiarySave();
        if (this.bestiaryOpen) this.bestiaryRender();
    },

    bestiaryAnnounce(species) {
        let toast = document.getElementById('bestiary-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'bestiary-toast';
            document.body.appendChild(toast);
        }
        toast.innerHTML = '';
        toast.append('New bestiary entry: ');
        const name = document.createElement('span');
        name.textContent = this.bestiaryEntry(species).name;
        toast.appendChild(name);
        toast.classList.add('visible');
        clearTimeout(this.bestiaryToastTimer);
        this.bestiaryToastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);

        // A soft rising chime.
        [784, 1046, 1318].forEach((frequency, index) => {
            setTimeout(() => this.playTone({ frequency, duration: 0.16, type: 'sine', volume: 0.022, attack: 0.01, release: 0.35 }), index * 110);
        });
    },

    // ---- Panel ----

    bestiaryBuildPanel() {
        const panel = document.createElement('div');
        panel.id = 'bestiary-panel';
        panel.innerHTML = `
            <div class="bestiary-header">
                <h3>Bestiary</h3>
                <div id="bestiary-progress"></div>
                <button class="bestiary-close" type="button">Close</button>
            </div>
            <div class="bestiary-body">
                <div id="bestiary-grid"></div>
                <div id="bestiary-detail"></div>
            </div>`;
        panel.querySelector('.bestiary-close').addEventListener('click', () => this.bestiaryClose());
        // Clicks inside the panel must not reach the game (which would try to grab the pointer).
        panel.addEventListener('mousedown', (event) => event.stopPropagation());
        panel.addEventListener('pointerdown', (event) => event.stopPropagation());
        document.body.appendChild(panel);
        this.bestiaryPanel = panel;
        // Clicking outside the panel closes it, like the other panels.
        document.addEventListener('mousedown', () => { if (this.bestiaryOpen) this.bestiaryClose(); });
    },

    bestiaryAddPauseButton() {
        const row = document.querySelector('#pause-menu .pause-actions-main');
        if (!row || document.getElementById('settings-bestiary')) return;
        const button = document.createElement('button');
        button.id = 'settings-bestiary';
        button.type = 'button';
        button.textContent = 'Bestiary (B)';
        button.addEventListener('click', () => {
            this.closePauseMenu(false);
            this.bestiaryShow();
        });
        row.appendChild(button);
    },

    bestiaryOnKeyDown(event) {
        if (this.bestiaryOpen) {
            if ((event.code === 'Escape' || event.code === 'KeyB') && !event.repeat) this.bestiaryClose();
            // Nothing else reaches the game while the guide is open (key releases still do).
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        if (event.code !== 'KeyB' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
        const target = event.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
        if (!this.isGameplayActive() || this.photoMode) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.bestiaryShow();
    },

    bestiaryShow() {
        if (this.bestiaryOpen) return;
        this.bestiaryOpen = true;
        this.stopMining();
        this.closeChatInput();
        // Losing the pointer lock would otherwise open the pause menu.
        this.suppressPointerLockPauseUntil = performance.now() + 1000;
        if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
        this.bestiaryPanel.classList.add('visible');
        this.bestiaryRender();
        this.updatePointerLockHint();
        this.playTone({ frequency: 440, duration: 0.05, type: 'triangle', volume: 0.018, release: 0.06 });
    },

    bestiaryClose() {
        if (!this.bestiaryOpen) return;
        this.bestiaryOpen = false;
        this.bestiaryPanel.classList.remove('visible');
        this.bestiaryStopPreview();
        this.suppressPointerLockPauseUntil = performance.now() + 250;
        this.recapturePointerLock();
        this.updatePointerLockHint();
    },

    bestiaryRender() {
        const list = this.bestiarySpeciesList();
        const discovered = list.filter((species) => this.bestiaryData[species]).length;
        const progress = this.bestiaryPanel.querySelector('#bestiary-progress');
        progress.innerHTML = `<b>${discovered}</b> / ${list.length} discovered`;

        const grid = this.bestiaryPanel.querySelector('#bestiary-grid');
        grid.innerHTML = '';
        list.forEach((species) => {
            const known = Boolean(this.bestiaryData[species]);
            const entry = this.bestiaryEntry(species);
            const card = document.createElement('div');
            card.className = 'bestiary-card' + (known ? '' : ' unknown') + (this.bestiarySelected === species ? ' selected' : '');
            card.dataset.species = species;
            const portrait = document.createElement('div');
            portrait.className = 'bestiary-card-portrait';
            this.bestiaryFillPortrait(portrait, species);
            const name = document.createElement('div');
            name.textContent = known ? entry.name : '???';
            const meta = document.createElement('div');
            meta.className = 'bestiary-card-meta';
            meta.textContent = known ? `Seen ${this.bestiaryData[species].encounters || 1}x` : entry.habitat;
            card.append(portrait, name, meta);
            card.addEventListener('click', () => {
                this.bestiarySelected = species;
                this.bestiaryRender();
                this.playTone({ frequency: 620, duration: 0.04, type: 'triangle', volume: 0.016, release: 0.05 });
            });
            grid.appendChild(card);
        });
        this.bestiaryRenderDetail();
    },

    // The cached portrait, or a placeholder that fills in once the portrait is rendered.
    bestiaryFillPortrait(element, species) {
        const url = this.bestiaryPortraits.get(species);
        if (url) {
            const img = document.createElement('img');
            img.src = url;
            img.alt = '';
            element.appendChild(img);
            return;
        }
        element.textContent = '?';
        if (url === null) return; // no model for this species
        if (!this.bestiaryPortraitQueue.includes(species)) this.bestiaryPortraitQueue.push(species);
        this.bestiaryPumpPortraits();
    },

    // One portrait per frame, so opening the guide never stalls the game.
    bestiaryPumpPortraits() {
        if (this.bestiaryPortraitPumping) return;
        this.bestiaryPortraitPumping = true;
        const step = () => {
            const species = this.bestiaryPortraitQueue.shift();
            if (!species) {
                this.bestiaryPortraitPumping = false;
                return;
            }
            const url = this.bestiaryRenderPortrait(species);
            this.bestiaryPortraits.set(species, url);
            if (this.bestiaryOpen) {
                const card = this.bestiaryPanel.querySelector(`.bestiary-card[data-species="${species}"] .bestiary-card-portrait`);
                if (card && url) {
                    card.textContent = '';
                    this.bestiaryFillPortrait(card, species);
                }
                if (this.bestiarySelected === species && !this.bestiaryData[species]) this.bestiaryRenderDetail();
            }
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    },

    // ---- Portraits and preview (a small renderer of our own, like the appearance preview) ----

    bestiaryStage() {
        if (this.bestiaryStageState) return this.bestiaryStageState;
        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        } catch (_error) {
            this.bestiaryStageState = { failed: true };
            return this.bestiaryStageState;
        }
        renderer.setPixelRatio(1);
        renderer.setSize(BESTIARY_PORTRAIT_SIZE, BESTIARY_PORTRAIT_SIZE, false);
        renderer.setClearColor(0x000000, 0);
        if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xdfeaff, 0x3a3226, 0.75));
        const sun = new THREE.DirectionalLight(0xffffff, 0.8);
        sun.position.set(2, 4, 3);
        scene.add(sun);
        const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
        const holder = new THREE.Group();
        scene.add(holder);
        this.bestiaryStageState = { renderer, scene, camera, holder, model: null };
        return this.bestiaryStageState;
    },

    bestiaryHasModel(species) {
        return typeof VoxelModels !== 'undefined' && VoxelModels.mobBuilders && Boolean(VoxelModels.mobBuilders[species]);
    },

    // Puts the species' model on the stage, framed to fill the view. Returns false if it can't.
    bestiaryStageModel(species) {
        const stage = this.bestiaryStage();
        if (stage.failed || !this.bestiaryHasModel(species)) return false;
        if (stage.species === species && stage.model) return true;
        this.bestiaryClearStage();
        let model;
        try {
            model = VoxelModels.createMob(species, (texture) => new THREE.MeshLambertMaterial({ map: texture, transparent: true, alphaTest: 0.1 }), this.bestiaryTextureCache, 0, false);
        } catch (error) {
            console.warn('[bestiary] could not build model for', species, error);
            return false;
        }
        const root = model.root;
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        root.position.sub(centre);
        stage.holder.add(root);
        stage.holder.rotation.set(0, -0.65, 0);
        const radius = Math.max(size.x, size.y, size.z, 0.2) * 0.62;
        const distance = radius / Math.tan((stage.camera.fov * Math.PI / 180) / 2) * 1.15;
        stage.camera.position.set(0, distance * 0.28, distance);
        stage.camera.lookAt(0, 0, 0);
        stage.model = root;
        stage.species = species;
        return true;
    },

    bestiaryClearStage() {
        const stage = this.bestiaryStageState;
        if (!stage || !stage.model) return;
        stage.holder.remove(stage.model);
        stage.model.traverse((node) => {
            if (node.isMesh) {
                if (node.userData.disposeGeometry) node.geometry.dispose();
                if (node.material) node.material.dispose();
            }
        });
        stage.model = null;
        stage.species = null;
    },

    // A PNG data URL of the species' model, or null if it has no model (yet).
    bestiaryRenderPortrait(species) {
        if (!this.bestiaryStageModel(species)) return null;
        const stage = this.bestiaryStageState;
        stage.holder.rotation.y = -0.65;
        stage.renderer.render(stage.scene, stage.camera);
        try {
            return stage.renderer.domElement.toDataURL('image/png');
        } catch (_error) {
            return null;
        }
    },

    bestiaryStartPreview(host, species) {
        this.bestiaryStopPreview();
        if (!this.bestiaryStageModel(species)) return false;
        const stage = this.bestiaryStageState;
        host.textContent = '';
        host.appendChild(stage.renderer.domElement);
        let last = performance.now();
        const frame = (now) => {
            if (!this.bestiaryOpen || this.bestiaryPreviewSpecies !== species) return;
            // A portrait rendered meanwhile may have swapped the model.
            if (!this.bestiaryStageModel(species)) return;
            stage.holder.rotation.y += Math.min(0.1, (now - last) / 1000) * 0.6;
            last = now;
            stage.renderer.render(stage.scene, stage.camera);
            this.bestiaryPreviewFrame = requestAnimationFrame(frame);
        };
        this.bestiaryPreviewSpecies = species;
        this.bestiaryPreviewFrame = requestAnimationFrame(frame);
        return true;
    },

    bestiaryStopPreview() {
        if (this.bestiaryPreviewFrame) cancelAnimationFrame(this.bestiaryPreviewFrame);
        this.bestiaryPreviewFrame = null;
        this.bestiaryPreviewSpecies = null;
        const stage = this.bestiaryStageState;
        if (stage && stage.renderer && stage.renderer.domElement.parentNode) {
            stage.renderer.domElement.parentNode.removeChild(stage.renderer.domElement);
        }
    },

    // ---- Detail ----

    bestiaryRenderDetail() {
        const detail = this.bestiaryPanel.querySelector('#bestiary-detail');
        const species = this.bestiarySelected;
        if (!species || !this.bestiarySpeciesList().includes(species)) {
            this.bestiaryPanel.classList.remove('detail-open');
            this.bestiaryStopPreview();
            detail.innerHTML = '';
            return;
        }
        this.bestiaryPanel.classList.add('detail-open');
        const record = this.bestiaryData[species];
        const entry = this.bestiaryEntry(species);

        const keepPreview = record && this.bestiaryPreviewSpecies === species;
        const previewHost = keepPreview ? detail.querySelector('.bestiary-preview') : null;
        if (!keepPreview) this.bestiaryStopPreview();
        detail.innerHTML = '';

        const back = document.createElement('button');
        back.className = 'bestiary-back';
        back.type = 'button';
        back.textContent = '< Back';
        back.addEventListener('click', () => {
            this.bestiarySelected = null;
            this.bestiaryRender();
        });
        detail.appendChild(back);

        const preview = previewHost || document.createElement('div');
        preview.className = 'bestiary-preview';
        detail.appendChild(preview);
        if (!keepPreview) {
            preview.textContent = '?';
            if (record) {
                this.bestiaryStartPreview(preview, species);
            } else if (this.bestiaryPortraits.get(species)) {
                preview.textContent = '';
                const img = document.createElement('img');
                img.src = this.bestiaryPortraits.get(species);
                img.alt = '';
                preview.appendChild(img);
            }
        }

        const title = document.createElement('div');
        title.className = 'bestiary-title';
        title.textContent = record ? entry.name : '???';
        detail.appendChild(title);

        if (!record) {
            const hint = document.createElement('div');
            hint.className = 'bestiary-description';
            hint.textContent = `Not yet discovered. ${entry.hint} Habitat: ${entry.habitat}.`;
            detail.appendChild(hint);
            return;
        }

        const tags = document.createElement('div');
        tags.className = 'bestiary-tags';
        const temperament = document.createElement('span');
        temperament.className = `bestiary-tag ${entry.temperament.toLowerCase()}`;
        temperament.textContent = entry.temperament;
        const activity = document.createElement('span');
        activity.className = 'bestiary-tag';
        activity.textContent = entry.activity === 'Rain' ? 'Active in rain' : `Active: ${entry.activity}`;
        tags.append(temperament, activity);
        detail.appendChild(tags);

        const description = document.createElement('div');
        description.className = 'bestiary-description';
        description.textContent = entry.description;
        detail.appendChild(description);

        const facts = document.createElement('dl');
        facts.className = 'bestiary-facts';
        const addFact = (label, value) => {
            if (!value) return;
            const dt = document.createElement('dt');
            dt.textContent = label;
            const dd = document.createElement('dd');
            dd.textContent = value;
            facts.append(dt, dd);
        };
        addFact('Habitat', entry.habitat);
        addFact('Diet', this.bestiaryLookup(typeof TAMING_DIET !== 'undefined' ? TAMING_DIET : null, species));
        // Drops are [item, min, max, chance] rows; lures come from the trap table's baits.
        const drops = typeof RESOURCE_DROPS !== 'undefined' && RESOURCE_DROPS[species] ? { [species]: RESOURCE_DROPS[species].map(([item]) => item) } : null;
        const lures = typeof TRAPS_SPECIES !== 'undefined' && TRAPS_SPECIES[species] ? { [species]: TRAPS_SPECIES[species].baits } : null;
        addFact('Drops', this.bestiaryLookup(drops, species));
        addFact('Lured by', this.bestiaryLookup(lures, species));
        addFact('Encounters', String(record.encounters || 1));
        addFact('Defeated', String(record.defeated || 0));
        addFact('First seen', this.bestiaryFormatDate(record.firstSeen));
        detail.appendChild(facts);
    },

    // Reads another mechanic's per-species table, whatever its shape. With `reverse`, also
    // accepts tables keyed by item that list the species they attract.
    bestiaryLookup(table, species, reverse = false) {
        if (!table || typeof table !== 'object') return '';
        try {
            if (table[species] !== undefined) return this.bestiaryDescribe(table[species]);
            if (!reverse) return '';
            const items = Object.keys(table).filter((item) => {
                const value = table[item];
                if (Array.isArray(value)) return value.some((entry) => entry === species || (entry && entry.species === species));
                if (value && typeof value === 'object') return Boolean(value[species]) || value.species === species || (Array.isArray(value.species) && value.species.includes(species));
                return value === species;
            });
            return items.map((item) => this.bestiaryItemName(item)).join(', ');
        } catch (_error) {
            return '';
        }
    },

    bestiaryDescribe(value) {
        if (value === null || value === undefined || value === false) return '';
        if (typeof value === 'string') return this.bestiaryItemName(value);
        if (typeof value === 'number' || value === true) return '';
        if (Array.isArray(value)) return value.map((item) => this.bestiaryDescribe(item)).filter(Boolean).join(', ');
        if (typeof value === 'object') {
            const id = value.type || value.item || value.id || value.food;
            if (typeof id === 'string') {
                const amount = value.amount || value.count;
                return this.bestiaryItemName(id) + (Array.isArray(amount) ? ` x${amount.join('-')}` : amount > 1 ? ` x${amount}` : '');
            }
            if (Array.isArray(value.items)) return this.bestiaryDescribe(value.items);
            if (Array.isArray(value.foods)) return this.bestiaryDescribe(value.foods);
            if (Array.isArray(value.drops)) return this.bestiaryDescribe(value.drops);
            return Object.keys(value).map((key) => this.bestiaryItemName(key)).join(', ');
        }
        return '';
    },

    bestiaryItemName(id) {
        if (typeof ITEM_TYPES !== 'undefined' && ITEM_TYPES[id] && ITEM_TYPES[id].name) return ITEM_TYPES[id].name;
        const blockTypes = this.world && this.world.blockTypes;
        const block = blockTypes && (blockTypes[id] || (Array.isArray(blockTypes) ? blockTypes.find((b) => b && b.id === id) : null));
        if (block && typeof block.name === 'string') return block.name;
        if (typeof this.formatItemName === 'function') return this.formatItemName(String(id));
        return String(id).split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    },

    bestiaryFormatDate(iso) {
        const date = iso ? new Date(iso) : null;
        if (!date || isNaN(date.getTime())) return '';
        try {
            return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (_error) {
            return date.toISOString().slice(0, 10);
        }
    }
});

registerModalPanel({
    isOpen() { return Boolean(this.bestiaryOpen); },
    close() { this.bestiaryClose(); }
});

registerGameContent(function () { this.bestiaryInstall(); });
onMobEvent('defeated', function (mob, cause) { if (this.bestiaryInstalled) this.bestiaryOnDefeated(mob, cause); });

// Discovery checks, four times a second.
registerFrameUpdate(function (delta) {
    this.bestiaryScanTimer = (this.bestiaryScanTimer || 0) - delta;
    if (this.bestiaryScanTimer > 0) return;
    this.bestiaryScanTimer = 0.25;
    this.bestiaryScan();
});
