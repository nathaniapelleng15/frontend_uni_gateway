import React, {useEffect, useRef, useState} from 'react';
import {paintPrintCameraCrop} from '../services/printPhotoGeometry';

/** Display-only canvas. Raw processing pixels continue serving OCR/segmentation
 * and gestures; no image serialization, printer renderer or hardware mutation. */
export default function PrintCameraPreview({sourceRef, slot, fillPortrait = false}: {
  sourceRef: React.RefObject<HTMLCanvasElement | null>;
  slot: {width: number; height: number};
  fillPortrait?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLCanvasElement>(null);
  const [bounds, setBounds] = useState({width: 0, height: 0});
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setBounds({width: host.clientWidth, height: host.clientHeight});
    const observer = new ResizeObserver(update);
    observer.observe(host);
    update();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let request = 0;
    const draw = () => {
      const source = sourceRef.current;
      const display = displayRef.current;
      const ctx = display?.getContext('2d');
      if (source && ctx && source.width && source.height) paintPrintCameraCrop(ctx, source, slot);
      request = requestAnimationFrame(draw);
    };
    request = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(request);
  }, [sourceRef, slot.width, slot.height]);
  const width = Math.min(bounds.width, bounds.height * slot.width / slot.height);
  const height = width * slot.height / slot.width;
  return <div ref={hostRef} className="absolute inset-0 flex items-center justify-center">
    <div id="print-camera-photo-box" className="relative overflow-hidden portrait:!w-full portrait:!h-full" style={fillPortrait ? {width: '100%', height: '100%'} : {width, height, aspectRatio: `${slot.width} / ${slot.height}`}}>
      <canvas id="camera-preview" ref={displayRef} width={slot.width} height={slot.height}
        data-photo-width={slot.width} data-photo-height={slot.height} className={`block w-full h-full ${fillPortrait ? 'object-cover' : 'object-contain portrait:object-cover'}`} />
      <div id="print-camera-guide" className="absolute inset-0 pointer-events-none border-2 border-white/50 border-dashed rounded-lg" />
    </div>
  </div>;
}
