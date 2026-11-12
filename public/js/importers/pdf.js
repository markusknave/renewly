// Text-PDF reader. Extracts selectable text from simple statement PDFs by
// inflating content streams and reading the text operators. Scanned/image-only
// PDFs have no text layer and are rejected with a clear message.

import {
	MAX_PDF_STREAM_BYTES,
	MAX_PDF_STREAMS,
	MAX_PDF_TEXT_BYTES,
	readLimitedStream,
} from './limits.js';

const latin1 = new TextDecoder('latin1');

async function inflate(bytes, format) {
	if (typeof DecompressionStream === 'undefined') return null;
	try {
		const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
		return readLimitedStream(stream, MAX_PDF_STREAM_BYTES, 'The PDF stream');
	} catch {
		return null;
	}
}

function ascii85Decode(text) {
	const source = text.replace(/\s+/g, '').replace(/^<~/, '').replace(/~>$/, '');
	const output = [];
	let group = [];
	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		if (char === 'z' && group.length === 0) {
			output.push(0, 0, 0, 0);
			continue;
		}
		const code = char.charCodeAt(0) - 33;
		if (code < 0 || code > 84) continue;
		group.push(code);
		if (group.length === 5) {
			let value = 0;
			for (const digit of group) value = value * 85 + digit;
			output.push((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
			group = [];
		}
	}
	if (group.length) {
		const missing = 5 - group.length;
		for (let index = 0; index < missing; index += 1) group.push(84);
		let value = 0;
		for (const digit of group) value = value * 85 + digit;
		const bytes = [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
		output.push(...bytes.slice(0, 4 - missing));
	}
	return new Uint8Array(output);
}

function decodeLiteralString(content, start) {
	let index = start + 1;
	let depth = 1;
	let value = '';
	while (index < content.length) {
		const char = content[index];
		if (char === '\\') {
			const next = content[index + 1];
			index += 2;
			if (next === 'n') value += '\n';
			else if (next === 'r') value += '\r';
			else if (next === 't') value += '\t';
			else if (next === 'b') value += '\b';
			else if (next === 'f') value += '\f';
			else if (next === '(' || next === ')' || next === '\\') value += next;
			else if (next === '\n') {
				/* line continuation */
			} else if (next === '\r') {
				if (content[index] === '\n') index += 1;
			} else if (/[0-7]/.test(next)) {
				let octal = next;
				for (let count = 0; count < 2 && /[0-7]/.test(content[index]); count += 1) {
					octal += content[index];
					index += 1;
				}
				value += String.fromCharCode(parseInt(octal, 8));
			} else {
				value += next;
			}
			continue;
		}
		if (char === '(') {
			depth += 1;
			value += char;
			index += 1;
			continue;
		}
		if (char === ')') {
			depth -= 1;
			index += 1;
			if (depth === 0) return { value, end: index };
			value += ')';
			continue;
		}
		value += char;
		index += 1;
	}
	return { value, end: index };
}

function decodeHexString(content, start) {
	let index = start + 1;
	let hex = '';
	while (index < content.length && content[index] !== '>') {
		if (/[0-9a-f]/i.test(content[index])) hex += content[index];
		index += 1;
	}
	if (hex.length % 2) hex += '0';
	const bytes = new Uint8Array(hex.length / 2);
	for (let offset = 0; offset < bytes.length; offset += 1) {
		bytes[offset] = parseInt(hex.slice(offset * 2, offset * 2 + 2), 16);
	}
	index += 1;
	if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
		return { value: new TextDecoder('utf-16be').decode(bytes.subarray(2)), end: index };
	}
	return { value: latin1.decode(bytes), end: index };
}

function readNumber(content, start) {
	let index = start;
	let text = '';
	while (index < content.length && /[-+0-9.]/.test(content[index])) {
		text += content[index];
		index += 1;
	}
	return { value: Number(text), end: index };
}

function readName(content, start) {
	let index = start + 1;
	let text = '';
	while (index < content.length && !/[\s()<>[\]{}/%]/.test(content[index])) {
		text += content[index];
		index += 1;
	}
	return { value: text, end: index };
}

function readArray(content, start) {
	let index = start + 1;
	const values = [];
	while (index < content.length && content[index] !== ']') {
		const char = content[index];
		if (/\s/.test(char)) {
			index += 1;
		} else if (char === '(') {
			const result = decodeLiteralString(content, index);
			values.push(result.value);
			index = result.end;
		} else if (char === '<') {
			const result = decodeHexString(content, index);
			values.push(result.value);
			index = result.end;
		} else if (char === '/') {
			const result = readName(content, index);
			values.push(result.value);
			index = result.end;
		} else if (/[-+0-9.]/.test(char)) {
			const result = readNumber(content, index);
			values.push(result.value);
			index = result.end;
		} else {
			index += 1;
		}
	}
	return { value: values, end: index + 1 };
}

function arrayText(values) {
	if (!Array.isArray(values)) return String(values ?? '');
	let text = '';
	for (const value of values) {
		if (typeof value === 'string') text += value;
		else if (typeof value === 'number' && value < -120) text += ' ';
	}
	return text;
}

function parseContent(content) {
	const chunks = [];
	let index = 0;
	let x = 0;
	let y = 0;
	let leading = 12;
	let text = '';
	let operands = [];

	const flush = () => {
		if (text.trim()) chunks.push({ x, y, text: text.trim() });
		text = '';
	};

	while (index < content.length) {
		const char = content[index];
		if (/\s/.test(char)) {
			index += 1;
			continue;
		}
		if (char === '%') {
			while (index < content.length && content[index] !== '\n') index += 1;
			continue;
		}
		if (char === '(') {
			const result = decodeLiteralString(content, index);
			operands.push(result.value);
			index = result.end;
			continue;
		}
		if (char === '<' && content[index + 1] !== '<') {
			const result = decodeHexString(content, index);
			operands.push(result.value);
			index = result.end;
			continue;
		}
		if (char === '[') {
			const result = readArray(content, index);
			operands.push(result.value);
			index = result.end;
			continue;
		}
		if (char === '/') {
			const result = readName(content, index);
			operands.push(result.value);
			index = result.end;
			continue;
		}
		if (char === '+' || char === '-' || char === '.' || (char >= '0' && char <= '9')) {
			const result = readNumber(content, index);
			operands.push(result.value);
			index = result.end;
			continue;
		}
		if (char === ']' || char === '>' || char === ')' || char === '{' || char === '}') {
			index += 1;
			continue;
		}
		const start = index;
		while (
			index < content.length
			&& !/[\s()<>[\]{}/%]/.test(content[index])
		) {
			index += 1;
		}
		const operator = content.slice(start, index);
		if (!operator) {
			index += 1;
			continue;
		}
		const number = (offset) => {
			const value = operands[operands.length - offset];
			return typeof value === 'number' ? value : 0;
		};
		if (operator === 'BT') {
			x = 0;
			y = 0;
			text = '';
		} else if (operator === 'ET') {
			flush();
		} else if (operator === 'Td') {
			x += number(2);
			y += number(1);
		} else if (operator === 'TD') {
			x += number(2);
			y += number(1);
			leading = -number(1);
		} else if (operator === 'Tm') {
			x = number(2);
			y = number(1);
		} else if (operator === 'T*') {
			y -= leading;
		} else if (operator === 'Tj') {
			text += String(operands[operands.length - 1] ?? '');
			flush();
		} else if (operator === 'TJ') {
			text += arrayText(operands[operands.length - 1]);
			flush();
		} else if (operator === "'") {
			y -= leading;
			text += String(operands[operands.length - 1] ?? '');
			flush();
		} else if (operator === '"') {
			y -= leading;
			text += String(operands[operands.length - 1] ?? '');
			flush();
		}
		operands = [];
	}
	flush();
	return chunks;
}

function groupLines(chunks) {
	const lines = [];
	for (const chunk of chunks) {
		let line = lines.find((candidate) => Math.abs(candidate.y - chunk.y) <= 2.5);
		if (!line) {
			line = { y: chunk.y, chunks: [] };
			lines.push(line);
		}
		line.chunks.push(chunk);
	}
	return lines
		.sort((a, b) => b.y - a.y)
		.map((line) =>
			line.chunks
				.sort((a, b) => a.x - b.x)
				.map((chunk) => chunk.text)
				.join(' ')
				.replace(/\s+/g, ' ')
				.trim()
		)
		.filter(Boolean);
}

async function decodeStream(dictionary, bytes) {
	if (/\/Subtype\s*\/Image/i.test(dictionary)) return '';
	let data = bytes;
	if (/ASCII85Decode/i.test(dictionary)) data = ascii85Decode(latin1.decode(data));
	if (/FlateDecode/i.test(dictionary)) {
		data = (await inflate(data, 'deflate')) || (await inflate(data, 'deflate-raw')) || data;
	}
	if (/LZWDecode/i.test(dictionary)) return '';
	return latin1.decode(data);
}

export async function extractPdfText(bytes) {
	const raw = latin1.decode(bytes);
	const lines = [];
	let position = 0;
	let streams = 0;
	let textBytes = 0;
	while (position < raw.length) {
		const start = raw.indexOf('stream', position);
		if (start < 0) break;
		if (raw.slice(Math.max(0, start - 3), start) === 'end') {
			position = start + 6;
			continue;
		}
		streams += 1;
		if (streams > MAX_PDF_STREAMS) throw new Error('The PDF has too many content streams.');
		const dictionaryStart = raw.lastIndexOf('<<', start);
		const dictionary = dictionaryStart >= 0 ? raw.slice(dictionaryStart, start) : '';
		let dataStart = start + 6;
		if (raw[dataStart] === '\r') dataStart += 1;
		if (raw[dataStart] === '\n') dataStart += 1;
		const lengthMatch = dictionary.match(/\/Length\s+(\d+)/);
		let dataEnd = lengthMatch
			? dataStart + Number(lengthMatch[1])
			: raw.indexOf('endstream', dataStart);
		if (dataEnd < dataStart) dataEnd = raw.indexOf('endstream', dataStart);
		if (dataEnd < dataStart) break;
		const data = bytes.subarray(dataStart, dataEnd);
		const content = await decodeStream(dictionary, data);
		if (content && (content.includes('Tj') || content.includes('TJ'))) {
			textBytes += content.length;
			if (textBytes > MAX_PDF_TEXT_BYTES) throw new Error('The PDF contains too much text.');
			lines.push(...groupLines(parseContent(content)));
		}
		position = Math.min(raw.length, dataEnd + 9);
	}
	if (!lines.length) {
		throw new Error('No selectable text found. Scanned PDFs need OCR first; export CSV or XLSX instead.');
	}
	return lines;
}
