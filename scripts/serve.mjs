// Zero-dependency static server for local development and smoke tests.
// Usage: node scripts/serve.mjs [rootDir] [port]

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'public');
const port = Number(process.env.PORT || process.argv[3] || 8080);
const host = process.env.HOST || '127.0.0.1';

const TYPES = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.webmanifest': 'application/manifest+json',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
	res.writeHead(status, {
		'content-type': type,
		'cache-control': 'no-store',
		'content-length': Buffer.byteLength(body),
	});
	res.end(body);
}

const server = http.createServer((req, res) => {
	const url = new URL(req.url || '/', 'http://localhost');
	let relative = decodeURIComponent(url.pathname);
	if (relative === '/') relative = '/index.html';
	const file = path.join(root, path.normalize(relative));
	if (file !== root && !file.startsWith(root + path.sep)) {
		send(res, 403, 'Forbidden');
		return;
	}
	fs.readFile(file, (err, body) => {
		if (err) {
			// SPA fallback for navigation requests.
			if (req.headers.accept?.includes('text/html')) {
				fs.readFile(path.join(root, 'index.html'), (fallbackErr, html) => {
					if (fallbackErr) send(res, 404, 'Not found');
					else send(res, 200, html, TYPES['.html']);
				});
				return;
			}
			send(res, 404, 'Not found');
			return;
		}
		send(res, 200, body, TYPES[path.extname(file)] || 'application/octet-stream');
	});
});

server.listen(port, host, () => {
	console.log(`Renewly dev server: http://${host}:${port} (root ${root})`);
});
