import fs from 'node:fs';
import path from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const [sourceDirectory, outputDirectory] = process.argv.slice(2);
if (!sourceDirectory || !outputDirectory) throw new Error('Usage: node create-nightly-icons.mjs <source-icons> <output-icons>');
fs.mkdirSync(outputDirectory, { recursive: true });

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  crcTable[n] = value >>> 0;
}
//
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const chunk = Buffer.allocUnsafe(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left
    : aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function tintPng(png) {
  if (png.length < 33 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Nightly icon source contains an invalid PNG.');
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  let offset = 8;
  const chunks = [];
  const compressed = [];
  let idatIndex = -1;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > png.length) throw new Error('Nightly icon PNG has a truncated chunk.');
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    }
    if (type === 'IDAT') {
      if (idatIndex < 0) idatIndex = chunks.length;
      compressed.push(data);
    }
    else chunks.push({ type, data: Buffer.from(data) });
    offset = end;
    if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0 || !width || !height) {
    throw new Error('Nightly icon tinting requires non-interlaced, 8-bit RGBA PNG icons.');
  }
  const rowBytes = width * 4;
  const raw = inflateSync(Buffer.concat(compressed));
  if (raw.length !== height * (rowBytes + 1)) throw new Error('Nightly icon PNG pixel data has an unexpected size.');
  const pixels = Buffer.allocUnsafe(height * rowBytes);
  for (let y = 0; y < height; y++) {
    const inputRow = y * (rowBytes + 1);
    const outputRow = y * rowBytes;
    const filter = raw[inputRow];
    for (let x = 0; x < rowBytes; x++) {
      const encoded = raw[inputRow + 1 + x];
      const left = x >= 4 ? pixels[outputRow + x - 4] : 0;
      const above = y > 0 ? pixels[outputRow - rowBytes + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[outputRow - rowBytes + x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) predictor = paeth(left, above, upperLeft);
      else if (filter !== 0) throw new Error(`Nightly icon PNG uses an unsupported filter (${filter}).`);
      pixels[outputRow + x] = (encoded + predictor) & 0xff;
    }
  }

  const angle = 42 * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const hue = [
    [0.213 + cosine * 0.787 - sine * 0.213, 0.715 - cosine * 0.715 - sine * 0.715, 0.072 - cosine * 0.072 + sine * 0.928],
    [0.213 - cosine * 0.213 + sine * 0.143, 0.715 + cosine * 0.285 + sine * 0.140, 0.072 - cosine * 0.072 - sine * 0.283],
    [0.213 - cosine * 0.213 - sine * 0.787, 0.715 - cosine * 0.715 + sine * 0.715, 0.072 + cosine * 0.928 + sine * 0.072]
  ];
  const saturation = [
    [0.213 + 0.787 * 1.08, 0.715 - 0.715 * 1.08, 0.072 - 0.072 * 1.08],
    [0.213 - 0.213 * 1.08, 0.715 + 0.285 * 1.08, 0.072 - 0.072 * 1.08],
    [0.213 - 0.213 * 1.08, 0.715 - 0.715 * 1.08, 0.072 + 0.928 * 1.08]
  ];
  for (let i = 0; i < pixels.length; i += 4) {
    const [red, green, blue] = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const rotated = hue.map((row) => row[0] * red + row[1] * green + row[2] * blue);
    for (let channel = 0; channel < 3; channel++) {
      const value = saturation[channel][0] * rotated[0] + saturation[channel][1] * rotated[1] + saturation[channel][2] * rotated[2];
      pixels[i + channel] = Math.max(0, Math.min(255, Math.round(value)));
    }
  }

  const outputChunks = [];
  const encodedImage = pngChunk('IDAT', deflateSync(encodeRows(pixels, width, height)));
  for (let i = 0; i <= chunks.length; i++) {
    if (i === idatIndex) outputChunks.push(encodedImage);
    if (i < chunks.length) outputChunks.push(pngChunk(chunks[i].type, chunks[i].data));
  }
  if (idatIndex < 0) throw new Error('Nightly icon PNG is missing image data.');
  return Buffer.concat([PNG_SIGNATURE, ...outputChunks]);
}

function encodeRows(pixels, width, height) {
  const rowBytes = width * 4;
  const raw = Buffer.allocUnsafe(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (rowBytes + 1);
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * rowBytes, (y + 1) * rowBytes);
  }
  return raw;
}

function tintIco(ico) {
  if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) throw new Error('Nightly Windows icon is not a valid ICO file.');
  const count = ico.readUInt16LE(4);
  const headerLength = 6 + count * 16;
  const entries = [];
  let cursor = headerLength;
  for (let i = 0; i < count; i++) {
    const entryOffset = 6 + i * 16;
    const size = ico.readUInt32LE(entryOffset + 8);
    const imageOffset = ico.readUInt32LE(entryOffset + 12);
    if (imageOffset + size > ico.length) throw new Error('Nightly Windows icon contains a truncated image.');
    const image = ico.subarray(imageOffset, imageOffset + size);
    if (!image.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Nightly Windows icon contains a non-PNG image.');
    entries.push({ header: Buffer.from(ico.subarray(entryOffset, entryOffset + 16)), image: tintPng(image) });
  }
  const output = Buffer.alloc(headerLength + entries.reduce((total, entry) => total + entry.image.length, 0));
  ico.copy(output, 0, 0, headerLength);
  for (const [index, entry] of entries.entries()) {
    entry.header.writeUInt32LE(entry.image.length, 8);
    entry.header.writeUInt32LE(cursor, 12);
    entry.header.copy(output, 6 + index * 16);
    entry.image.copy(output, cursor);
    cursor += entry.image.length;
  }
  return output;
}

function tintIcns(icns) {
  if (icns.toString('ascii', 0, 4) !== 'icns') throw new Error('Nightly macOS icon is not a valid ICNS file.');
  const chunks = [];
  let offset = 8;
  while (offset + 8 <= icns.length) {
    const type = icns.toString('ascii', offset, offset + 4);
    const length = icns.readUInt32BE(offset + 4);
    if (length < 8 || offset + length > icns.length) throw new Error('Nightly macOS icon contains a truncated chunk.');
    const payload = icns.subarray(offset + 8, offset + length);
    const image = payload.subarray(0, 8).equals(PNG_SIGNATURE) ? tintPng(payload) : Buffer.from(payload);
    const chunk = Buffer.allocUnsafe(8 + image.length);
    chunk.write(type, 0, 4, 'ascii');
    chunk.writeUInt32BE(chunk.length, 4);
    image.copy(chunk, 8);
    chunks.push(chunk);
    offset += length;
  }
  const output = Buffer.allocUnsafe(8 + chunks.reduce((total, chunk) => total + chunk.length, 0));
  output.write('icns', 0, 4, 'ascii');
  output.writeUInt32BE(output.length, 4);
  let cursor = 8;
  for (const chunk of chunks) { chunk.copy(output, cursor); cursor += chunk.length; }
  return output;
}

const pngNames = ['icon.png', '32x32.png', '128x128.png', '128x128@2x.png'];
for (const name of pngNames) fs.writeFileSync(path.join(outputDirectory, name), tintPng(fs.readFileSync(path.join(sourceDirectory, name))));
fs.writeFileSync(path.join(outputDirectory, 'icon.ico'), tintIco(fs.readFileSync(path.join(sourceDirectory, 'icon.ico'))));
fs.writeFileSync(path.join(outputDirectory, 'icon.icns'), tintIcns(fs.readFileSync(path.join(sourceDirectory, 'icon.icns'))));
console.log(`Created purple Nightly icons in ${outputDirectory}`);
