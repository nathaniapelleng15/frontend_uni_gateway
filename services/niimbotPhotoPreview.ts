import { NiimbotPrinter, type PrintAdjustments, type LabelSize } from './niimbotPrinter.ts';
import { paintPrintImage, type PrintSlot } from './printImage.ts';
import { B1_PRO_PRINTHEAD_PX } from './labelGeometry.ts';

export interface NiimbotPreviewSettings {
  size: LabelSize;
  adjustments: PrintAdjustments;
}

/** Same first-stage slot crop as generatePrintImage, then the production
 * Niimbot renderer. `matchPhotoCrop` is display-only: it keeps the color slot's
 * crop/aspect, converts the photo to continuous grayscale (no 1-bit dithering),
 * and omits physical paper margins. The normal printer preview remains dithered. */
export async function prepareNiimbotPhotoPreview(
  source: string, slot: PrintSlot, settings: NiimbotPreviewSettings,
  mode: 'monochrome' | 'color' = 'monochrome',
  matchPhotoCrop = false,
): Promise<HTMLCanvasElement> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Foto preview Niimbot gagal dimuat.'));
    img.src = source;
  });
  const crop = document.createElement('canvas');
  crop.width = slot.width;
  crop.height = slot.height;
  const ctx = crop.getContext('2d');
  if (!ctx) throw new Error('Canvas preview Niimbot tidak tersedia.');
  paintPrintImage(ctx, image, slot);
  if (!matchPhotoCrop) {
    return new NiimbotPrinter().prepareCanvas(crop.toDataURL('image/png'), settings.size, settings.adjustments, mode);
  }

  // Presentation-only grayscale: keep intermediate tones for a clean, smooth
  // preview. The physical printer path still performs one-bit dithering.
  const grayscale = document.createElement('canvas');
  grayscale.width = crop.width;
  grayscale.height = crop.height;
  const grayscaleContext = grayscale.getContext('2d');
  if (!grayscaleContext) throw new Error('Canvas grayscale preview tidak tersedia.');
  grayscaleContext.filter = 'grayscale(100%)';
  grayscaleContext.drawImage(crop, 0, 0);

  // Presentation-only path: match the exact selected photo slot, not the
  // physical label box. Keep pixel density bounded by the B1 Pro print head,
  // but preserve the slot's aspect ratio and remove paper margins/offsets.
  const scale = Math.min(1, B1_PRO_PRINTHEAD_PX / slot.width);
  const widthPx = Math.max(1, Math.round(slot.width * scale));
  const heightPx = Math.max(1, Math.round(slot.height * scale));
  const previewSize: LabelSize = {
    widthPx,
    heightPx,
    requestedWidthPx: slot.width,
    clamped: scale < 1,
  };
  const previewAdjustments: PrintAdjustments = {
    ...settings.adjustments,
    fitMode: 'cover',
    marginTopPx: 0,
    marginRightPx: 0,
    marginLeftPx: 0,
    marginBottomPx: 0,
    offsetXPx: 0,
    offsetYPx: 0,
  };
  return new NiimbotPrinter().prepareCanvas(grayscale.toDataURL('image/png'), previewSize, previewAdjustments, 'color');
}

/** Match takePhoto's orientation and JPEG serialization without changing the
 * raw processing canvas used for capture, gestures and payment/OCR. */
export function snapshotNiimbotCamera(source: HTMLCanvasElement): string {
  const copy = document.createElement('canvas');
  copy.width = source.width;
  copy.height = source.height;
  const ctx = copy.getContext('2d');
  if (!ctx) throw new Error('Canvas kamera tidak tersedia.');
  ctx.translate(copy.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(source, 0, 0);
  return copy.toDataURL('image/jpeg', 0.95);
}
