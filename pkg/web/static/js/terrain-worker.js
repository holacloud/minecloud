function decodeBase64Bytes(value) {
    const binary = atob(value || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function isOpaque(type) {
    if (!type || type === 'air' || type === 'water' || type === 'ice' || type === 'leaves' || type.endsWith('_leaves')) return false;
    return type !== 'tall_grass' && type !== 'flower_red' && type !== 'flower_yellow' && type !== 'mushroom_red' && type !== 'mushroom_brown';
}

function isOpenNeighbor(data, palette, sizeX, sizeY, sizeZ, lx, ly, lz) {
    if (lx < 0 || ly < 0 || lz < 0 || lx >= sizeX || ly >= sizeY || lz >= sizeZ) return true;
    const typeId = data[(ly * sizeZ + lz) * sizeX + lx];
    return !isOpaque(palette[typeId]);
}

function isExposed(data, palette, sizeX, sizeY, sizeZ, lx, ly, lz) {
    return isOpenNeighbor(data, palette, sizeX, sizeY, sizeZ, lx + 1, ly, lz) ||
        isOpenNeighbor(data, palette, sizeX, sizeY, sizeZ, lx - 1, ly, lz) ||
        isOpenNeighbor(data, palette, sizeX, sizeY, sizeZ, lx, ly + 1, lz) ||
        isOpenNeighbor(data, palette, sizeX, sizeY, sizeZ, lx, ly - 1, lz) ||
        isOpenNeighbor(data, palette, sizeX, sizeY, sizeZ, lx, ly, lz + 1) ||
        isOpenNeighbor(data, palette, sizeX, sizeY, sizeZ, lx, ly, lz - 1);
}

function markIfSolid(data, keep, sizeX, sizeY, sizeZ, lx, ly, lz) {
    if (lx < 0 || ly < 0 || lz < 0 || lx >= sizeX || ly >= sizeY || lz >= sizeZ) return;
    const idx = (ly * sizeZ + lz) * sizeX + lx;
    if (data[idx] !== 0) keep[idx] = 1;
}

function decodeVolume(payload) {
    const data = decodeBase64Bytes(payload.data);
    const count = data.length;
    const palette = payload.palette || [];
    const sizeX = payload.sizeX;
    const sizeY = payload.sizeY;
    const sizeZ = payload.sizeZ;
    const keep = new Uint8Array(count);
    const renderGroups = new Map();
    const waterPositions = [];

    const addRenderPosition = (typeId, lx, ly, lz) => {
        let positions = renderGroups.get(typeId);
        if (!positions) {
            positions = [];
            renderGroups.set(typeId, positions);
        }
        positions.push(lx, ly, lz);
    };

    for (let ly = 0; ly < sizeY; ly++) {
        for (let lz = 0; lz < sizeZ; lz++) {
            for (let lx = 0; lx < sizeX; lx++) {
                const idx = (ly * sizeZ + lz) * sizeX + lx;
                const typeId = data[idx];
                if (typeId === 0) continue;
                const type = palette[typeId];
                if (type === 'water') {
                    const aboveId = ly + 1 < sizeY ? data[((ly + 1) * sizeZ + lz) * sizeX + lx] : 0;
                    if (palette[aboveId] !== 'water') waterPositions.push(lx, ly, lz);
                    keep[idx] = 1;
                    continue;
                }
                if (!isExposed(data, palette, sizeX, sizeY, sizeZ, lx, ly, lz)) continue;
                keep[idx] = 1;
                if (type !== 'ladder') addRenderPosition(typeId, lx, ly, lz);
                markIfSolid(data, keep, sizeX, sizeY, sizeZ, lx + 1, ly, lz);
                markIfSolid(data, keep, sizeX, sizeY, sizeZ, lx - 1, ly, lz);
                markIfSolid(data, keep, sizeX, sizeY, sizeZ, lx, ly + 1, lz);
                markIfSolid(data, keep, sizeX, sizeY, sizeZ, lx, ly - 1, lz);
                markIfSolid(data, keep, sizeX, sizeY, sizeZ, lx, ly, lz + 1);
                markIfSolid(data, keep, sizeX, sizeY, sizeZ, lx, ly, lz - 1);
            }
        }
    }

    let solidCount = 0;
    for (let i = 0; i < count; i++) {
        if (keep[i] !== 0) solidCount++;
    }

    const positions = new Int32Array(solidCount * 3);
    const typeIds = new Uint8Array(solidCount);
    let out = 0;
    for (let idx = 0; idx < count; idx++) {
        const typeId = data[idx];
        if (typeId === 0 || keep[idx] === 0) continue;

        const ly = Math.floor(idx / (sizeX * sizeZ));
        const rem = idx - ly * sizeX * sizeZ;
        const lz = Math.floor(rem / sizeX);
        const lx = rem - lz * sizeX;
        const p = out * 3;
        positions[p] = payload.originX + lx;
        positions[p + 1] = payload.originY + ly;
        positions[p + 2] = payload.originZ + lz;
        typeIds[out] = typeId;
        out++;
    }

    const packedRenderGroups = [];
    for (const [typeId, values] of renderGroups) {
        packedRenderGroups.push({ typeId, positions: new Int16Array(values) });
    }

    return { positions, typeIds, palette, originY: payload.originY, renderGroups: packedRenderGroups, waterPositions: new Int16Array(waterPositions) };
}

self.onmessage = async (event) => {
    const job = event.data;
    try {
        const response = await fetch(job.url, { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
        const decoded = decodeVolume(payload);
        const transfers = [decoded.positions.buffer, decoded.typeIds.buffer, decoded.waterPositions.buffer];
        for (const group of decoded.renderGroups) transfers.push(group.positions.buffer);
        self.postMessage({ id: job.id, chunkX: job.chunkX, chunkZ: job.chunkZ, ...decoded }, transfers);
    } catch (error) {
        self.postMessage({ id: job.id, chunkX: job.chunkX, chunkZ: job.chunkZ, error: error.message || String(error) });
    }
};
