// Minimal CSV/TSV parser with quoted fields and delimiter detection.

function detectDelimiter(text) {
	const sample = text.split(/\r?\n/).slice(0, 6).join('\n');
	const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
	let quoted = false;
	for (const char of sample) {
		if (char === '"') quoted = !quoted;
		else if (!quoted && char in counts) counts[char] += 1;
	}
	return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';
}

export function parseCsv(text) {
	const source = String(text || '').replace(/^\uFEFF/, '');
	const delimiter = detectDelimiter(source);
	const rows = [];
	let row = [];
	let field = '';
	let quoted = false;

	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		if (quoted) {
			if (char === '"') {
				if (source[index + 1] === '"') {
					field += '"';
					index += 1;
				} else {
					quoted = false;
				}
			} else {
				field += char;
			}
			continue;
		}
		if (char === '"') {
			quoted = true;
		} else if (char === delimiter) {
			row.push(field);
			field = '';
		} else if (char === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else if (char === '\r') {
			if (source[index + 1] !== '\n') {
				row.push(field);
				rows.push(row);
				row = [];
				field = '';
			}
		} else {
			field += char;
		}
	}
	if (field || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((line) => line.some((value) => String(value).trim() !== ''));
}

export function readCsv(bytes) {
	const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
	return parseCsv(text);
}
