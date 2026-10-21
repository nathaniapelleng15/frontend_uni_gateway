import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as geometry from './printPhotoGeometry.ts';
import { labelSize, labelFrameBox, printBox, B1_PRO_PRINTHEAD_PX } from './labelGeometry.ts';

test('Print presentation fallback is the calibrated photo box, Digital retains its original layout', () => {
  const digital = {width: 728, height: 1088, slots: [{x: 50, y: 100, width: 628, height: 782}]};
  assert.equal(typeof geometry.resolvePackagePhotoLayout, 'function', 'missing package-specific photo geometry');
  assert.equal(geometry.resolvePackagePhotoLayout('digital', digital), digital);
  assert.deepEqual(geometry.resolvePackagePhotoLayout('print', digital), {
    width: 638, height: 791, slots: [{x: 0, y: 71, width: 555, height: 555}],
  });
});

test('authenticated size, margins, offsets match physical printBox without mutation', () => {
  const settings = {size: labelSize(54, 67), adjustments: {
    marginTopPx: 80, marginRightPx: 100, marginLeftPx: 5, marginBottomPx: 140,
    offsetXPx: 7, offsetYPx: -4,
  }};
  const before = JSON.stringify(settings);
  const layout = geometry.resolvePackagePhotoLayout('print', {width: 1, height: 1, slots: []}, settings);
  const box = printBox(638, 791, 80, 100, 5, 140, B1_PRO_PRINTHEAD_PX, 7, -4);
  assert.deepEqual(layout.slots[0], {x: box.x, y: box.y, width: box.w, height: box.h});
  assert.equal(JSON.stringify(settings), before);
});

test('Print camera and shutter center-cover the full processing canvas once with identical natural orientation', () => {
  assert.equal(typeof geometry.paintPrintCameraCrop, 'function', 'missing canonical Print capture painter');
  const calls: any[] = [];
  const ctx = {save: () => calls.push(['save']), restore: () => calls.push(['restore']),
    translate: (...args: number[]) => calls.push(['translate', ...args]),
    scale: (...args: number[]) => calls.push(['scale', ...args]),
    drawImage: (...args: any[]) => calls.push(['drawImage', ...args])};
  const source = {width: 1920, height: 1080};
  const slot = {width: 555, height: 555};
  geometry.paintPrintCameraCrop(ctx, source, slot);
  assert.deepEqual(calls, [['save'], ['translate', 555, 0], ['scale', -1, 1],
    ['drawImage', source, 420, 0, 1080, 1080, 0, 0, 555, 555], ['restore']]);
  calls.length = 0;
  geometry.paintPrintCameraCrop(ctx, {width: 1080, height: 1920}, slot);
  assert.deepEqual(calls[3].slice(2), [0, 420, 1080, 1080, 0, 0, 555, 555]);
  calls.length = 0;
  geometry.paintPrintCameraCrop(ctx, {width: 555, height: 555}, slot);
  assert.deepEqual(calls[3].slice(2), [0, 0, 555, 555, 0, 0, 555, 555]);
});

test('prepared mono photo cannot leak across source, settings or geometry revisions', () => {
  assert.equal(typeof geometry.preparedPhotoForKey, 'function');
  const prepared = {key: 'photo-A:box-555:settings-A', url: 'mono-A'};
  assert.equal(geometry.preparedPhotoForKey(prepared, prepared.key), 'mono-A');
  for (const key of ['photo-B:box-555:settings-A', 'photo-A:box-500:settings-A', 'photo-A:box-555:settings-B']) {
    assert.equal(geometry.preparedPhotoForKey(prepared, key), null);
  }
  assert.equal(geometry.preparedPhotoForKey(null, prepared.key), null);
});
