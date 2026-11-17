import { describe, expect, test } from 'vitest';
import {
	fitDimensions,
	orientedDimensions,
	readImageInfo,
} from '../public/js/lib/image.js';

function bytes(...parts) {
	return new Uint8Array(parts.flat());
}

function exifApp1(orientation) {
	const tiff = [
		0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
		0x01, 0x00,
		0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,
		orientation & 0xff, (orientation >> 8) & 0xff, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00,
	];
	const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
	const length = payload.length + 2;
	return [0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...payload];
}

function jpeg({ width = 4032, height = 3024, orientation = 1 } = {}) {
	const sof = [
		0xff, 0xc0, 0x00, 0x11, 0x08,
		(height >> 8) & 0xff, height & 0xff,
		(width >> 8) & 0xff, width & 0xff,
		0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
	];
	return bytes([0xff, 0xd8], exifApp1(orientation), sof, [0xff, 0xd9]);
}

test('reads JPEG dimensions and EXIF rotation from the header', () => {
	expect(readImageInfo(jpeg())).toEqual({
		width: 4032,
		height: 3024,
		orientation: 1,
		format: 'jpeg',
	});
	expect(readImageInfo(jpeg({ orientation: 6 }))).toEqual({
		width: 4032,
		height: 3024,
		orientation: 6,
		format: 'jpeg',
	});
});

test('ignores malformed and truncated headers', () => {
	expect(readImageInfo(null)).toBeNull();
	expect(readImageInfo(new Uint8Array())).toBeNull();
	expect(readImageInfo(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x40]))).toBeNull();
	expect(readImageInfo(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
});

test('reads PNG dimensions', () => {
	const png = new Uint8Array(24);
	png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	png.set([0x00, 0x00, 0x00, 0x0d], 8);
	png.set([0x49, 0x48, 0x44, 0x52], 12);
	png.set([0x00, 0x00, 0x0a, 0xf0], 16);
	png.set([0x00, 0x00, 0x0b, 0xb8], 20);
	expect(readImageInfo(png)).toEqual({
		width: 2800,
		height: 3000,
		orientation: 1,
		format: 'png',
	});
});

test('reads WebP VP8X dimensions', () => {
	const webp = new Uint8Array(30);
	webp.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
	webp.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
	webp.set([0x56, 0x50, 0x38, 0x58], 12); // VP8X
	webp.set([0x0a, 0x00, 0x00, 0x00], 16);
	webp.set([0x00, 0x00, 0x00, 0x00], 20);
	const width = 2591;
	const height = 1935;
	webp.set([(width - 1) & 0xff, ((width - 1) >> 8) & 0xff, ((width - 1) >> 16) & 0xff], 24);
	webp.set([(height - 1) & 0xff, ((height - 1) >> 8) & 0xff, ((height - 1) >> 16) & 0xff], 27);
	expect(readImageInfo(webp)).toEqual({
		width,
		height,
		orientation: 1,
		format: 'webp',
	});
});

test('orientedDimensions swaps axes for EXIF rotations', () => {
	expect(orientedDimensions(4032, 3024, 1)).toEqual({ width: 4032, height: 3024 });
	expect(orientedDimensions(4032, 3024, 6)).toEqual({ width: 3024, height: 4032 });
	expect(orientedDimensions(4032, 3024, 8)).toEqual({ width: 3024, height: 4032 });
	expect(orientedDimensions(0, 3024)).toBeNull();
});

test('fitDimensions scales the long oriented edge and keeps small photos untouched', () => {
	expect(fitDimensions(4032, 3024, 2400)).toEqual({
		width: 2400,
		height: 1800,
		scale: 2400 / 4032,
	});
	expect(fitDimensions(4032, 3024, 2400, 6)).toEqual({
		width: 1800,
		height: 2400,
		scale: 2400 / 4032,
	});
	expect(fitDimensions(800, 600, 2400)).toEqual({
		width: 800,
		height: 600,
		scale: 1,
	});
	expect(fitDimensions(0, 600, 2400)).toBeNull();
	expect(fitDimensions(800, 600, 0)).toBeNull();
});

describe('jpeg orientation values outside EXIF range', () => {
	test('fall back to upright', () => {
		expect(readImageInfo(jpeg({ orientation: 0 }))?.orientation).toBe(1);
		expect(readImageInfo(jpeg({ orientation: 9 }))?.orientation).toBe(1);
	});
});
