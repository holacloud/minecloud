// A PNG writer and reader by hand (zlib and a CRC table), with no dependencies, for the tools that make the
// guide's pictures once: tools/guideBuildPictures.js (the buildings of /build) and tools/guideLandscape.js
// (the landscape behind the guide's web pages). Same pixels in, same bytes out with one same Node (the bytes
// depend on the zlib that Node carries, so the tests compare pixels).
//
// pngEncode writes 8 bits a channel: indexed (with transparency) when 256 colours are enough, else RGBA; with
// { opaque: true } a picture of many colours is written as plain RGB, no alpha channel at all.

const zlib = require('node:zlib');

const PNG_CRC = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

function pngCrc(bytes) {
    let c = -1;
    for (let i = 0; i < bytes.length; i++) c = PNG_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(pngCrc(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
}

// The rows with a filter each (the one whose bytes add up least, as most encoders choose).
function pngFilter(raw, width, height, bpp) {
    const stride = width * bpp;
    const out = Buffer.alloc(height * (stride + 1));
    const trial = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
    const paeth = (a, b, c) => {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    };
    for (let y = 0; y < height; y++) {
        const row = y * stride;
        let best = 0;
        let bestSum = Infinity;
        for (let f = 0; f < 5; f++) {
            const t = trial[f];
            let sum = 0;
            for (let i = 0; i < stride; i++) {
                const x = raw[row + i];
                const a = i >= bpp ? raw[row + i - bpp] : 0;
                const b = y > 0 ? raw[row - stride + i] : 0;
                const c = i >= bpp && y > 0 ? raw[row - stride + i - bpp] : 0;
                const p = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
                const value = (x - p) & 0xFF;
                t[i] = value;
                sum += value < 128 ? value : 256 - value;
            }
            if (sum < bestSum) { bestSum = sum; best = f; }
        }
        out[y * (stride + 1)] = best;
        trial[best].copy(out, y * (stride + 1) + 1);
    }
    return out;
}

// RGBA pixels to the bytes of a PNG file: indexed if there are 256 colours or fewer, else RGBA, or RGB when
// `opaque` says the alpha is to be left out.
function pngEncode(width, height, rgba, { opaque = false } = {}) {
    const colours = new Map();
    for (let i = 0; i < width * height && colours.size <= 256; i++) {
        const o = i * 4;
        const value = rgba[o + 3] === 0 ? 0 : ((rgba[o] << 24) | (rgba[o + 1] << 16) | (rgba[o + 2] << 8) | rgba[o + 3]) >>> 0;
        if (!colours.has(value)) colours.set(value, colours.size);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const chunks = [];
    let raw, bpp;
    if (colours.size <= 256) {
        // Transparent first, then by first appearance: tRNS can stop at the last colour that is not opaque.
        const values = Array.from(colours.keys());
        ihdr[9] = 3;
        bpp = 1;
        raw = Buffer.alloc(width * height);
        for (let i = 0; i < width * height; i++) {
            const o = i * 4;
            const value = rgba[o + 3] === 0 ? 0 : ((rgba[o] << 24) | (rgba[o + 1] << 16) | (rgba[o + 2] << 8) | rgba[o + 3]) >>> 0;
            raw[i] = colours.get(value);
        }
        const plte = Buffer.alloc(values.length * 3);
        const alphas = Buffer.alloc(values.length);
        values.forEach((value, i) => {
            plte[i * 3] = value >>> 24; plte[i * 3 + 1] = (value >>> 16) & 0xFF; plte[i * 3 + 2] = (value >>> 8) & 0xFF;
            alphas[i] = value & 0xFF;
        });
        let last = alphas.length;
        while (last > 0 && alphas[last - 1] === 255) last--;
        chunks.push(pngChunk('PLTE', plte));
        if (last > 0) chunks.push(pngChunk('tRNS', alphas.subarray(0, last)));
    } else if (opaque) {
        ihdr[9] = 2;
        bpp = 3;
        raw = Buffer.alloc(width * height * 3);
        for (let i = 0; i < width * height; i++) {
            raw[i * 3] = rgba[i * 4]; raw[i * 3 + 1] = rgba[i * 4 + 1]; raw[i * 3 + 2] = rgba[i * 4 + 2];
        }
    } else {
        ihdr[9] = 6;
        bpp = 4;
        raw = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.length);
    }
    const data = zlib.deflateSync(pngFilter(raw, width, height, bpp), { level: 9, memLevel: 9, strategy: zlib.constants.Z_DEFAULT_STRATEGY });
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        pngChunk('IHDR', ihdr),
        ...chunks,
        pngChunk('IDAT', data),
        pngChunk('IEND', Buffer.alloc(0))
    ]);
}

// A PNG file back to { width, height, colourType, rgba }: for the tests and the tools' --ascii. It reads what
// pngEncode writes and what a browser's canvas gives (tools/guidePictures.js): 8 bits a channel, not
// interlaced, grey, grey with alpha, RGB, indexed or RGBA, any of the five row filters; anything else throws.
function pngDecode(bytes) {
    if (bytes.length < 8 || bytes.readUInt32BE(0) !== 0x89504E47 || bytes.readUInt32BE(4) !== 0x0D0A1A0A) throw new Error('Not a PNG');
    let offset = 8;
    let width = 0, height = 0, colourType = 0, plte = null, trns = null;
    const idat = [];
    while (offset < bytes.length) {
        const length = bytes.readUInt32BE(offset);
        const type = bytes.toString('ascii', offset + 4, offset + 8);
        const data = bytes.subarray(offset + 8, offset + 8 + length);
        if (pngCrc(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) throw new Error(`Bad CRC in ${type}`);
        if (type === 'IHDR') {
            width = data.readUInt32BE(0); height = data.readUInt32BE(4); colourType = data[9];
            if (data[8] !== 8 || data[12] !== 0 || ![0, 2, 3, 4, 6].includes(colourType)) {
                throw new Error(`Unsupported PNG: depth ${data[8]}, colour type ${colourType}, interlace ${data[12]}`);
            }
        }
        else if (type === 'PLTE') plte = data;
        else if (type === 'tRNS') trns = data;
        else if (type === 'IDAT') idat.push(data);
        offset += 12 + length;
    }
    if (!width || !height || !idat.length) throw new Error('PNG without size or data');
    const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colourType];
    const stride = width * bpp;
    const filtered = zlib.inflateSync(Buffer.concat(idat));
    const raw = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
        const f = filtered[y * (stride + 1)];
        for (let i = 0; i < stride; i++) {
            const x = filtered[y * (stride + 1) + 1 + i];
            const a = i >= bpp ? raw[y * stride + i - bpp] : 0;
            const b = y > 0 ? raw[(y - 1) * stride + i] : 0;
            const c = i >= bpp && y > 0 ? raw[(y - 1) * stride + i - bpp] : 0;
            let p = 0;
            if (f === 1) p = a;
            else if (f === 2) p = b;
            else if (f === 3) p = (a + b) >> 1;
            else if (f === 4) { const q = a + b - c; const pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
            raw[y * stride + i] = (x + p) & 0xFF;
        }
    }
    if (colourType === 6) return { width, height, colourType, rgba: new Uint8Array(raw) };
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        if (colourType === 2) {
            rgba[i * 4] = raw[i * 3]; rgba[i * 4 + 1] = raw[i * 3 + 1]; rgba[i * 4 + 2] = raw[i * 3 + 2]; rgba[i * 4 + 3] = 255;
            continue;
        }
        if (colourType === 0 || colourType === 4) {
            const grey = raw[i * bpp];
            rgba[i * 4] = grey; rgba[i * 4 + 1] = grey; rgba[i * 4 + 2] = grey; rgba[i * 4 + 3] = colourType === 4 ? raw[i * 2 + 1] : 255;
            continue;
        }
        const index = raw[i];
        rgba[i * 4] = plte[index * 3]; rgba[i * 4 + 1] = plte[index * 3 + 1]; rgba[i * 4 + 2] = plte[index * 3 + 2];
        rgba[i * 4 + 3] = trns && index < trns.length ? trns[index] : 255;
    }
    return { width, height, colourType, rgba };
}

module.exports = { pngEncode, pngDecode, pngCrc };
