// Offline OCR bridge for receipt photos. Tesseract and its English model are
// bundled under public/vendor/tesseract, so scanning never touches the network.
// The worker is created lazily and released after a short idle period to keep
// memory low on phones.

const ASSET_ROOT = new URL('../vendor/tesseract/', import.meta.url).href;
const IDLE_MS = 90_000;
const MAX_IMAGE_EDGE = 1800;

let libraryPromise = null;
let workerPromise = null;
let idleTimer = null;
let activeProgress = null;

function asset(path) {
	return new URL(path, ASSET_ROOT).href;
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
	if (idleTimer) {
		clearTimeout(idleTimer);
		idleTimer = null;
	}
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
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = setTimeout(() => {
		idleTimer = null;
		releaseWorker();
	}, IDLE_MS);
}

async function getWorker() {
	if (workerPromise) return workerPromise;
	const Tesseract = await loadLibrary();
	workerPromise = Tesseract.createWorker('eng', 1, {
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
	}).catch((error) => {
		workerPromise = null;
		throw error;
	});
	return workerPromise;
}

// Large phone photos slow OCR without improving accuracy. Downscale in the
// browser; if canvas or createImageBitmap is unavailable, send the original.
async function prepareImage(file) {
	if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
	let bitmap;
	try {
		bitmap = await createImageBitmap(file);
		const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
		if (scale >= 1) {
			bitmap.close?.();
			return file;
		}
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));
		const context = canvas.getContext('2d');
		if (!context) {
			bitmap.close?.();
			return file;
		}
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		bitmap.close?.();
		const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
		return blob || file;
	} catch {
		bitmap?.close?.();
		return file;
	}
}

export async function recognizeImage(file, { onProgress } = {}) {
	if (!file) throw new Error('Choose a receipt photo first.');
	const worker = await getWorker();
	activeProgress = typeof onProgress === 'function' ? onProgress : null;
	try {
		const image = await prepareImage(file);
		const { data } = await worker.recognize(image);
		return {
			text: String(data?.text || ''),
			confidence: Number.isFinite(data?.confidence) ? data.confidence : null,
		};
	} finally {
		activeProgress = null;
		scheduleRelease();
	}
}

export async function terminateOcr() {
	await releaseWorker();
}
