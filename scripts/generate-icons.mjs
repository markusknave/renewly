import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.cwd());
const pwaDir = path.join(projectRoot, 'public/icons');
const androidRes = path.join(projectRoot, 'android/app/src/main/res');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function smoothCoverage(distance, size) {
  return clamp(0.5 - distance * size);
}

function roundRectDistance(x, y, cx, cy, halfWidth, halfHeight, radius) {
  const qx = Math.abs(x - cx) - (halfWidth - radius);
  const qy = Math.abs(y - cy) - (halfHeight - radius);
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    radius
  );
}

function segmentDistance(x, y, ax, ay, bx, by, radius) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = x - ax;
  const wy = y - ay;
  const t = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy));
  return Math.hypot(wx - t * vx, wy - t * vy) - radius;
}

function background(u, v) {
  const t = clamp((u + v) / 2);
  const start = [79, 70, 229];
  const end = [15, 157, 148];
  const color = start.map((c, i) => Math.round(c + (end[i] - c) * t));
  const glow = Math.max(0, 1 - Math.hypot(u - 0.28, v - 0.24) * 2.4) * 0.12;
  return color.map((c) => Math.round(c + (255 - c) * glow));
}

function render(width, height = width, { glyphFraction = 1, transparent = false } = {}) {
  const pixels = Buffer.alloc(width * height * 4);
  const glyphSide = Math.min(width, height) * glyphFraction;

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const u = (px + 0.5) / width;
      const v = (py + 0.5) / height;
      const gx = 0.5 + (px + 0.5 - width / 2) / glyphSide;
      const gy = 0.5 + (py + 0.5 - height / 2) / glyphSide;

      let r = 255;
      let g = 255;
      let b = 255;
      let a = 0;

      if (!transparent) {
        const bg = background(u, v);
        r = bg[0];
        g = bg[1];
        b = bg[2];
        a = 255;
      }

      const stem = roundRectDistance(gx, gy, 0.37, 0.5, 0.05, 0.26, 0.035);
      const bowl = roundRectDistance(gx, gy, 0.48, 0.37, 0.16, 0.13, 0.12);
      const hole = roundRectDistance(gx, gy, 0.49, 0.36, 0.07, 0.06, 0.05);
      const leg = segmentDistance(gx, gy, 0.5, 0.46, 0.64, 0.76, 0.05);

      const glyphDistance = Math.max(Math.min(stem, bowl, leg), -hole);
      const alpha = smoothCoverage(glyphDistance, glyphSide);

      if (transparent) {
        a = Math.round(alpha * 255);
      } else if (alpha > 0) {
        r = Math.round(r + (255 - r) * alpha);
        g = Math.round(g + (255 - g) * alpha);
        b = Math.round(b + (255 - b) * alpha);
      }

      const index = (py * width + px) * 4;
      pixels[index] = r;
      pixels[index + 1] = g;
      pixels[index + 2] = b;
      pixels[index + 3] = a;
    }
  }

  return encodePng(width, height, pixels);
}

function write(file, buffer) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, buffer);
}

mkdirSync(pwaDir, { recursive: true });
write(path.join(pwaDir, 'app-192.png'), render(192));
write(path.join(pwaDir, 'app-512.png'), render(512));
write(path.join(pwaDir, 'app-maskable-512.png'), render(512, 512, { glyphFraction: 0.84 }));
write(path.join(pwaDir, 'apple-touch-icon.png'), render(180));
write(path.join(pwaDir, 'favicon-32.png'), render(32));

if (existsSync(androidRes)) {
  const densities = {
    mdpi: 1,
    hdpi: 1.5,
    xhdpi: 2,
    xxhdpi: 3,
    xxxhdpi: 4,
  };
  for (const [density, scale] of Object.entries(densities)) {
    const dir = path.join(androidRes, `mipmap-${density}`);
    const legacy = Math.round(48 * scale);
    const foreground = Math.round(108 * scale);
    write(path.join(dir, 'ic_launcher.png'), render(legacy));
    write(path.join(dir, 'ic_launcher_round.png'), render(legacy));
    write(
      path.join(dir, 'ic_launcher_foreground.png'),
      render(foreground, foreground, { glyphFraction: 0.84, transparent: true })
    );
  }

  const splashes = [
    ['drawable/splash.png', 480, 320],
    ['drawable-land-mdpi/splash.png', 480, 320],
    ['drawable-land-hdpi/splash.png', 800, 480],
    ['drawable-land-xhdpi/splash.png', 1280, 720],
    ['drawable-land-xxhdpi/splash.png', 1600, 960],
    ['drawable-land-xxxhdpi/splash.png', 1920, 1280],
    ['drawable-port-mdpi/splash.png', 320, 480],
    ['drawable-port-hdpi/splash.png', 480, 800],
    ['drawable-port-xhdpi/splash.png', 720, 1280],
    ['drawable-port-xxhdpi/splash.png', 960, 1600],
    ['drawable-port-xxxhdpi/splash.png', 1280, 1920],
  ];
  for (const [file, width, height] of splashes) {
    write(path.join(androidRes, file), render(width, height, { glyphFraction: 0.6 }));
  }
}

console.log(`Wrote PWA icons to ${pwaDir}`);
if (existsSync(androidRes)) console.log(`Wrote Android icons and splashes to ${androidRes}`);
