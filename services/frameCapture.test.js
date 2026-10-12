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

test('preview pemotretan Print memakai kanvas kamera langsung yang sama dengan Digital', () => {
  assert.match(source, /renderCameraLivePreview = \(\) => <canvas id="camera-preview" ref=\{processingCanvasRef\}/);
  assert.match(source, /w-full h-full object-contain transform scale-x-\[-1\]/);
  assert.ok(!source.includes('NiimbotPhotoPreview id="camera-preview"'), 'stream langsung tidak boleh diproses ulang menjadi preview Niimbot');
});

test('Print and Digital share the capture preview frame and live guide', () => {
  assert.ok(source.includes('{renderCameraLivePreview()}'), 'both packages use one common live preview node');
  assert.ok(!source.includes('selectedPackage === \'print\' ? <div className="absolute inset-0 flex items-center justify-center p-4">'),
    'Print must not add a private padding/centering wrapper');
  assert.ok(source.includes('{step === \'CAPTURE\' && selectedLayoutId && (() => {'),
    'capture framing guide is shared, not package-specific');
  assert.ok(!source.includes('selectedPackage === \'digital\' && step === \'CAPTURE\' && selectedLayoutId'),
    'Print must get the same live frame guide as Digital');
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
