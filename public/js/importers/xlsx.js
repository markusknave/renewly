// XLSX reader: unzip the OOXML package with DecompressionStream and read the
// first worksheet into a table. No third-party dependency and no network.

import {
	MAX_INFLATED_BYTES,
	MAX_ZIP_ENTRIES,
	MAX_ZIP_ENTRY_BYTES,
	readLimitedStream,
} from './limits.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');

function readUint16(bytes, offset) {
	return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes, offset) {
	return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

async function inflateRaw(bytes) {
	if (typeof DecompressionStream === 'undefined') {
		throw new Error('This browser cannot decompress .xlsx files.');
	}
	const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	return readLimitedStream(stream, MAX_INFLATED_BYTES, 'The ZIP member');
}

export async function readZip(bytes) {
	const files = new Map();
	let eocd = -1;
	const minimum = Math.max(0, bytes.length - 65_557);
	for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
		if (readUint32(bytes, offset) === 0x06054b50) {
			eocd = offset;
			break;
		}
	}
	if (eocd < 0) throw new Error('The file is not a ZIP or XLSX package.');
	const count = readUint16(bytes, eocd + 10);
	if (count > MAX_ZIP_ENTRIES) throw new Error(`The ZIP package has more than ${MAX_ZIP_ENTRIES} entries.`);
	let pointer = readUint32(bytes, eocd + 16);
	let inflatedTotal = 0;

	for (let index = 0; index < count; index += 1) {
		if (readUint32(bytes, pointer) !== 0x02014b50) break;
		const method = readUint16(bytes, pointer + 10);
		const compressedSize = readUint32(bytes, pointer + 20);
		const nameLength = readUint16(bytes, pointer + 28);
		const extraLength = readUint16(bytes, pointer + 30);
		const commentLength = readUint16(bytes, pointer + 32);
		const localOffset = readUint32(bytes, pointer + 42);
		if (compressedSize > MAX_ZIP_ENTRY_BYTES) throw new Error('A ZIP member is too large to import.');
		if (localOffset + 30 > bytes.length) throw new Error('The ZIP package has a truncated local header.');
		const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
		const localNameLength = readUint16(bytes, localOffset + 26);
		const localExtraLength = readUint16(bytes, localOffset + 28);
		const dataStart = localOffset + 30 + localNameLength + localExtraLength;
		if (dataStart + compressedSize > bytes.length) throw new Error('The ZIP package has a truncated member.');
		const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
		let member = compressed;
		if (method === 8) {
			member = await inflateRaw(compressed);
			inflatedTotal += member.byteLength;
			if (inflatedTotal > MAX_INFLATED_BYTES) {
				throw new Error(`The ZIP package expands beyond ${Math.round(MAX_INFLATED_BYTES / 1024 / 1024)} MB.`);
			}
		} else if (method === 0) {
			if (compressed.byteLength > MAX_INFLATED_BYTES) throw new Error('A ZIP member is too large to import.');
		} else {
			throw new Error('The ZIP package uses an unsupported compression method.');
		}
		files.set(name, member);
		pointer += 46 + nameLength + extraLength + commentLength;
	}
	return files;
}

function decodeXml(value) {
	return String(value ?? '')
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&');
}

function textFromXml(xml) {
	const parts = [];
	const pattern = /<t[^>]*>([\s\S]*?)<\/t>/g;
	let match;
	while ((match = pattern.exec(xml))) parts.push(decodeXml(match[1]));
	return parts.join('');
}

function parseSharedStrings(xml) {
	if (!xml) return [];
	const strings = [];
	const pattern = /<si[\s\S]*?<\/si>/g;
	let match;
	while ((match = pattern.exec(xml))) strings.push(textFromXml(match[0]));
	return strings;
}

function columnIndex(reference) {
	const letters = String(reference || '').match(/^[A-Z]+/i)?.[0] || '';
	let value = 0;
	for (const letter of letters.toUpperCase()) value = value * 26 + (letter.charCodeAt(0) - 64);
	return value - 1;
}

function parseSheet(xml, sharedStrings) {
	const rows = [];
	const rowPattern = /<row[^>]*>([\s\S]*?)<\/row>/g;
	let rowMatch;
	while ((rowMatch = rowPattern.exec(xml))) {
		const row = [];
		const cellPattern = /<c([^>]*)>([\s\S]*?)<\/c>/g;
		let cellMatch;
		while ((cellMatch = cellPattern.exec(rowMatch[1]))) {
			const attributes = cellMatch[1];
			const body = cellMatch[2];
			const reference = attributes.match(/\br="([A-Z]+\d+)"/i)?.[1] || '';
			const type = attributes.match(/\bt="([^"]+)"/i)?.[1] || '';
			const index = columnIndex(reference);
			let value = '';
			if (type === 'inlineStr') {
				value = textFromXml(body);
			} else {
				const raw = body.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? '';
				if (type === 's') {
					value = sharedStrings[Number(raw)] ?? '';
				} else if (type === 'b') {
					value = raw === '1';
				} else if (type === 'str') {
					value = decodeXml(raw);
				} else {
					const number = Number(raw);
					value = Number.isFinite(number) ? number : decodeXml(raw);
				}
			}
			while (row.length < index) row.push('');
			row[index] = value;
		}
		rows.push(row);
	}
	return rows;
}

function resolveSheetPath(files, workbookXml, relsXml) {
	const sheet = workbookXml.match(/<sheet\b[^>]*>/i)?.[0] || '';
	const relId = sheet.match(/\br:id="([^"]+)"/i)?.[1];
	if (relId && relsXml) {
		const relationships = [...relsXml.matchAll(/<Relationship\b[^>]*>/gi)].map((match) => match[0]);
		const relationship = relationships.find((row) => row.match(/\bId="([^"]+)"/i)?.[1] === relId);
		const target = relationship?.match(/\bTarget="([^"]+)"/i)?.[1];
		if (target) {
			const normalized = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
			const path = normalized.replace(/\/\.\//g, '/').replace(/[^/]+\/\.\.\//g, '');
			if (files.has(path)) return path;
		}
	}
	return files.has('xl/worksheets/sheet1.xml') ? 'xl/worksheets/sheet1.xml' : [...files.keys()].find((name) => name.startsWith('xl/worksheets/'));
}

export async function readXlsx(bytes) {
	const files = await readZip(bytes);
	const sharedStrings = parseSharedStrings(
		files.has('xl/sharedStrings.xml') ? decoder.decode(files.get('xl/sharedStrings.xml')) : ''
	);
	const workbookXml = files.has('xl/workbook.xml') ? decoder.decode(files.get('xl/workbook.xml')) : '';
	const relsXml = files.has('xl/_rels/workbook.xml.rels')
		? decoder.decode(files.get('xl/_rels/workbook.xml.rels'))
		: '';
	const sheetPath = resolveSheetPath(files, workbookXml, relsXml);
	if (!sheetPath || !files.has(sheetPath)) throw new Error('The workbook has no readable worksheet.');
	return parseSheet(decoder.decode(files.get(sheetPath)), sharedStrings);
}

export { encoder };
