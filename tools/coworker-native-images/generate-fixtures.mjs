// Generate synthetic native-image fixtures; never calls AI, Zalo or the gateway.
// expected.local.json is evaluator-only and must not be sent to the model.
import { randomBytes, randomInt, createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';

const require = createRequire('C:/Users/Admin/Documents/PTAP-NEXT/tools/zalo-bridge/package.json');
const sharp = require('sharp');
if (!process.argv[2]) throw new Error('Provide a fresh output directory.');
const output = pathToFileURL(resolve(process.argv[2]) + '/');
try {
  await access(new URL('manifest.json', output));
  throw new Error('FIXTURES_ALREADY_EXIST: preserve the existing evidence; choose a new directory for another run.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await mkdir(output, { recursive: true });

const code = () => 'TST-' + randomBytes(4).toString('hex').toUpperCase();
const specimenA = { code: code(), dimensionsMm: [randomInt(30, 45), randomInt(65, 79), randomInt(8, 13)] };
const specimenB = { code: code(), dimensionsMm: [randomInt(46, 55), randomInt(81, 95), randomInt(14, 20)] };
const distractor = { code: code(), dimensionsMm: [randomInt(10, 20), randomInt(25, 35), randomInt(2, 7)] };
const entries = [
  { id: 'img-1', file: 'photo-01.png', specimen: specimenA, color: 'blue', shape: 'ring', selected: true },
  { id: 'img-2', file: 'photo-02.png', specimen: specimenA, color: 'blue', shape: 'ring', selected: true },
  { id: 'img-3', file: 'photo-03.png', specimen: specimenB, color: 'orange', shape: 'ring', selected: true },
  { id: 'img-4', file: 'photo-04.png', specimen: distractor, color: 'red', shape: 'square', selected: false },
];
const manifest = [];
for (const [index, entry] of entries.entries()) {
  const color = { blue: '#2563eb', orange: '#ea580c', red: '#dc2626' }[entry.color];
  const drawing = entry.shape === 'ring'
    ? '<ellipse cx="500" cy="235" rx="145" ry="' + (index === 1 ? 75 : 135) + '" fill="none" stroke="' + color + '" stroke-width="55"/>'
    : '<rect x="360" y="105" width="280" height="260" fill="' + color + '"/>';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="640">'
    + '<rect width="1000" height="640" fill="#ffffff"/>'
    + '<text x="45" y="48" font-family="Arial" font-size="24" fill="#475569">SYNTHETIC TEST IMAGE</text>'
    + drawing
    + '<text x="500" y="463" text-anchor="middle" font-family="Arial" font-size="60" fill="#0f172a">' + entry.specimen.code + '</text>'
    + '<text x="500" y="553" text-anchor="middle" font-family="Arial" font-size="52" fill="#0f172a">'
    + entry.specimen.dimensionsMm.join(' × ') + ' mm</text></svg>';
  const bytes = await sharp(Buffer.from(svg, 'utf8')).png().toBuffer();
  await writeFile(new URL(entry.file, output), bytes);
  manifest.push({ imageId: entry.id, filename: entry.file, mimeType: 'image/png', width: 1000, height: 640,
    byteSize: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    selected: entry.selected, sourceMessageId: 'fixture-photo-' + (index + 1),
    albumId: entry.selected ? 'fixture-album-selected' : 'fixture-album-other', albumIndex: entry.selected ? index : 0 });
}
const request = {
  fixtureOnly: true,
  instructions: 'Phân tích các ảnh đã chọn. Đọc mã và dòng kích thước; nhận diện màu và hình vẽ chính. Nhóm các ảnh có cùng mã thành một dòng, giữ sourceImageIds của mỗi dòng. Trả JSON có rows [{code, dimensionsMm, color, shape, sourceImageIds}]. Dữ kiện không đọc rõ để null. Không tự tra web cho bài kiểm tra này.',
  question: 'ghi thành 2 cột, mã số và kích thước các phụ tùng này',
  images: manifest.filter(entry => entry.selected).map(({ imageId, filename, mimeType, sourceMessageId, albumIndex }) =>
    ({ imageId, filename, mimeType, sourceMessageId, albumIndex })),
};
const expected = { evaluatorOnly: true, neverSendToModel: true, rows: [
  { ...specimenA, color: 'blue', shape: 'ring', sourceImageIds: ['img-1', 'img-2'] },
  { ...specimenB, color: 'orange', shape: 'ring', sourceImageIds: ['img-3'] },
], excludedImageId: 'img-4', note: 'Dimensions are printed synthetic labels, not values measured from the drawing.' };
for (const [filename, data] of [['manifest.json', manifest], ['request.json', request], ['expected.local.json', expected]]) {
  await writeFile(new URL(filename, output), JSON.stringify(data, null, 2) + '\n', 'utf8');
}
console.log(JSON.stringify({ status: 'FIXTURES_PREPARED_NOT_INFERRED', directory: fileURLToPath(output),
  images: manifest.length, selectedImages: request.images.length, expectedRows: expected.rows.length }));
