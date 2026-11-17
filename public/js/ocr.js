// Offline OCR bridge for receipt photos. Tesseract and its English model are
// bundled under public/vendor/tesseract, so scanning never touches the network.
// The worker is created lazily and released after a short idle period to keep
// memory low on phones.

import { fitDimensions, readImageInfo } from './lib/image.js';

const ASSET_ROOT = new URL('../vendor/tesseract/', import.meta.url).href;
const IDLE_MS = 90_000;
const MAX_IMAGE_EDGE = 2400;
const HEADER_BYTES = 262_144;
const RECOGNIZE_TIMEOUT_MS = 60_000;

let libraryPromise = null;
let workerPromise = null;
let idleTimer = null;
let activeProgress = null;
let queue = Promise.resolve();
let pendingJobs = 0;

function asset(path) {
	return new URL(path, ASSET_ROOT).href;
}

function clearIdleTimer() {
	clearTimeout(idleTimer);
	idleTimer = null;
}

function loadLibrary() {
	if (globalThis.Tesseract?.createWorker) return Promise.resolve(globalThis.Tesseract);
	if (libraryPromise) return libraryPromise;
	libraryPromise = new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = asset('tesseract.min.js');
		script.async = true;
		script.dataset.tesseract = '1';
		script.onload = () => {
			if (globalThis.Tesseract?.createWorker) resolve(globalThis.Tesseract);
			else reject(new Error('The OCR engine loaded without its worker API.'));
		};
		script.onerror = () => {
			libraryPromise = null;
			script.remove();
			reject(new Error('Could not load the bundled OCR engine.'));
		};
		document.head.append(script);
	});
	return libraryPromise;
}

async function releaseWorker() {
	clearIdleTimer();
	activeProgress = null;
	const pending = workerPromise;
	workerPromise = null;
	if (!pending) return;
	try {
		const worker = await pending;
		await worker.terminate();
	} catch {
		// A worker that failed to start has nothing to release.
	}
}

function scheduleRelease() {
	if (pendingJobs > 0) return;
	clearIdleTimer();
	idleTimer = setTimeout(() => {
		idleTimer = null;
		releaseWorker();
	}, IDLE_MS);
}

async function getWorker() {
	clearIdleTimer();
	if (workerPromise) return workerPromise;
	const Tesseract = await loadLibrary();
	workerPromise = (async () => {
		const worker = await Tesseract.createWorker('eng', 1, {
			workerPath: asset('worker.min.js'),
			corePath: asset('tesseract-core-lstm.wasm.js'),
			langPath: new URL('lang/', ASSET_ROOT).href,
			workerBlobURL: false,
			logger: (message) => {
				if (activeProgress && message?.status) activeProgress(message);
			},
			errorHandler: (error) => {
				console.warn('Renewly OCR:', error);
			},
		});
		// A photographed receipt is not one uniform paragraph. Sparse text keeps
		// the shop name, the label column, and the right-aligned amounts instead
		// of dropping blocks outside the detected paragraph.
		await worker.setParameters({
			tessedit_pageseg_mode: String(Tesseract.PSM?.SPARSE_TEXT ?? '11'),
		});
		return worker;
	})().catch((error) => {
		workerPromise = null;
		throw error;
	});
	return workerPromise;
}

function withTimeout(promise, milliseconds, onTimeout) {
	let timer = null;
	return new Promise((resolve, reject) => {
		timer = setTimeout(() => {
			timer = null;
			try {
				onTimeout();
			} catch {
				// The timeout error below is the useful one.
			}
			reject(new Error('Reading the photo took too long. Try again with a smaller photo.'));
		}, milliseconds);
		promise.then(
			(value) => {
				clearTimeout(timer);
				timer = null;
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				timer = null;
				reject(error);
			}
		);
	});
}

async function readHeader(file) {
	if (typeof file?.slice !== 'function') return null;
	try {
		return readImageInfo(new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer()));
	} catch {
		return null;
	}
}

async function decodeBitmap(file, target) {
	if (typeof createImageBitmap !== 'function') throw new Error('Bitmap decoding is unavailable.');
	const resize = target && target.scale < 1
		? {
				resizeWidth: target.width,
				resizeHeight: target.height,
				resizeQuality: 'high',
			}
		: null;
	try {
		return await createImageBitmap(file, { imageOrientation: 'from-image', ...resize });
	} catch (error) {
		// Older engines reject option values they do not know. Retry in steps
		// until only the plain decoder is left, then surface the original error.
		if (resize) {
			try {
				return await createImageBitmap(file, resize);
			} catch {
				// Fall through to the orientation-only attempt.
			}
		}
		try {
			return await createImageBitmap(file, { imageOrientation: 'from-image' });
		} catch {
			return createImageBitmap(file);
		}
	}
}

function decodeElement(file) {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const image = new Image();
		image.decoding = 'async';
		image.onload = () => {
			URL.revokeObjectURL(url);
			resolve(image);
		};
		image.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('This photo could not be opened.'));
		};
		image.src = url;
	});
}

// Decode once, let the browser apply EXIF orientation, and prepare a JPEG at a
// resolution Tesseract can read. Asking createImageBitmap for the target size
// keeps a 12–200 megapixel camera frame from being materialised at full size.
async function prepareImage(file) {
	const info = await readHeader(file);
	const target = info
		? fitDimensions(info.width, info.height, MAX_IMAGE_EDGE, info.orientation)
		: null;
	let source;
	try {
		source = await decodeBitmap(file, target);
	} catch {
		if (typeof document === 'undefined' || typeof Image !== 'function') {
			throw new Error('This photo could not be opened. Try a JPEG or PNG image.');
		}
		try {
			source = await decodeElement(file);
		} catch {
			throw new Error('This photo could not be opened. Try a JPEG or PNG image.');
		}
	}
	const sourceWidth = source.width || source.naturalWidth || 0;
	const sourceHeight = source.height || source.naturalHeight || 0;
	if (!sourceWidth || !sourceHeight) {
		source.close?.();
		throw new Error('This photo could not be opened. Try a JPEG or PNG image.');
	}
	const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight));
	if (info?.format === 'jpeg' && info.orientation === 1 && scale >= 1) {
		// A small upright JPEG is already the format the engine wants; skip the
		// recompression so fine print keeps its edges.
		source.close?.();
		return file;
	}
	const output = document.createElement('canvas');
	output.width = Math.max(1, Math.round(sourceWidth * scale));
	output.height = Math.max(1, Math.round(sourceHeight * scale));
	const context = output.getContext('2d');
	if (!context) {
		source.close?.();
		throw new Error('This photo could not be prepared for reading.');
	}
	context.fillStyle = '#ffffff';
	context.fillRect(0, 0, output.width, output.height);
	context.imageSmoothingEnabled = true;
	context.imageSmoothingQuality = 'high';
	context.drawImage(source, 0, 0, output.width, output.height);
	source.close?.();
	const blob = await new Promise((resolve) => output.toBlob(resolve, 'image/jpeg', 0.92));
	if (!blob) throw new Error('This photo could not be prepared for reading.');
	return blob;
}

async function runRecognition(file, onProgress) {
	const worker = await getWorker();
	activeProgress = typeof onProgress === 'function' ? onProgress : null;
	try {
		const image = await prepareImage(file);
		let result;
		try {
			result = await withTimeout(worker.recognize(image), RECOGNIZE_TIMEOUT_MS, () => {
				// The engine cannot cancel a single job. Terminate it so the next
				// scan starts from a clean worker instead of hanging forever.
				releaseWorker();
			});
		} catch (error) {
			if (/attempting to read image/i.test(String(error?.message || ''))) {
				throw new Error('The photo format is not supported. Try a JPEG or PNG photo.');
			}
			throw error;
		}
		const { data } = result;
		return {
			text: String(data?.text || ''),
			confidence: Number.isFinite(data?.confidence) ? data.confidence : null,
		};
	} finally {
		activeProgress = null;
	}
}

export function recognizeImage(file, { onProgress } = {}) {
	if (!file) return Promise.reject(new Error('Choose a receipt photo first.'));
	pendingJobs += 1;
	clearIdleTimer();
	const run = () => runRecognition(file, onProgress);
	const result = queue.then(run, run);
	queue = result.catch(() => {});
	return result.finally(() => {
		pendingJobs = Math.max(0, pendingJobs - 1);
		if (pendingJobs === 0) scheduleRelease();
	});
}

export async function terminateOcr() {
	await releaseWorker();
}
