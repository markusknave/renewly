// Image metadata helpers for the offline receipt scanner. Phone photos are
// decoded by the browser, but reading the dimensions and EXIF orientation from
// the header lets the scanner ask for a downscaled bitmap directly instead of
// allocating the full 12–200 megapixel frame first.

const ORIENTATION_SWAPS_AXES = new Set([5, 6, 7, 8]);

function readUint16(bytes, offset, littleEndian) {
	if (offset < 0 || offset + 2 > bytes.length) return null;
	return littleEndian
		? bytes[offset] | (bytes[offset + 1] << 8)
		: (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes, offset, littleEndian) {
	if (offset < 0 || offset + 4 > bytes.length) return null;
	return littleEndian
		? (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
		: ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readExifOrientation(bytes, offset) {
	// APP1 payload starts with "Exif\0\0" and then a TIFF header.
	if (offset + 6 > bytes.length) return 1;
	if (
		bytes[offset] !== 0x45 ||
		bytes[offset + 1] !== 0x78 ||
		bytes[offset + 2] !== 0x69 ||
		bytes[offset + 3] !== 0x66
	) {
		return 1;
	}
	const tiff = offset + 6;
	if (tiff + 8 > bytes.length) return 1;
	const littleEndian = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
	const magic = readUint16(bytes, tiff + 2, littleEndian);
	const ifd = readUint32(bytes, tiff + 4, littleEndian);
	if (magic !== 42 || ifd === null) return 1;
	const start = tiff + ifd;
	const count = readUint16(bytes, start, littleEndian);
	if (count === null || count > 64) return 1;
	for (let index = 0; index < count; index += 1) {
		const entry = start + 2 + index * 12;
		const tag = readUint16(bytes, entry, littleEndian);
		if (tag === 0x0112) {
			const value = readUint16(bytes, entry + 8, littleEndian);
			return value && value >= 1 && value <= 8 ? value : 1;
		}
	}
	return 1;
}

function readJpegInfo(bytes) {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
	let offset = 2;
	let width = 0;
	let height = 0;
	let orientation = 1;
	while (offset + 4 <= bytes.length) {
		if (bytes[offset] !== 0xff) {
			offset += 1;
			continue;
		}
		const marker = bytes[offset + 1];
		if (marker === 0xff) {
			offset += 1;
			continue;
		}
		if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
			offset += 2;
			continue;
		}
		if (marker === 0xd9 || marker === 0xda) break;
		const length = readUint16(bytes, offset + 2, false);
		if (length === null || length < 2) break;
		const end = offset + 2 + length;
		if (end > bytes.length) break;
		if (
			marker >= 0xc0 &&
			marker <= 0xcf &&
			marker !== 0xc4 &&
			marker !== 0xc8 &&
			marker !== 0xcc
		) {
			height = readUint16(bytes, offset + 5, false) || 0;
			width = readUint16(bytes, offset + 7, false) || 0;
		} else if (marker === 0xe1) {
			orientation = readExifOrientation(bytes, offset + 4);
		}
		if (width && height) break;
		offset = end;
	}
	if (!width || !height) return null;
	return { width, height, orientation, format: 'jpeg' };
}

function readPngInfo(bytes) {
	const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)) return null;
	const width = readUint32(bytes, 16, false);
	const height = readUint32(bytes, 20, false);
	if (!width || !height) return null;
	return { width, height, orientation: 1, format: 'png' };
}

function readWebpInfo(bytes) {
	if (bytes.length < 30) return null;
	const tag = (offset) => String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
	if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return null;
	const kind = tag(12);
	if (kind === 'VP8X') {
		const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
		const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
		return width && height ? { width, height, orientation: 1, format: 'webp' } : null;
	}
	if (kind === 'VP8 ') {
		const width = readUint16(bytes, 26, true);
		const height = readUint16(bytes, 28, true);
		if (!width || !height) return null;
		return { width: width & 0x3fff, height: height & 0x3fff, orientation: 1, format: 'webp' };
	}
	if (kind === 'VP8L') {
		const bits = readUint32(bytes, 21, true);
		if (bits === null) return null;
		return {
			width: (bits & 0x3fff) + 1,
			height: ((bits >>> 14) & 0x3fff) + 1,
			orientation: 1,
			format: 'webp',
		};
	}
	return null;
}

export function readImageInfo(bytes) {
	if (!bytes || typeof bytes.length !== 'number') return null;
	try {
		return readJpegInfo(bytes) || readPngInfo(bytes) || readWebpInfo(bytes);
	} catch {
		return null;
	}
}

export function orientedDimensions(width, height, orientation = 1) {
	if (!(width > 0) || !(height > 0)) return null;
	return ORIENTATION_SWAPS_AXES.has(Number(orientation))
		? { width: height, height: width }
		: { width, height };
}

export function fitDimensions(width, height, maxEdge, orientation = 1) {
	const oriented = orientedDimensions(width, height, orientation);
	if (!oriented || !(maxEdge > 0)) return null;
	const scale = Math.min(1, maxEdge / Math.max(oriented.width, oriented.height));
	return {
		width: Math.max(1, Math.round(oriented.width * scale)),
		height: Math.max(1, Math.round(oriented.height * scale)),
		scale,
	};
}
