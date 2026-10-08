import assert from 'node:assert';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'components', 'PhotoBooth.tsx'), 'utf8');

/**
 * Regresi paling mahal di alur pembayaran: frontend memotong frame kamera ke
 * jalur tengah sebelum mengirim ke OCR. Posisi HP tidak bisa diprediksi, jadi
 * struk yang terlihat "sudah pas" di bingkai tetap terpotong dan OCR menerima
 * gambar tanpa teks. Di produksi ini terlihat sebagai skor 0,0,0 dengan
 * nominal null, berulang kali pada sesi yang berbeda.
 */
test('frame kamera dikirim utuh, tanpa crop tebakan posisi', () => {
  assert.ok(!/previewAspect/.test(source), 'rasio preview lama harus hilang');
  assert.ok(!/const inset = 0\.04/.test(source), 'inset 4% harus hilang');
  assert.ok(
    !/drawImage\(video,\s*cropX,\s*cropY/.test(source),
    'tidak boleh menggambar dari koordinat crop yang ditebak'
  );
});

test('seluruh area kamera dipakai saat mengambil frame', () => {
  assert.match(
    source,
    /drawImage\(video,\s*0,\s*0,\s*sourceWidth,\s*sourceHeight,\s*0,\s*0/,
    'drawImage harus memakai seluruh frame kamera'
  );
});

test('frame tetap diperkecil agar unggahan ringan', () => {
  assert.match(source, /const longSide = Math\.max\(sourceWidth, sourceHeight\)/);
  assert.match(source, /1400 \/ longSide/, 'sisi terpanjang dibatasi ~1400 px');
});

test('flash putih saat jepret benar-benar penuh dan tidak teredupkan transisi lambat', () => {
  assert.match(source, /setTimeout\(\(\) => setFlash\(false\), 350\)/);
  assert.match(source, /bg-white z-\[100\][^`]*duration-0/);
  assert.match(source, /\$\{flash \? 'opacity-100' : 'opacity-0'\}/);
});

test('hasil jepretan disimpan tanpa mirror dan memakai seluruh frame kamera', () => {
  assert.match(source, /photoCanvas\.getContext\('2d'\)/);
  assert.match(source, /photoCtx\.translate\(photoCanvas\.width, 0\)/);
  assert.match(source, /photoCtx\.scale\(-1, 1\)/);
  assert.match(source, /photoCtx\.drawImage\(canvas, 0, 0\)/);
  assert.ok(source.includes("photoCanvas.toDataURL('image/jpeg', 0.95)"));
});

test('preview pemotretan tidak memotong area kamera dengan object-cover', () => {
  assert.match(source, /id="camera-preview"[^>]*object-contain/);
  assert.doesNotMatch(source, /id="camera-preview"[^>]*object-cover/);
});

test('bingkai panduan di layar tetap ada sebagai petunjuk visual', () => {
  assert.match(source, /guideFrameStyle\(\)/, 'bingkai harus memakai SCAN_GUIDE');
  assert.match(source, /Posisikan bukti bayar di area ini/);
});

test('rasio kotak preview sejajar dengan bingkai panduan', () => {
  assert.match(
    source,
    /aspectRatio:\s*`\$\{SCAN_GUIDE\.widthRatio\} \/ \$\{SCAN_GUIDE\.heightRatio\}`/,
    'kotak preview memakai rasio yang sama dengan bingkai, jadi yang dilihat = yang difoto'
  );
});
