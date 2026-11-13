// Minimal read-only SQLite reader plus Realbyte Money Manager `.mmbak` mapping.
// A .mmbak is a ZIP-wrapped (or plain) SQLite database; this reads the
// ZINOUTCOME/INOUTCOME rows and resolves categories and accounts by UID.

import { readZip } from './xlsx.js';
import { detectCategory, INCOME_CATEGORY } from '../lib/categories.js';
import { matchMethod, missingMethodLabel, parseAnyDate, parseMoney, mapCategory, duplicateKey } from './table.js';

const textDecoder = new TextDecoder('utf-8');
const utf16le = new TextDecoder('utf-16le');
const utf16be = new TextDecoder('utf-16be');

function readVarint(bytes, offset) {
	let value = 0;
	for (let index = 0; index < 9; index += 1) {
		const byte = bytes[offset + index];
		if (byte === undefined) return { value, length: index };
		if (index === 8) return { value: value * 256 + byte, length: 9 };
		value = value * 128 + (byte & 0x7f);
		if (!(byte & 0x80)) return { value, length: index + 1 };
	}
	return { value, length: 9 };
}

function readUint16BE(bytes, offset) {
	return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes, offset) {
	return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readIntBE(bytes, offset, length) {
	let value = 0;
	for (let index = 0; index < length; index += 1) value = value * 256 + bytes[offset + index];
	const limit = 2 ** (length * 8 - 1);
	return value >= limit ? value - 2 ** (length * 8) : value;
}

function decodeText(bytes, encoding) {
	if (encoding === 2) return utf16le.decode(bytes);
	if (encoding === 3) return utf16be.decode(bytes);
	return textDecoder.decode(bytes);
}

function parseRecord(payload, encoding) {
	const header = readVarint(payload, 0);
	if (header.length === 0 || header.value < header.length || header.value > payload.length) return [];
	let position = header.length;
	const types = [];
	while (position < header.value && types.length < 2048) {
		const serial = readVarint(payload, position);
		if (serial.length === 0) break;
		types.push(serial.value);
		position += serial.length;
	}
	let data = header.value;
	const values = [];
	for (const type of types) {
		if (type === 0 || type === 10 || type === 11) {
			values.push(null);
		} else if (type >= 1 && type <= 6) {
			const length = [0, 1, 2, 3, 4, 6, 8][type];
			if (data + length > payload.length) break;
			values.push(readIntBE(payload, data, length));
			data += length;
		} else if (type === 7) {
			if (data + 8 > payload.length) break;
			const view = new DataView(payload.buffer, payload.byteOffset + data, 8);
			values.push(view.getFloat64(0, false));
			data += 8;
		} else if (type === 8) {
			values.push(0);
		} else if (type === 9) {
			values.push(1);
		} else if (type >= 12 && type % 2 === 0) {
			const length = (type - 12) / 2;
			if (data + length > payload.length) break;
			values.push(payload.subarray(data, data + length));
			data += length;
		} else if (type >= 13) {
			const length = (type - 13) / 2;
			if (data + length > payload.length) break;
			values.push(decodeText(payload.subarray(data, data + length), encoding));
			data += length;
		} else {
			values.push(null);
		}
	}
	return values;
}

export function readSqliteTables(bytes) {
	const magic = textDecoder.decode(bytes.subarray(0, 16));
	if (magic !== 'SQLite format 3\u0000') throw new Error('The file is not a SQLite database.');
	if (bytes.length < 100) throw new Error('The SQLite database is truncated.');
	const pageSize = readUint16BE(bytes, 16) || 65_536;
	if (pageSize < 512 || pageSize > 65_536 || (pageSize & (pageSize - 1)) !== 0) {
		throw new Error('The SQLite database has an invalid page size.');
	}
	const reserved = bytes[20] || 0;
	const usable = pageSize - reserved;
	if (reserved >= pageSize || usable < 480) throw new Error('The SQLite database has an invalid page layout.');
	const encoding = readUint32BE(bytes, 56) || 1;
	const pageCache = new Map();
	const maxPages = Math.ceil(bytes.length / pageSize) + 1;

	const page = (pageNumber) => {
		if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > maxPages) {
			throw new Error('The SQLite database references a page outside the file.');
		}
		if (pageCache.has(pageNumber)) return pageCache.get(pageNumber);
		const start = (pageNumber - 1) * pageSize;
		const slice = bytes.subarray(start, start + pageSize);
		if (!slice.length) throw new Error('The SQLite database references an empty page.');
		pageCache.set(pageNumber, slice);
		return slice;
	};

	const readPayload = (pageBytes, pageNumber, offset, payloadLength) => {
		if (!Number.isFinite(payloadLength) || payloadLength < 0 || payloadLength > bytes.length) {
			throw new Error('The SQLite database has an invalid payload length.');
		}
		const maxLocal = usable - 35;
		const minLocal = Math.max(0, Math.floor(((usable - 12) * 32) / 255) - 23);
		let local = payloadLength;
		if (payloadLength > maxLocal) {
			local = minLocal + ((payloadLength - minLocal) % (usable - 4));
			if (local > maxLocal) local = minLocal;
		}
		if (offset + local > pageBytes.length) throw new Error('The SQLite payload is truncated.');
		const parts = [pageBytes.subarray(offset, offset + local)];
		let remaining = payloadLength - local;
		let nextPage = remaining > 0 ? readUint32BE(pageBytes, offset + local) : 0;
		const visited = new Set();
		while (remaining > 0 && nextPage) {
			if (visited.has(nextPage) || visited.size > maxPages) {
				throw new Error('The SQLite overflow chain is cyclic.');
			}
			visited.add(nextPage);
			const overflow = page(nextPage);
			if (overflow.length < 4) throw new Error('The SQLite overflow page is truncated.');
			nextPage = readUint32BE(overflow, 0);
			const take = Math.min(remaining, usable - 4);
			parts.push(overflow.subarray(4, 4 + take));
			remaining -= take;
		}
		if (remaining > 0) throw new Error('The SQLite overflow chain is truncated.');
		const total = parts.reduce((sum, part) => sum + part.length, 0);
		const payload = new Uint8Array(total);
		let cursor = 0;
		for (const part of parts) {
			payload.set(part, cursor);
			cursor += part.length;
		}
		return payload;
	};

	const walk = (rootPage, output, visited = new Set()) => {
		if (!rootPage || visited.has(rootPage) || visited.size > maxPages) return;
		visited.add(rootPage);
		const pageBytes = page(rootPage);
		const headerOffset = rootPage === 1 ? 100 : 0;
		const type = pageBytes[headerOffset];
		if (type === 0x0d) {
			const cellCount = Math.min(readUint16BE(pageBytes, headerOffset + 3), 4096);
			for (let index = 0; index < cellCount; index += 1) {
				const pointer = readUint16BE(pageBytes, headerOffset + 8 + index * 2);
				if (pointer >= pageBytes.length) break;
				const length = readVarint(pageBytes, pointer);
				if (length.length === 0 || length.value > bytes.length) break;
				const rowid = readVarint(pageBytes, pointer + length.length);
				if (rowid.length === 0) break;
				const payloadOffset = pointer + length.length + rowid.length;
				if (payloadOffset >= pageBytes.length) break;
				const payload = readPayload(pageBytes, rootPage, payloadOffset, length.value);
				output.push({ values: parseRecord(payload, encoding), rowid: rowid.value });
				if (output.length >= 200_000) return;
			}
		} else if (type === 0x05) {
			const cellCount = Math.min(readUint16BE(pageBytes, headerOffset + 3), 4096);
			for (let index = 0; index < cellCount; index += 1) {
				const pointer = readUint16BE(pageBytes, headerOffset + 12 + index * 2);
				if (pointer >= pageBytes.length) break;
				const child = readUint32BE(pageBytes, pointer);
				walk(child, output, visited);
			}
			const right = readUint32BE(pageBytes, headerOffset + 8);
			walk(right, output, visited);
		}
	};

	const schemaRows = [];
	walk(1, schemaRows);
	const tables = new Map();
	for (const entry of schemaRows) {
		const [type, name, , rootPage, sql] = entry.values;
		if (type !== 'table' || !rootPage) continue;
		const columns = parseColumns(sql);
		const rows = [];
		walk(Number(rootPage), rows);
		const uidColumn = findColumn(columns, ['uid', 'UID', 'C_UID', '_id', 'id', 'ID', 'ZUID']);
		tables.set(String(name), {
			columns,
			rows: rows.map((row) => {
				const values = row.values;
				const object = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
				if (uidColumn && (object[uidColumn] === null || object[uidColumn] === undefined)) {
					object[uidColumn] = row.rowid;
				}
				return object;
			}),
		});
	}
	return tables;
}

function parseColumns(sql) {
	if (!sql) return [];
	const start = String(sql).indexOf('(');
	const end = String(sql).lastIndexOf(')');
	if (start < 0 || end <= start) return [];
	const body = String(sql).slice(start + 1, end);
	const parts = [];
	let depth = 0;
	let quote = null;
	let current = '';
	for (const char of body) {
		if (quote) {
			current += char;
			if (char === quote) quote = null;
			continue;
		}
		if (char === '"' || char === "'" || char === '`') {
			quote = char;
			current += char;
			continue;
		}
		if (char === '(') depth += 1;
		if (char === ')') depth -= 1;
		if (char === ',' && depth === 0) {
			parts.push(current);
			current = '';
			continue;
		}
		current += char;
	}
	if (current.trim()) parts.push(current);

	const columns = [];
	for (const part of parts) {
		const trimmed = part.trim();
		if (!trimmed || /^(constraint|primary|unique|check|foreign)\b/i.test(trimmed)) continue;
		let name = '';
		const first = trimmed[0];
		if (first === '"' || first === "'" || first === '`') {
			const close = trimmed.indexOf(first, 1);
			name = trimmed.slice(1, close > 0 ? close : undefined);
		} else if (first === '[') {
			const close = trimmed.indexOf(']');
			name = trimmed.slice(1, close > 0 ? close : undefined);
		} else {
			name = trimmed.split(/\s+/)[0];
		}
		if (name) columns.push(name);
	}
	return columns;
}

function findTable(tables, candidates) {
	const names = [...tables.keys()];
	for (const candidate of candidates) {
		const exact = names.find((name) => name === candidate);
		if (exact) return tables.get(exact);
		const insensitive = names.find((name) => name.toLowerCase() === candidate.toLowerCase());
		if (insensitive) return tables.get(insensitive);
	}
	return null;
}

function findColumn(columns, aliases) {
	for (const alias of aliases) {
		const exact = columns.find((column) => column === alias);
		if (exact) return exact;
		const insensitive = columns.find((column) => column.toLowerCase() === alias.toLowerCase());
		if (insensitive) return insensitive;
	}
	for (const alias of aliases) {
		const partial = columns.find((column) => column.toLowerCase().includes(alias.toLowerCase()));
		if (partial) return partial;
	}
	return null;
}

function valueOf(row, column) {
	return column ? row[column] : undefined;
}

function isDeleted(value) {
	if (value === null || value === undefined || value === false) return false;
	if (value === true) return true;
	if (typeof value === 'number') return value !== 0;
	const text = String(value).trim().toLowerCase();
	return text !== '' && text !== '0' && text !== 'false' && text !== 'no';
}

function buildNameMap(table, uidAliases, nameAliases) {
	const map = new Map();
	if (!table) return map;
	const uid = findColumn(table.columns, uidAliases);
	const name = findColumn(table.columns, nameAliases);
	const deleted = findColumn(table.columns, ['IS_DEL', 'C_IS_DEL', 'isDel', 'ZISDEL']);
	if (!uid || !name) return map;
	for (const row of table.rows) {
		if (deleted && isDeleted(row[deleted])) continue;
		const key = String(row[uid] ?? '');
		if (key && !map.has(key)) map.set(key, String(row[name] ?? ''));
	}
	return map;
}

function kindOf(value) {
	if (value === null || value === undefined) return 'expense';
	const text = String(value).trim().toLowerCase();
	if (text === '0' || text === 'income' || text === 'in') return 'income';
	if (text === '1' || text === 'expense' || text === 'out') return 'expense';
	if (['2', '3', '4', 'transfer', 'trans'].includes(text)) return 'transfer';
	return 'expense';
}

export async function readMmbak(bytes, options = {}) {
	const { methods = [], defaultMethodId = null, existing = [] } = options;
	let database = bytes;
	if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
		const files = await readZip(bytes);
		const names = [...files.keys()];
		const member = names.find((name) => /\.(sqlite|db|mmbak)$/i.test(name))
			|| names.sort((a, b) => (files.get(b)?.length || 0) - (files.get(a)?.length || 0))[0];
		if (!member) throw new Error('The .mmbak archive is empty.');
		database = files.get(member);
	}
	const tables = readSqliteTables(database);
	const txnTable = findTable(tables, ['ZINOUTCOME', 'INOUTCOME', 'inoutcome']);
	if (!txnTable) throw new Error('No Money Manager transaction table (ZINOUTCOME) was found.');
	const categoryTable = findTable(tables, ['ZCATEGORY', 'CATEGORY', 'category']);
	const assetTable = findTable(tables, ['ZASSETS', 'ASSETS', 'ASSET', 'assets']);

	const amountCol = findColumn(txnTable.columns, ['ZMONEY', 'AMOUNT', 'ZAMOUNT', 'money']);
	const dateCol = findColumn(txnTable.columns, ['WDATE', 'ZDATE', 'DATE', 'ZTIME', 'date']);
	const typeCol = findColumn(txnTable.columns, ['DO_TYPE', 'ZTYPE', 'TYPE', 'inoutType']);
	const categoryFk = findColumn(txnTable.columns, ['ZCATEGORY', 'ctgUid', 'CTGUID', 'categoryUid', 'category_id']);
	const categoryName = findColumn(txnTable.columns, ['CATEGORY_NAME', 'ZCTGNAME', 'ctgName', 'category_name']);
	const assetFk = findColumn(txnTable.columns, ['ZASSET', 'assetUid', 'ASSETUID', 'ASSETS', 'account_id']);
	const memoCol = findColumn(txnTable.columns, ['ZCONTENT', 'MEMO', 'content', 'ZCOMMENT', 'comment']);
	const deletedCol = findColumn(txnTable.columns, ['IS_DEL', 'C_IS_DEL', 'isDel', 'ZISDEL']);

	if (!amountCol || !dateCol) {
		throw new Error('The Money Manager backup is missing amount or date columns.');
	}

	const categories = buildNameMap(categoryTable, ['uid', 'UID', 'C_UID', '_id', 'id', 'ZUID'], ['ZNAME', 'NAME', 'name', 'ZTITLE', 'CATEGORY_NAME']);
	const assets = buildNameMap(assetTable, ['uid', 'UID', 'C_UID', '_id', 'id', 'ZUID'], ['NIC_NAME', 'nic_name', 'ZNICNAME', 'ZNAME', 'NAME', 'name']);

	const existingKeys = new Set(
		(existing || [])
			.filter((row) => row && (row.type === 'expense' || row.type === 'income'))
			.map((row) =>
				duplicateKey(
					{ date: row.date, type: row.type, amountCents: row.amountCents, merchant: row.merchant },
					row.paymentMethodId ?? null
				)
			)
	);
	const seen = new Set();
	const transactions = [];
	let invalid = 0;
	let duplicates = 0;
	let expenseCount = 0;
	let incomeCount = 0;
	let expenseCents = 0;
	let incomeCents = 0;

	for (const row of txnTable.rows) {
		if (deletedCol && isDeleted(row[deletedCol])) continue;
		const kind = kindOf(valueOf(row, typeCol));
		if (kind !== 'expense' && kind !== 'income') continue;
		const date = parseAnyDate(valueOf(row, dateCol));
		const amountValue = valueOf(row, amountCol);
		const amountCents = typeof amountValue === 'number'
			? Math.round(Math.abs(amountValue) * 100)
			: parseMoney(amountValue);
		if (!date || !amountCents) {
			invalid += 1;
			continue;
		}
		const categoryText = String(
			valueOf(row, categoryName)
			|| categories.get(String(valueOf(row, categoryFk) ?? ''))
			|| ''
		).trim();
		const assetText = String(assets.get(String(valueOf(row, assetFk) ?? '')) || '').trim();
		const memo = String(valueOf(row, memoCol) ?? '').trim();
		const merchant = (memo || categoryText || assetText || (kind === 'income' ? 'Imported income' : 'Imported expense')).slice(0, 60);
		const category = kind === 'income'
			? INCOME_CATEGORY
			: mapCategory(categoryText) || detectCategory(`${merchant} ${memo}`) || 'other';
		const matchedMethodId = matchMethod(assetText, methods);
		const missingMethod = missingMethodLabel(assetText, matchedMethodId);
		const paymentMethodId = matchedMethodId ?? (assetText ? null : defaultMethodId ?? null);
		const transaction = {
			type: kind,
			date,
			merchant,
			amountCents,
			category,
			notes: memo.slice(0, 500),
			paymentMethodId,
			methodLabel:
				methods.find((method) => method.id === paymentMethodId)?.label ||
				missingMethod ||
				(assetText ? '' : methods.find((method) => method.id === defaultMethodId)?.label || ''),
			missingMethod,
			source: 'Money Manager import',
		};
		if (kind === 'income') {
			incomeCount += 1;
			incomeCents += amountCents;
		} else {
			expenseCount += 1;
			expenseCents += amountCents;
		}
		const key = duplicateKey(transaction, paymentMethodId);
		if (existingKeys.has(key) || seen.has(key)) {
			transaction.duplicate = true;
			duplicates += 1;
		}
		seen.add(key);
		transactions.push(transaction);
	}

	return {
		rows: transactions,
		stats: {
			total: txnTable.rows.length,
			valid: transactions.filter((row) => !row.duplicate).length,
			invalid,
			duplicates,
			expenseCount,
			incomeCount,
			expenseCents,
			incomeCents,
		},
		warnings: categoryTable && assetTable ? [] : ['Some category or account names could not be resolved from the backup.'],
	};
}
