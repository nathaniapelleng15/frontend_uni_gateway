import React, { useEffect, useState } from 'react';
import { prepareNiimbotPhotoPreview, snapshotNiimbotCamera, type NiimbotPreviewSettings } from '../services/niimbotPhotoPreview';
import type { PrintSlot } from '../services/printImage';

const preparedPhotos = new Map<string, Promise<string>>();

interface Props {
  id?: string;
  alt: string;
  source?: string;
  liveSource?: React.RefObject<HTMLCanvasElement | null>;
  active?: boolean;
  slot: PrintSlot;
  settings: NiimbotPreviewSettings;
  maxHeight?: string;
  color?: boolean;
  frameAspectRatio?: number;
  matchPhotoCrop?: boolean;
  onPrepared?: (url: string) => void;
  renderOnly?: boolean;
}

export default function NiimbotPhotoPreview({id, alt, source, liveSource, active=true, slot, settings, maxHeight, color=false, frameAspectRatio, matchPhotoCrop=false, onPrepared, renderOnly=false}: Props) {
  const [prepared, setPrepared] = useState<{key:string;url:string} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settingsKey = JSON.stringify({slot,settings,mode:color?'color':'monochrome',matchPhotoCrop});
  const key = `${settingsKey}:${source || 'live'}`;
  useEffect(() => {
    let cancelled=false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setError(null);
    if (!active) return;
    const render = async () => {
      try {
        const camera = liveSource?.current;
        if (!source && (!camera || camera.width<1 || camera.height<1)) {
          timer=setTimeout(render,100);return;
        }
        const raw = source || snapshotNiimbotCamera(camera!);
        let job = source ? preparedPhotos.get(key) : undefined;
        if (!job) {
          job=prepareNiimbotPhotoPreview(raw,slot,settings,color?'color':'monochrome',matchPhotoCrop).then(canvas=>canvas.toDataURL('image/png'));
          if (source) {
            if (preparedPhotos.size>=20) preparedPhotos.delete(preparedPhotos.keys().next().value!);
            preparedPhotos.set(key,job);
            job.catch(()=>preparedPhotos.delete(key));
          }
        }
        const url=await job;
        if (!cancelled) {
          setPrepared({key,url});
          onPrepared?.(url);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Preview cetak gagal.');
      }
      // Serial rendering: never queue up camera frames or touch Bluetooth.
      if (!cancelled && !source) timer=setTimeout(render,100);
    };
    void render();
    return () => { cancelled=true;if(timer) clearTimeout(timer); };
  },[key,liveSource,active,onPrepared]);
  if (renderOnly) return null;
  const paperRatio=settings.size.widthPx/settings.size.heightPx;
  const displayRatio=frameAspectRatio && Number.isFinite(frameAspectRatio) && frameAspectRatio>0 ? frameAspectRatio : paperRatio;
  const url=prepared?.key===key ? prepared.url : undefined;
  return (
    <div className={`relative w-full shrink-0 overflow-hidden bg-white ${frameAspectRatio ? '' : 'rounded-xl'}`} style={{aspectRatio:`${displayRatio}`,maxWidth:maxHeight ? `calc(${maxHeight} * ${displayRatio})` : undefined}}>
      {url ? <img id={id} alt={alt} src={url} data-original-src={source} data-paper-width={settings.size.widthPx} data-paper-height={settings.size.heightPx} className="absolute inset-0 h-full w-full object-contain" /> :
        <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-sm text-gray-700" role="status">{error || 'Menyiapkan preview Niimbot…'}</div>}
    </div>
  );
}
