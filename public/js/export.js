// Client-side report generation: CSV, XLSX, and PDF. No dependencies, no
// network. XLSX is a minimal OOXML package zipped with CompressionStream when
// available; PDF is a minimal PDF 1.4 document with base-14 fonts.

import { formatMoney } from './lib/dates.js';
import { categoryLabel } from './lib/categories.js';
import { inRange, sortTransactions, transactionSignedCents } from './finance.js';

const TYPE_LABELS = {
	expense: 'Expense',
	income: 'Income',
	interest: 'Interest',
	goal_deposit: 'Goal transfer',
	goal_withdrawal: 'Goal transfer',
};

const encoder = new TextEncoder();

function amountText(cents) {
	return (Number(cents) / 100).toFixed(2);
}

function methodName(methods, id) {
	const method = (methods || []).find((row) => Number(row.id) === Number(id));
	return method ? method.label : 'No method';
}

function goalName(goals, id) {
	const goal = (goals || []).find((row) => Number(row.id) === Number(id));
	return goal ? goal.name : 'Goal';
}

function descriptionFor(transaction, methods, goals) {
	if (transaction.type === 'interest') {
		return `Interest earned · ${methodName(methods, transaction.paymentMethodId)}`;
	}
	if (transaction.type === 'goal_deposit') {
		return `Transfer to ${goalName(goals, transaction.goalId)}`;
	}
	if (transaction.type === 'goal_withdrawal') {
		return `Transfer from ${goalName(goals, transaction.goalId)}`;
	}
	return transaction.merchant || TYPE_LABELS[transaction.type] || 'Entry';
}

export function buildReport({ transactions, methods, goals, from, to, today, generatedAt }) {
	const rows = sortTransactions(
		(Array.isArray(transactions) ? transactions : []).filter((transaction) =>
			inRange(transaction, from, to)
		)
	).map((transaction) => {
		const signed = transactionSignedCents(transaction);
		return {
			date: transaction.date,
			description: descriptionFor(transaction, methods, goals),
			category: transaction.type === 'expense' ? categoryLabel(transaction.category) : TYPE_LABELS[transaction.type] || 'Entry',
			type: TYPE_LABELS[transaction.type] || 'Entry',
			method: methodName(methods, transaction.paymentMethodId),
			amountCents: signed,
			notes: transaction.notes || '',
		};
	});

	const totalExpenseCents = rows.reduce((sum, row) => (row.type === 'Expense' ? sum + Math.abs(row.amountCents) : sum), 0);
	const totalIncomeCents = rows.reduce(
		(sum, row) => (row.type === 'Income' || row.type === 'Interest' ? sum + row.amountCents : sum),
		0
	);
	const netCents = totalIncomeCents - totalExpenseCents;

	return {
		from: from || 'all time',
		to: to || today,
		generatedAt: generatedAt || new Date().toISOString(),
		currency: 'PHP',
		rows,
		totals: {
			expenseCents: totalExpenseCents,
			incomeCents: totalIncomeCents,
			netCents,
			count: rows.length,
		},
	};
}

function csvCell(value) {
	const text = String(value ?? '');
	if (!/[",\r\n]/.test(text)) return text;
	return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(report) {
	const lines = [
		['Date', 'Description', 'Category', 'Type', 'Payment method', 'Amount (PHP)', 'Notes'],
		...report.rows.map((row) => [
			row.date,
			row.description,
			row.category,
			row.type,
			row.method,
			amountText(row.amountCents),
			row.notes,
		]),
		[],
		['Total spend', amountText(report.totals.expenseCents)],
		['Income and interest', amountText(report.totals.incomeCents)],
		['Net', amountText(report.totals.netCents)],
	];
	return `\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function xmlEscape(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function columnLetter(index) {
	let n = index + 1;
	let label = '';
	while (n > 0) {
		const remainder = (n - 1) % 26;
		label = String.fromCharCode(65 + remainder) + label;
		n = Math.floor((n - 1) / 26);
	}
	return label;
}

function sheetXml(report) {
	const header = ['Date', 'Description', 'Category', 'Type', 'Payment method', 'Amount (PHP)', 'Notes'];
	const rows = [
		header.map((value) => ({ value, type: 'string', style: 1 })),
		...report.rows.map((row) => [
			{ value: row.date, type: 'string', style: 0 },
			{ value: row.description, type: 'string', style: 0 },
			{ value: row.category, type: 'string', style: 0 },
			{ value: row.type, type: 'string', style: 0 },
			{ value: row.method, type: 'string', style: 0 },
			{ value: row.amountCents / 100, type: 'number', style: 2 },
			{ value: row.notes, type: 'string', style: 0 },
		]),
		[],
		[
			{ value: 'Total spend', type: 'string', style: 1 },
			{ value: '', type: 'string', style: 1 },
			{ value: '', type: 'string', style: 1 },
			{ value: '', type: 'string', style: 1 },
			{ value: '', type: 'string', style: 1 },
			{ value: report.totals.expenseCents / 100, type: 'number', style: 2 },
			{ value: '', type: 'string', style: 0 },
		],
		[
			{ value: 'Income and interest', type: 'string', style: 1 },
			{ value: '', type: 'string', style: 1 },
			{ value: '', type: 'string', style: 1 },
			{ value: '', type: 'string', style: 1 },
			{ value: '', type: 'string', style: 1 },
			{ value: report.totals.incomeCents / 100, type: 'number', style: 2 },
			{ value: '', type: 'string', style: 0 },
		],
		[
			{ value: 'Net', type: 'string', style: 1 },
			{ value: '', type: 'string', style: 1 },
			{ value: '', type: 'string', style: 1 },
			{ value: '', type: 'string', style: 1 },
			{ value: '', type: 'string', style: 1 },
			{ value: report.totals.netCents / 100, type: 'number', style: 2 },
			{ value: '', type: 'string', style: 0 },
		],
	];

	const body = rows
		.map((cells, rowIndex) => {
			const r = rowIndex + 1;
			const values = cells
				.map((cell, columnIndex) => {
					const ref = `${columnLetter(columnIndex)}${r}`;
					if (cell.type === 'number') {
						return `<c r="${ref}" s="${cell.style}"><v>${Number(cell.value).toFixed(2)}</v></c>`;
					}
					if (cell.value === '') return `<c r="${ref}" s="${cell.style}"/>`;
					return `<c r="${ref}" t="inlineStr" s="${cell.style}"><is><t xml:space="preserve">${xmlEscape(
						cell.value
					)}</t></is></c>`;
				})
				.join('');
			return `<row r="${r}">${values}</row>`;
		})
		.join('');

	const lastRow = Math.max(1, rows.length);
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:G${lastRow}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols><col min="1" max="1" width="12" customWidth="1"/><col min="2" max="2" width="38" customWidth="1"/><col min="3" max="3" width="20" customWidth="1"/><col min="4" max="4" width="15" customWidth="1"/><col min="5" max="5" width="22" customWidth="1"/><col min="6" max="6" width="15" customWidth="1"/><col min="7" max="7" width="32" customWidth="1"/></cols>
<sheetData>${body}</sheetData>
<autoFilter ref="A1:G${Math.max(1, report.rows.length + 1)}"/>
</worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Expenses" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border/><border><bottom style="thin"><color rgb="FFE3E6EE"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let index = 0; index < 256; index += 1) {
		let value = index;
		for (let bit = 0; bit < 8; bit += 1) {
			value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		}
		table[index] = value >>> 0;
	}
	return table;
})();

function crc32(bytes) {
	let crc = 0xffffffff;
	for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes) {
	if (typeof CompressionStream === 'undefined' || typeof Response === 'undefined') return null;
	try {
		const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
		return new Uint8Array(await new Response(stream).arrayBuffer());
	} catch {
		return null;
	}
}

function dosDateTime(date) {
	const d = date instanceof Date ? date : new Date();
	const year = Math.max(1980, d.getFullYear());
	return {
		time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
		date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
	};
}

async function zipFiles(files, now) {
	const localParts = [];
	const centralParts = [];
	const { time, date } = dosDateTime(now);
	let offset = 0;

	for (const file of files) {
		const nameBytes = encoder.encode(file.name);
		const raw = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
		const compressed = await deflateRaw(raw);
		const payload = compressed || raw;
		const method = compressed ? 8 : 0;
		const crc = crc32(raw);

		const local = new Uint8Array(30 + nameBytes.length + payload.length);
		const localView = new DataView(local.buffer);
		localView.setUint32(0, 0x04034b50, true);
		localView.setUint16(4, 20, true);
		localView.setUint16(6, 0x0800, true);
		localView.setUint16(8, method, true);
		localView.setUint16(10, time, true);
		localView.setUint16(12, date, true);
		localView.setUint32(14, crc, true);
		localView.setUint32(18, payload.length, true);
		localView.setUint32(22, raw.length, true);
		localView.setUint16(26, nameBytes.length, true);
		localView.setUint16(28, 0, true);
		local.set(nameBytes, 30);
		local.set(payload, 30 + nameBytes.length);
		localParts.push(local);

		const central = new Uint8Array(46 + nameBytes.length);
		const centralView = new DataView(central.buffer);
		centralView.setUint32(0, 0x02014b50, true);
		centralView.setUint16(4, 20, true);
		centralView.setUint16(6, 20, true);
		centralView.setUint16(8, 0x0800, true);
		centralView.setUint16(10, method, true);
		centralView.setUint16(12, time, true);
		centralView.setUint16(14, date, true);
		centralView.setUint32(16, crc, true);
		centralView.setUint32(20, payload.length, true);
		centralView.setUint32(24, raw.length, true);
		centralView.setUint16(28, nameBytes.length, true);
		centralView.setUint16(30, 0, true);
		centralView.setUint16(32, 0, true);
		centralView.setUint16(34, 0, true);
		centralView.setUint16(36, 0, true);
		centralView.setUint32(38, 0, true);
		centralView.setUint32(42, offset, true);
		central.set(nameBytes, 46);
		centralParts.push(central);

		offset += local.length;
	}

	const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
	const end = new Uint8Array(22);
	const endView = new DataView(end.buffer);
	endView.setUint32(0, 0x06054b50, true);
	endView.setUint16(8, files.length, true);
	endView.setUint16(10, files.length, true);
	endView.setUint32(12, centralSize, true);
	endView.setUint32(16, offset, true);

	const total = offset + centralSize + end.length;
	const output = new Uint8Array(total);
	let cursor = 0;
	for (const part of [...localParts, ...centralParts, end]) {
		output.set(part, cursor);
		cursor += part.length;
	}
	return output;
}

export async function toXlsx(report, now = new Date()) {
	const files = [
		{ name: '[Content_Types].xml', data: CONTENT_TYPES },
		{ name: '_rels/.rels', data: ROOT_RELS },
		{ name: 'xl/workbook.xml', data: WORKBOOK },
		{ name: 'xl/_rels/workbook.xml.rels', data: WORKBOOK_RELS },
		{ name: 'xl/styles.xml', data: STYLES },
		{ name: 'xl/worksheets/sheet1.xml', data: sheetXml(report) },
	];
	return zipFiles(files, now);
}

function pdfText(value) {
	return String(value ?? '')
		.replace(/[·•]/g, '-')
		.replace(/[–—]/g, '-')
		.replace(/[’‘]/g, "'")
		.replace(/[“”]/g, '"')
		.normalize('NFKD')
		.replace(/[^\x20-\x7E]/g, '?')
		.replace(/\\/g, '\\\\')
		.replace(/\(/g, '\\(')
		.replace(/\)/g, '\\)');
}

function pdfMoney(cents) {
	return `${Number(cents) < 0 ? '-' : ''}${(Math.abs(Number(cents)) / 100).toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

function truncate(value, max) {
	const text = String(value ?? '');
	return text.length <= max ? text : text.slice(0, Math.max(0, max - 1));
}

export function toPdf(report, now = new Date()) {
	const pages = [];
	const width = 595;
	const height = 842;
	const margin = 40;
	const bottom = 46;
	const columns = [
		{ x: margin, max: 10 },
		{ x: margin + 56, max: 34 },
		{ x: margin + 228, max: 14 },
		{ x: margin + 304, max: 13 },
		{ x: margin + 374, max: 14 },
		{ x: width - margin, max: 12, right: true },
	];

	function newPage(title, subtitle) {
		const lines = [];
		const page = { lines };
		pages.push(page);
		lines.push({ font: 'F2', size: 18, x: margin, y: height - 58, text: title });
		lines.push({ font: 'F1', size: 9, x: margin, y: height - 76, text: subtitle });
		lines.push({ font: 'F1', size: 9, x: margin, y: height - 92, text: `Generated ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC · amounts in PHP` });
		return { page, y: height - 118 };
	}

	const title = 'Renewly expense report';
	const range = report.from === report.to ? report.from : `${report.from} to ${report.to}`;
	const totals = `Spend ${pdfMoney(report.totals.expenseCents)} · Income/interest ${pdfMoney(
		report.totals.incomeCents
	)} · Net ${pdfMoney(report.totals.netCents)} · ${report.totals.count} entries`;
	let { page, y } = newPage(title, range);

	const drawHeader = () => {
		const labels = ['Date', 'Description', 'Category', 'Type', 'Method', 'Amount'];
		labels.forEach((label, index) => {
			const column = columns[index];
			const x = column.right ? column.x - label.length * 4.8 : column.x;
			page.lines.push({ font: 'F2', size: 8.5, x, y, text: label });
		});
		y -= 4;
		page.lines.push({ font: 'F1', size: 8, x: margin, y, text: '-'.repeat(100) });
		y -= 13;
	};

	page.lines.push({ font: 'F1', size: 9, x: margin, y, text: totals });
	y -= 24;
	drawHeader();

	for (const row of report.rows) {
		if (y < bottom) {
			const next = newPage(`${title} (continued)`, range);
			page = next.page;
			y = next.y;
			drawHeader();
		}
		const cells = [
			truncate(row.date, columns[0].max),
			truncate(row.description, columns[1].max),
			truncate(row.category, columns[2].max),
			truncate(row.type, columns[3].max),
			truncate(row.method, columns[4].max),
			pdfMoney(row.amountCents).padStart(columns[5].max),
		];
		cells.forEach((cell, index) => {
			const column = columns[index];
			const text = cell.padEnd(column.right ? 0 : column.max);
			const x = column.right ? column.x - text.length * 4.8 : column.x;
			page.lines.push({ font: 'F1', size: 8, x, y, text });
		});
		y -= 12;
	}

	if (!report.rows.length) {
		page.lines.push({ font: 'F1', size: 10, x: margin, y, text: 'No transactions in this range.' });
	}

	const content = pages.map((entry) => {
		const ops = [];
		for (const line of entry.lines) {
			ops.push(
				`BT /${line.font} ${line.size} Tf ${line.x.toFixed(2)} ${line.y.toFixed(2)} Td (${pdfText(
					line.text
				)}) Tj ET`
			);
		}
		const pageNumber = pages.indexOf(entry) + 1;
		ops.push(
			`BT /F1 8 Tf ${(width / 2).toFixed(2)} 26 Td (${pdfText(
				`Page ${pageNumber} of ${pages.length} · Renewly`
			)}) Tj ET`
		);
		return ops.join('\n');
	});

	const objects = [];
	const reserve = (body) => {
		objects.push(body);
		return objects.length;
	};
	const catalogNumber = reserve(null);
	const pagesNumber = reserve(null);
	const fonts = {
		F1: reserve('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
		F2: reserve('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
	};
	const pageNumbers = [];
	for (const stream of content) {
		const streamNumber = reserve(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
		const pageNumber = reserve(
			`<< /Type /Page /Parent ${pagesNumber} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${fonts.F1} 0 R /F2 ${fonts.F2} 0 R >> >> /Contents ${streamNumber} 0 R >>`
		);
		pageNumbers.push(pageNumber);
	}
	objects[catalogNumber - 1] = `<< /Type /Catalog /Pages ${pagesNumber} 0 R >>`;
	objects[pagesNumber - 1] = `<< /Type /Pages /Kids [${pageNumbers
		.map((number) => `${number} 0 R`)
		.join(' ')}] /Count ${pageNumbers.length} >>`;

	let pdf = '%PDF-1.4\n';
	const offsets = [0];
	for (let index = 0; index < objects.length; index += 1) {
		offsets.push(encoder.encode(pdf).length);
		pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
	}
	const xrefOffset = encoder.encode(pdf).length;
	pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (let index = 1; index <= objects.length; index += 1) {
		pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
	}
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNumber} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
	return encoder.encode(pdf);
}

export function reportFileName(extension, report) {
	return `renewly-expenses-${report.from}-to-${report.to}.${extension}`;
}

export function reportSummaryLine(report) {
	return `${report.totals.count} entries · spend ${formatMoney(
		report.totals.expenseCents,
		report.currency
	)} · net ${formatMoney(report.totals.netCents, report.currency)}`;
}
