import { labelSize, labelMmFromPaperSize, labelFrameBox, printBox, B1_PRO_PRINTHEAD_PX, type LabelSize } from './labelGeometry.ts';

export interface PhotoLayout {
  width: number;
  height: number;
  slots: {x: number; y: number; width: number; height: number}[];
}
export interface PhotoBoxSettings {
  size: LabelSize;
  adjustments: {
    marginTopPx: number; marginRightPx: number; marginLeftPx: number; marginBottomPx: number;
    offsetXPx: number; offsetYPx: number;
  };
}

/** Capture/physical photo geometry only; never use this to compose Admin frames.
 * Never mutates Admin/printer settings. Until settings arrive, read the existing
 * calibrated label preset, not the Digital portrait slot. */
export function resolvePackagePhotoLayout(
  selectedPackage: string | null, digital: PhotoLayout, settings?: PhotoBoxSettings,
): PhotoLayout {
  if (selectedPackage !== 'print') return digital;
  const mm = labelMmFromPaperSize('nimbotpaper-polaroid');
  const size = settings?.size ?? labelSize(mm.widthMm, mm.heightMm);
  const fallback = labelFrameBox('nimbotpaper-polaroid')!;
  const adj = settings?.adjustments ?? {
    marginTopPx: fallback.topPx, marginRightPx: fallback.rightPx,
    marginLeftPx: fallback.leftPx, marginBottomPx: fallback.bottomPx,
    offsetXPx: 0, offsetYPx: 0,
  };
  const box = printBox(size.widthPx, size.heightPx,
    adj.marginTopPx, adj.marginRightPx, adj.marginLeftPx, adj.marginBottomPx,
    B1_PRO_PRINTHEAD_PX, adj.offsetXPx, adj.offsetYPx);
  return {width: size.widthPx, height: size.heightPx,
    slots: [{x: box.x, y: box.y, width: box.w, height: box.h}]};
}

export function assertPrintPhotoGeometryMatches(captured: PhotoLayout, current: PhotoLayout): void {
  if (JSON.stringify(captured) !== JSON.stringify(current)) {
    throw new Error('Pengaturan ukuran Niimbot berubah setelah foto diambil. Mulai sesi baru agar foto dan cetakan tetap sama; kalibrasi printer tidak diubah.');
  }
}

export interface CameraCropContext {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  drawImage(source: any, sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number): void;
}

/** Same natural orientation as Digital shutter, but one center-cover from FULL
 * processing pixels. Both live Print display and shutter call this function. */
export function paintPrintCameraCrop(
  ctx: CameraCropContext, source: {width: number; height: number},
  slot: {width: number; height: number},
): void {
  if (source.width <= 0 || source.height <= 0 || slot.width <= 0 || slot.height <= 0) return;
  const ratio = slot.width / slot.height;
  let sx = 0, sy = 0, sw = source.width, sh = source.height;
  if (sw / sh > ratio) { sw = sh * ratio; sx = (source.width - sw) / 2; }
  else { sh = sw / ratio; sy = (source.height - sh) / 2; }
  ctx.save();
  ctx.translate(slot.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, slot.width, slot.height);
  ctx.restore();
}

/** Hide old async render output immediately, before effect cleanup runs. */
export function preparedPhotoForKey(prepared: {key: string; url: string} | null, key: string): string | null {
  return prepared?.key === key ? prepared.url : null;
}
