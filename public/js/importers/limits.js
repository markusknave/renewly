// Hard limits for untrusted import files. These keep a crafted statement from
// exhausting memory or wedging the main thread while the preview is built.

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
export const MAX_INFLATED_BYTES = 64 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 4096;
export const MAX_ZIP_ENTRY_BYTES = 64 * 1024 * 1024;
export const MAX_PDF_STREAM_BYTES = 8 * 1024 * 1024;
export const MAX_PDF_STREAMS = 256;
export const MAX_PDF_TEXT_BYTES = 8 * 1024 * 1024;

export async function readLimitedStream(stream, limit, label = 'The file') {
	const reader = stream.getReader();
	const chunks = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > limit) {
				await reader.cancel().catch(() => {});
				throw new Error(`${label} expands beyond ${Math.round(limit / 1024 / 1024)} MB.`);
			}
			chunks.push(value);
		}
	} finally {
		try {
			reader.releaseLock();
		} catch {
			// The reader is already released or cancelled.
		}
	}
	const output = new Uint8Array(total);
	let cursor = 0;
	for (const chunk of chunks) {
		output.set(chunk, cursor);
		cursor += chunk.byteLength;
	}
	return output;
}
