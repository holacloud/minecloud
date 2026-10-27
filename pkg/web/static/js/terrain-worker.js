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

function markSolidColumnBelow(data, keep, sizeX, sizeZ, lx, ly, lz) {
    for (let y = ly - 1; y >= 0; y--) {
        const idx = (y * sizeZ + lz) * sizeX + lx;
        if (data[idx] === 0) break;
        keep[idx] = 1;
    }
}

function inInterior(job, worldX, worldY, worldZ) {
    return worldX >= job.interiorX && worldX < job.interiorX + job.interiorSizeX &&
        worldY >= job.interiorY && worldY < job.interiorY + job.interiorSizeY &&
        worldZ >= job.interiorZ && worldZ < job.interiorZ + job.interiorSizeZ;
}

function decodeVolume(payload, job) {
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
                const worldX = payload.originX + lx;
                const worldY = payload.originY + ly;
                const worldZ = payload.originZ + lz;
                if (!inInterior(job, worldX, worldY, worldZ)) continue;
                if (type === 'water') {
                    const aboveId = ly + 1 < sizeY ? data[((ly + 1) * sizeZ + lz) * sizeX + lx] : 0;
                    if (palette[aboveId] !== 'water') waterPositions.push(worldX - job.renderBaseX, worldY, worldZ - job.renderBaseZ);
                    keep[idx] = 1;
                    continue;
                }
                if (!isExposed(data, palette, sizeX, sizeY, sizeZ, lx, ly, lz)) continue;
                keep[idx] = 1;
                if (type !== 'ladder') addRenderPosition(typeId, worldX - job.renderBaseX, worldY, worldZ - job.renderBaseZ);
                markIfSolid(data, keep, sizeX, sizeY, sizeZ, lx + 1, ly, lz);
                markIfSolid(data, keep, sizeX, sizeY, sizeZ, lx - 1, ly, lz);
                markIfSolid(data, keep, sizeX, sizeY, sizeZ, lx, ly + 1, lz);
                markIfSolid(data, keep, sizeX, sizeY, sizeZ, lx, ly - 1, lz);
                markIfSolid(data, keep, sizeX, sizeY, sizeZ, lx, ly, lz + 1);
                markIfSolid(data, keep, sizeX, sizeY, sizeZ, lx, ly, lz - 1);
                markSolidColumnBelow(data, keep, sizeX, sizeZ, lx, ly, lz);
            }
        }
    }

    let solidCount = 0;
    for (let idx = 0; idx < count; idx++) {
        const typeId = data[idx];
        if (typeId === 0 || keep[idx] === 0) continue;
        const ly = Math.floor(idx / (sizeX * sizeZ));
        const rem = idx - ly * sizeX * sizeZ;
        const lz = Math.floor(rem / sizeX);
        const lx = rem - lz * sizeX;
        if (inInterior(job, payload.originX + lx, payload.originY + ly, payload.originZ + lz)) solidCount++;
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
        const worldX = payload.originX + lx;
        const worldY = payload.originY + ly;
        const worldZ = payload.originZ + lz;
        if (!inInterior(job, worldX, worldY, worldZ)) continue;
        const p = out * 3;
        positions[p] = worldX;
        positions[p + 1] = worldY;
        positions[p + 2] = worldZ;
        typeIds[out] = typeId;
        out++;
    }

    const packedRenderGroups = [];
    for (const [typeId, values] of renderGroups) {
        packedRenderGroups.push({ typeId, positions: new Int16Array(values) });
    }

    return { positions: positions.slice(0, out * 3), typeIds: typeIds.slice(0, out), palette, renderGroups: packedRenderGroups, waterPositions: new Int16Array(waterPositions) };
}

self.onmessage = async (event) => {
    const job = event.data;
    try {
        const response = await fetch(job.url, { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`);
        const decoded = decodeVolume(payload, job);
        const transfers = [decoded.positions.buffer, decoded.typeIds.buffer, decoded.waterPositions.buffer];
        for (const group of decoded.renderGroups) transfers.push(group.positions.buffer);
        self.postMessage({ id: job.id, chunkX: job.chunkX, chunkZ: job.chunkZ, volumeY: job.volumeY, ...decoded }, transfers);
    } catch (error) {
        self.postMessage({ id: job.id, chunkX: job.chunkX, chunkZ: job.chunkZ, error: error.message || String(error) });
    }
};
