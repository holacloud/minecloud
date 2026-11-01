// Genetics of tamed animals, and the breeding notebook that reads them.
//
// Every tamed animal carries a genome of three genes, each with two alleles (one from each
// parent):
//   coat   its colour, one allele per colour variant of the species, in a chain of dominance
//          (the allele earlier in GENETICS_COATS wins), plus the rare recessive albino 'a'
//   size   'L' / 'l' with incomplete dominance: LL large (x1.15), Ll normal, ll small (x0.85)
//   speed  'N' (normal) > 'f' (fast) > 's' (slow): walking speed x1, x1.3, x0.75; for a horse,
//          also how fast it gallops under a rider
// A wild animal gets a random genome that matches the colour it shows when it is tamed. A baby
// takes one random allele of each gene from each parent; 2 % of babies carry a mutation that
// turns one of their coat alleles into albino (white with pink eyes when it gets two of them).
//
// The breeding notebook (2 planks + 1 feather) right-clicked on a tamed animal opens a panel with
// its genotype, phenotype, parents and grandparents; right-clicking a second tamed animal of the
// same species adds a Punnett square of what their babies could look like.
//
// The genome lives in mob.userData (genome, geneticsId, geneticsName, geneticsFamily,
// geneticsMutation) and is saved with the tamed mobs (js/game/taming.js calls geneticsBreed,
// geneticsSave and geneticsRestore). The pure logic (GENETICS_LOGIC) does not touch the game, so
// it can be tested in Node.

// Coat alleles per species, most dominant first: variant (model colour), name, symbol, swatch.
// Species not listed get one allele per variant, in variant order.
const GENETICS_COATS = {
    sheep: [{ variant: 0, name: 'white', symbol: 'W', color: '#f1efe6' }],
    duck: [{ variant: 0, name: 'white', symbol: 'W', color: '#f4f0d8' }],
    pig: [{ variant: 0, name: 'pink', symbol: 'P', color: '#e7a2ab' }],
    giraffe: [{ variant: 0, name: 'spotted', symbol: 'S', color: '#f4a12c' }],
    dog: [{ variant: 0, name: 'tan', symbol: 'T', color: '#c89058' }],
    camel: [{ variant: 0, name: 'sandy', symbol: 'S', color: '#c9a46a' }],
    cat: [
        { variant: 1, name: 'tabby', symbol: 'T', color: '#7b6a5a' },
        { variant: 0, name: 'ginger', symbol: 'O', color: '#f2c36b' },
        { variant: 2, name: 'cream', symbol: 'c', color: '#f5f1e7' }
    ],
    macaw: [
        { variant: 0, name: 'green', symbol: 'G', color: '#24b45a' },
        { variant: 3, name: 'blue', symbol: 'B', color: '#1f7ae0' },
        { variant: 2, name: 'red', symbol: 'R', color: '#e3362d' },
        { variant: 1, name: 'yellow', symbol: 'y', color: '#ffd43b' }
    ],
    goat: [
        { variant: 0, name: 'white', symbol: 'W', color: '#e9e4d6' },
        { variant: 1, name: 'brown', symbol: 'w', color: '#9a7a52' }
    ],
    horse: [
        { variant: 3, name: 'grey', symbol: 'G', color: '#d9d4ca' },
        { variant: 0, name: 'bay', symbol: 'B', color: '#8a5a34' },
        { variant: 2, name: 'black', symbol: 'K', color: '#2b2522' },
        { variant: 1, name: 'chestnut', symbol: 'c', color: '#b8743c' }
    ]
};

// Which model an albino is built on (the lightest colour), then whitened (geneticsTint).
const GENETICS_ALBINO_BASE = { cat: 2, macaw: 1, goat: 0, horse: 3 };

const GENETICS = {
    mutationChance: 0.02,
    sizeScale: { large: 1.15, normal: 1, small: 0.85 },
    speedFactor: { normal: 1, fast: 1.3, slow: 0.75 },
    speedOrder: ['N', 'f', 's'],
    speedNames: { N: 'normal', f: 'fast', s: 'slow' },
    // Allele frequencies of wild animals.
    wildSize: { L: 0.5, l: 0.5 },
    wildSpeed: { N: 0.6, f: 0.2, s: 0.2 },
    names: ['Ada', 'Bruno', 'Canela', 'Dora', 'Elio', 'Fifi', 'Gus', 'Hada', 'Iris', 'Jazz', 'Kiko', 'Luna', 'Milo',
        'Nube', 'Olga', 'Pipo', 'Quina', 'Rufo', 'Sol', 'Toby', 'Uma', 'Vito', 'Wendy', 'Xena', 'Yago', 'Zuri',
        'Coco', 'Lola', 'Max', 'Nala', 'Rex', 'Tara', 'Bimba', 'Chispa', 'Goldie', 'Mendel']
};

const GENETICS_LOGIC = {
    // The coat alleles of a species, most dominant first, albino last. Keys are the variant
    // number as a string, or 'a' for albino.
    coatAlleles(species, variantCount = 1) {
        const listed = GENETICS_COATS[species] || Array.from({ length: Math.max(1, variantCount) }, (_, variant) => ({
            variant, name: `colour ${variant + 1}`, symbol: variant === 0 ? 'C' : `c${variant}`, color: '#b0a89a'
        }));
        const alleles = listed.map((allele) => ({ ...allele, key: String(allele.variant) }));
        const base = GENETICS_ALBINO_BASE[species] ?? listed[listed.length - 1].variant;
        alleles.push({ key: 'a', variant: base, name: 'albino', symbol: 'a', color: '#fbf6f2', albino: true });
        return alleles;
    },

    coatAllele(species, key, variantCount) {
        const alleles = this.coatAlleles(species, variantCount);
        return alleles.find((allele) => allele.key === String(key)) || alleles[0];
    },

    coatRank(species, key, variantCount) {
        const index = this.coatAlleles(species, variantCount).findIndex((allele) => allele.key === String(key));
        return index < 0 ? 0 : index;
    },

    // The alleles of a gene sorted with the dominant one first (how a genotype is written).
    sorted(gene, species, pair, variantCount) {
        const rank = gene === 'coat'
            ? (key) => this.coatRank(species, key, variantCount)
            : gene === 'size' ? (key) => (key === 'L' ? 0 : 1) : (key) => GENETICS.speedOrder.indexOf(key);
        return [...pair].sort((a, b) => rank(a) - rank(b));
    },

    // What the animal shows: its colour, size and speed.
    phenotype(species, genome, variantCount) {
        const [coatKey] = this.sorted('coat', species, genome.coat, variantCount);
        const coat = this.coatAllele(species, coatKey, variantCount);
        const large = genome.size.filter((allele) => allele === 'L').length;
        const size = large === 2 ? 'large' : large === 1 ? 'normal' : 'small';
        const [speedKey] = this.sorted('speed', species, genome.speed, variantCount);
        const speed = GENETICS.speedNames[speedKey] || 'normal';
        return {
            coat, variant: coat.variant, albino: Boolean(coat.albino),
            size, scale: GENETICS.sizeScale[size], speed, speedFactor: GENETICS.speedFactor[speed]
        };
    },

    pick(weights, random) {
        let roll = random() * Object.values(weights).reduce((sum, weight) => sum + weight, 0);
        for (const [key, weight] of Object.entries(weights)) {
            roll -= weight;
            if (roll < 0) return key;
        }
        return Object.keys(weights)[0];
    },

    // A random genome that shows the given colour variant: one allele is that colour, the other
    // any colour that does not dominate it (never albino in the wild).
    wildGenome(species, variant, random = Math.random, variantCount) {
        const alleles = this.coatAlleles(species, variantCount).filter((allele) => !allele.albino);
        let index = alleles.findIndex((allele) => allele.variant === variant);
        if (index < 0) index = 0;
        const hidden = alleles.slice(index);
        const other = hidden[Math.floor(random() * hidden.length)];
        const coat = random() < 0.5 ? [alleles[index].key, other.key] : [other.key, alleles[index].key];
        return {
            coat,
            size: [this.pick(GENETICS.wildSize, random), this.pick(GENETICS.wildSize, random)],
            speed: [this.pick(GENETICS.wildSpeed, random), this.pick(GENETICS.wildSpeed, random)]
        };
    },

    valid(species, genome, variantCount) {
        if (!genome || typeof genome !== 'object') return false;
        const keys = this.coatAlleles(species, variantCount).map((allele) => allele.key);
        const pair = (value, allowed) => Array.isArray(value) && value.length === 2 && value.every((key) => allowed.includes(key));
        return pair(genome.coat, keys) && pair(genome.size, ['L', 'l']) && pair(genome.speed, GENETICS.speedOrder);
    },

    // A baby: one random allele of each gene from each parent, and maybe a mutation.
    cross(species, mother, father, random = Math.random) {
        const genome = {};
        for (const gene of ['coat', 'size', 'speed']) {
            genome[gene] = [mother[gene][random() < 0.5 ? 0 : 1], father[gene][random() < 0.5 ? 0 : 1]];
        }
        let mutation = null;
        if (random() < GENETICS.mutationChance) {
            const side = random() < 0.5 ? 0 : 1;
            if (genome.coat[side] !== 'a') {
                genome.coat[side] = 'a';
                mutation = 'albino';
            }
        }
        return { genome, mutation };
    },

    // Odds of each outcome when crossing two genomes: the 2x2 Punnett square of the coat, plus
    // the chance of every coat, size and speed among the babies (mutations aside).
    punnett(species, a, b, variantCount) {
        const square = a.coat.map((fromA) => b.coat.map((fromB) => {
            const pair = this.sorted('coat', species, [fromA, fromB], variantCount);
            return { pair, coat: this.phenotype(species, { coat: pair, size: ['L', 'l'], speed: ['N', 'N'] }, variantCount).coat };
        }));
        const odds = { coat: {}, size: {}, speed: {} };
        for (const ca of a.coat) for (const cb of b.coat)
            for (const sa of a.size) for (const sb of b.size)
                for (const pa of a.speed) for (const pb of b.speed) {
                    const p = this.phenotype(species, { coat: [ca, cb], size: [sa, sb], speed: [pa, pb] }, variantCount);
                    odds.coat[p.coat.name] = (odds.coat[p.coat.name] || 0) + 1 / 64;
                    odds.size[p.size] = (odds.size[p.size] || 0) + 1 / 64;
                    odds.speed[p.speed] = (odds.speed[p.speed] || 0) + 1 / 64;
                }
        return { square, odds };
    },

    genotypeText(gene, species, pair, variantCount) {
        const sorted = this.sorted(gene, species, pair, variantCount);
        if (gene !== 'coat') return sorted.join('');
        return sorted.map((key) => this.coatAllele(species, key, variantCount).symbol).join('');
    }
};

const GENETICS_NOTEBOOK_SPRITE = [
    '............',
    '.DDDDDDDDD..',
    '.DLLLLLLLDP.',
    '.DLLGLLLLDP.',
    '.DLGLGLLLDP.',
    '.DLLGLLLLDP.',
    '.DLGLGLLLDP.',
    '.DLLGLLLLDP.',
    '.DLLLLLLLDP.',
    '.DLLLLLLLDP.',
    '.DDDDDDDDDP.',
    '..PPPPPPPPP.'
];

registerItemType('breeding_notebook', {
    color: 0x6b4a2a,
    name: 'Breeding Notebook',
    drawIcon: resourcesDrawSprite(GENETICS_NOTEBOOK_SPRITE, { D: 0x4a2f18, L: 0x8c5a32, G: 0x9fe3b4, P: 0xf2ead8 }),
    displayMesh: resourcesDisplayMesh
});

registerGameContent(function ({ addRecipe }) {
    addRecipe('breeding_notebook', 'Craft Breeding Notebook', 'breeding_notebook', 1, [{ type: 'planks', amount: 2 }, { type: 'feather', amount: 1 }]);
    this.geneticsInstall();
});

registerMobUseHandler(function (mob, item) {
    if (item !== 'breeding_notebook') return false;
    return this.geneticsUseNotebook(mob);
});

registerFrameUpdate(function () {
    this.geneticsUpdate();
});

registerModalPanel({
    isOpen() { return Boolean(this.geneticsOpen); },
    close() { this.geneticsClose(); }
});

const GENETICS_CSS = `
#genetics-panel{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(760px,calc(100vw - 28px));max-height:min(86vh,720px);display:none;flex-direction:column;gap:12px;padding:18px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(18,14,10,.94);color:#fff;font-family:'Consolas',monospace;z-index:275;box-sizing:border-box;overflow:auto}
#genetics-panel.visible{display:flex}
#genetics-panel .genetics-header{display:flex;align-items:center;gap:12px}
#genetics-panel h3{font-size:16px;margin:0;flex:1}
#genetics-panel h4{font-size:13px;margin:4px 0 0;color:#f2d79a}
#genetics-panel button{height:30px;padding:0 12px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;font:700 12px/1 'Consolas',monospace;cursor:pointer}
#genetics-panel table{border-collapse:collapse;font-size:12px}
#genetics-panel td,#genetics-panel th{padding:5px 9px;border:1px solid rgba(255,255,255,.12);text-align:left}
#genetics-panel th{color:#c9b591;font-weight:700}
#genetics-panel .genetics-note{color:#c7bba6;font-size:11px;line-height:1.45}
#genetics-panel .genetics-swatch{display:inline-block;width:11px;height:11px;border-radius:3px;border:1px solid rgba(0,0,0,.5);vertical-align:-1px;margin-right:5px}
#genetics-panel .genetics-tree{display:flex;flex-direction:column;gap:8px;align-items:center}
#genetics-panel .genetics-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
#genetics-panel .genetics-node{min-width:92px;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);font-size:11px;text-align:center;line-height:1.35}
#genetics-panel .genetics-node.self{border-color:rgba(159,227,180,.7)}
#genetics-panel .genetics-node.unknown{color:#8d8273}
#genetics-panel .genetics-punnett td{text-align:center;min-width:70px}
#genetics-panel .genetics-odds{display:flex;gap:18px;flex-wrap:wrap;font-size:12px}
#genetics-panel .genetics-odds div{line-height:1.5}
`;

Object.assign(Game.prototype, {
    geneticsInstall() {
        if (this.geneticsInstalled) return;
        this.geneticsInstalled = true;
        this.geneticsOpen = false;
        const style = document.createElement('style');
        style.textContent = GENETICS_CSS;
        document.head.appendChild(style);
        const panel = document.createElement('div');
        panel.id = 'genetics-panel';
        panel.addEventListener('mousedown', (event) => event.stopPropagation());
        panel.addEventListener('pointerdown', (event) => event.stopPropagation());
        panel.addEventListener('click', (event) => {
            if (event.target.closest('.genetics-close')) this.geneticsClose();
        });
        document.body.appendChild(panel);
        this.geneticsPanel = panel;
        // Clicking outside closes it, but not the very right click that opened it.
        document.addEventListener('mousedown', () => {
            if (this.geneticsOpen && performance.now() - this.geneticsOpenedAt > 300) this.geneticsClose();
        });
        window.addEventListener('keydown', (event) => {
            if (!this.geneticsOpen) return;
            if (event.code === 'Escape' && !event.repeat) this.geneticsClose();
            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);
    },

    geneticsVariantCount(species) {
        return (getMobSpecies(species) || {}).variants || 1;
    },

    // Every tamed animal gets a genome (wild ones and those tamed before genetics existed get
    // one that matches their colour); albinos are whitened again after a model rebuild.
    geneticsUpdate() {
        if (!this.ambientMobs) return;
        for (const mob of this.ambientMobs) {
            const data = mob.userData;
            if (!data.tamed) continue;
            if (!data.genome) this.geneticsAssign(mob, GENETICS_LOGIC.wildGenome(data.species, data.variant, Math.random, this.geneticsVariantCount(data.species)));
            if (data.geneticsAlbino && data.geneticsTintedRoot !== data.modelRoot) this.geneticsTint(mob);
        }
    },

    geneticsAssign(mob, genome, { family = null, mutation = null, id = null, name = null } = {}) {
        const data = mob.userData;
        data.genome = genome;
        data.geneticsId = id || Math.random().toString(16).slice(2, 6).toUpperCase();
        data.geneticsName = name || GENETICS.names[Math.floor(Math.random() * GENETICS.names.length)];
        data.geneticsFamily = family;
        data.geneticsMutation = mutation;
        const phenotype = GENETICS_LOGIC.phenotype(data.species, genome, this.geneticsVariantCount(data.species));
        data.geneticsScale = phenotype.scale;
        data.geneticsSpeed = phenotype.speedFactor;
        data.geneticsAlbino = phenotype.albino;
        if (!this.tamingIsBaby(mob)) mob.scale.setScalar(phenotype.scale);
        if (this.tamingSaveSoon) this.tamingSaveSoon();
    },

    // Called by tamingBreed before the baby exists: its genome and the colour to build it with.
    geneticsBreed(a, b) {
        for (const parent of [a, b]) {
            const data = parent.userData;
            if (!data.genome) this.geneticsAssign(parent, GENETICS_LOGIC.wildGenome(data.species, data.variant, Math.random, this.geneticsVariantCount(data.species)));
        }
        const species = a.userData.species;
        const child = GENETICS_LOGIC.cross(species, a.userData.genome, b.userData.genome);
        child.variant = GENETICS_LOGIC.phenotype(species, child.genome, this.geneticsVariantCount(species)).variant;
        child.family = { parents: [this.geneticsSnapshot(a), this.geneticsSnapshot(b)] };
        return child;
    },

    // Called by tamingBreed once the baby exists.
    geneticsBorn(baby, child) {
        this.geneticsAssign(baby, child.genome, { family: child.family, mutation: child.mutation });
        if (child.mutation) {
            this.receiveSystemMessage({ text: `Something is unusual about this baby ${this.tamingName(baby)}... check it with a breeding notebook` });
        }
    },

    // What a family tree keeps of an animal: itself and its parents (not further back).
    geneticsSnapshot(mob) {
        const data = mob.userData;
        const parents = data.geneticsFamily && data.geneticsFamily.parents;
        return {
            id: data.geneticsId, name: data.geneticsName, genome: data.genome,
            parents: parents ? parents.map((parent) => ({ id: parent.id, name: parent.name, genome: parent.genome })) : null
        };
    },

    geneticsSave(mob) {
        const data = mob.userData;
        if (!data.genome) return undefined;
        return { genome: data.genome, id: data.geneticsId, name: data.geneticsName, family: data.geneticsFamily || null, mutation: data.geneticsMutation || null };
    },

    geneticsRestore(mob, saved) {
        const data = mob.userData;
        if (!saved || !GENETICS_LOGIC.valid(data.species, saved.genome, this.geneticsVariantCount(data.species))) return;
        this.geneticsAssign(mob, saved.genome, saved);
    },

    // Albino coat: the model's colours turned pale and slightly warm, the darkest (eyes) pink.
    geneticsTint(mob) {
        const data = mob.userData;
        data.geneticsTintedRoot = data.modelRoot;
        if (!data.modelRoot) return;
        const seen = new Set();
        data.modelRoot.traverse((node) => {
            if (!node.isMesh || !node.material || seen.has(node.material)) return;
            const material = node.material;
            seen.add(material);
            material.onBeforeCompile = (shader) => {
                shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
                float geneticsLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
                diffuseColor.rgb = geneticsLuma < 0.1 ? vec3(0.86, 0.42, 0.48) : mix(vec3(geneticsLuma), vec3(1.0, 0.98, 0.96), 0.7);`);
            };
            material.customProgramCacheKey = () => 'genetics-albino';
            material.needsUpdate = true;
        });
    },

    // ---- Breeding notebook ----

    geneticsUseNotebook(mob) {
        const data = mob.userData;
        const name = this.tamingName(mob);
        if (!data.tamed) {
            const canTame = this.tamingCanTame && this.tamingCanTame(data.species);
            this.receiveSystemMessage({ text: canTame ? `Tame the ${name} first: the notebook only records your own animals` : `The notebook has no page for a wild ${name}` });
            return true;
        }
        if (!data.genome) this.geneticsAssign(mob, GENETICS_LOGIC.wildGenome(data.species, data.variant, Math.random, this.geneticsVariantCount(data.species)));
        const previous = this.geneticsPrevious;
        const partner = previous && previous !== mob && previous.userData.tamed && previous.userData.species === data.species && this.ambientMobs.includes(previous) ? previous : null;
        this.geneticsPrevious = mob;
        this.geneticsShow(mob, partner);
        return true;
    },

    geneticsShow(mob, partner) {
        this.geneticsOpen = true;
        this.geneticsOpenedAt = performance.now();
        this.stopMining();
        this.closeChatInput();
        this.suppressPointerLockPauseUntil = performance.now() + 1000;
        if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
        this.geneticsPanel.innerHTML = this.geneticsRender(mob, partner);
        this.geneticsPanel.classList.add('visible');
        this.updatePointerLockHint();
        this.playTone({ frequency: 520, endFrequency: 600, duration: 0.07, type: 'triangle', volume: 0.018, release: 0.06 });
    },

    geneticsClose() {
        if (!this.geneticsOpen) return;
        this.geneticsOpen = false;
        this.geneticsPanel.classList.remove('visible');
        this.suppressPointerLockPauseUntil = performance.now() + 250;
        this.recapturePointerLock();
        this.updatePointerLockHint();
    },

    geneticsEscape(text) {
        return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    geneticsSwatch(allele) {
        return `<span class="genetics-swatch" style="background:${allele.color}"></span>`;
    },

    geneticsRender(mob, partner) {
        const data = mob.userData;
        const species = data.species;
        const count = this.geneticsVariantCount(species);
        const name = this.tamingName(mob);
        const genome = data.genome;
        const phenotype = GENETICS_LOGIC.phenotype(species, genome, count);
        const coats = GENETICS_LOGIC.coatAlleles(species, count);
        const esc = (text) => this.geneticsEscape(text);
        const allele = (key) => GENETICS_LOGIC.coatAllele(species, key, count);
        const coatAlleles = GENETICS_LOGIC.sorted('coat', species, genome.coat, count).map((key) => `${this.geneticsSwatch(allele(key))}${esc(allele(key).symbol)} ${esc(allele(key).name)}`).join(' + ');
        const carrier = genome.coat[0] !== genome.coat[1] ? ` (carries ${esc(allele(GENETICS_LOGIC.sorted('coat', species, genome.coat, count)[1]).name)})` : '';
        const age = this.tamingIsBaby(mob) ? ', baby' : '';
        let html = `
            <div class="genetics-header">
                <h3>${esc(data.geneticsName)} the ${esc(name)} <span class="genetics-note">#${esc(data.geneticsId)}${age}</span></h3>
                <button class="genetics-close" type="button">Close</button>
            </div>
            <table>
                <tr><th>Gene</th><th>Genotype</th><th>Alleles</th><th>Phenotype</th></tr>
                <tr><td>Coat</td><td><b>${esc(GENETICS_LOGIC.genotypeText('coat', species, genome.coat, count))}</b></td><td>${coatAlleles}</td><td>${this.geneticsSwatch(phenotype.coat)}${esc(phenotype.coat.name)}${carrier}</td></tr>
                <tr><td>Size</td><td><b>${esc(GENETICS_LOGIC.genotypeText('size', species, genome.size, count))}</b></td><td>L large, l small (incomplete dominance)</td><td>${phenotype.size} (x${phenotype.scale})</td></tr>
                <tr><td>Speed</td><td><b>${esc(GENETICS_LOGIC.genotypeText('speed', species, genome.speed, count))}</b></td><td>N normal &gt; f fast &gt; s slow</td><td>${phenotype.speed} (x${phenotype.speedFactor})</td></tr>
            </table>
            <div class="genetics-note">Coat dominance: ${coats.map((a) => `${this.geneticsSwatch(a)}${esc(a.symbol)} ${esc(a.name)}`).join(' &gt; ')}. The allele written first wins; the second one is hidden but can reach the babies.${data.geneticsMutation ? ' <b>Born with a mutation: one of its coat alleles turned albino.</b>' : ''}</div>`;

        html += `<h4>Family tree</h4>${this.geneticsTree(mob)}`;

        if (partner) {
            html += this.geneticsPunnettHtml(partner, mob);
        } else {
            html += `<div class="genetics-note">Open the notebook on another tamed ${esc(name)} right after this one to see what their babies could look like (Punnett square).</div>`;
        }
        return html;
    },

    geneticsNode(entry, species, label, self = false) {
        const esc = (text) => this.geneticsEscape(text);
        if (!entry || !entry.genome) return `<div class="genetics-node unknown">${esc(label)}<br>? wild</div>`;
        const count = this.geneticsVariantCount(species);
        const p = GENETICS_LOGIC.phenotype(species, entry.genome, count);
        return `<div class="genetics-node${self ? ' self' : ''}">${esc(label)}<br><b>${esc(entry.name || '?')}</b><br>${this.geneticsSwatch(p.coat)}${esc(p.coat.name)}<br>${esc(GENETICS_LOGIC.genotypeText('coat', species, entry.genome.coat, count))} ${esc(GENETICS_LOGIC.genotypeText('size', species, entry.genome.size, count))} ${esc(GENETICS_LOGIC.genotypeText('speed', species, entry.genome.speed, count))}</div>`;
    },

    geneticsTree(mob) {
        const data = mob.userData;
        const species = data.species;
        const parents = (data.geneticsFamily && data.geneticsFamily.parents) || [null, null];
        const grand = [];
        parents.forEach((parent) => {
            const theirs = (parent && parent.parents) || [null, null];
            grand.push(theirs[0], theirs[1]);
        });
        const self = { name: data.geneticsName, genome: data.genome };
        const known = parents.some(Boolean);
        return `<div class="genetics-tree">
            ${grand.some(Boolean) ? `<div class="genetics-row">${grand.map((entry) => this.geneticsNode(entry, species, 'grandparent')).join('')}</div>` : ''}
            ${known ? `<div class="genetics-row">${parents.map((entry) => this.geneticsNode(entry, species, 'parent')).join('')}</div>` : '<div class="genetics-note">Parents unknown: it was born in the wild.</div>'}
            <div class="genetics-row">${this.geneticsNode(self, species, 'this one', true)}</div>
        </div>`;
    },

    geneticsPunnettHtml(a, b) {
        const species = a.userData.species;
        const count = this.geneticsVariantCount(species);
        const esc = (text) => this.geneticsEscape(text);
        const allele = (key) => GENETICS_LOGIC.coatAllele(species, key, count);
        const { square, odds } = GENETICS_LOGIC.punnett(species, a.userData.genome, b.userData.genome, count);
        const header = (key) => `${this.geneticsSwatch(allele(key))}${esc(allele(key).symbol)}`;
        const percent = (value) => `${Math.round(value * 1000) / 10} %`;
        const list = (entries) => Object.entries(entries).sort((x, y) => y[1] - x[1]).map(([key, value]) => `${esc(key)}: ${percent(value)}`).join('<br>');
        const rows = square.map((row, i) => `<tr><th>${header(a.userData.genome.coat[i])}</th>${row.map((cell) => `<td>${cell.pair.map((key) => esc(allele(key).symbol)).join('')}<br>${this.geneticsSwatch(cell.coat)}${esc(cell.coat.name)}</td>`).join('')}</tr>`).join('');
        return `<h4>Punnett square: ${esc(a.userData.geneticsName)} x ${esc(b.userData.geneticsName)} (coat)</h4>
            <table class="genetics-punnett">
                <tr><th></th>${b.userData.genome.coat.map((key) => `<th>${header(key)}</th>`).join('')}</tr>
                ${rows}
            </table>
            <div class="genetics-odds">
                <div><b>Coat</b><br>${list(odds.coat)}</div>
                <div><b>Size</b><br>${list(odds.size)}</div>
                <div><b>Speed</b><br>${list(odds.speed)}</div>
            </div>
            <div class="genetics-note">Each cell is one of four equally likely babies: one allele from ${esc(a.userData.geneticsName)} (rows) and one from ${esc(b.userData.geneticsName)} (columns). Now and then (2 %) a baby is born with a mutation.</div>`;
    }
});

if (typeof module !== 'undefined') module.exports = { GENETICS, GENETICS_COATS, GENETICS_LOGIC };
