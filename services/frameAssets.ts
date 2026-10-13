type FramePayload = Record<string, any> | null | undefined;

const assetRoot = (apiBaseUrl: string): string => String(apiBaseUrl || '')
  .trim()
  .replace(/\/api\/v1(?:\/kiosk)?$/i, '')
  .replace(/\/+$/, '');

const relativeAdminAsset = (config: FramePayload): string | undefined => {
  const candidate = config?.overlayUrl ?? config?.overlay_url ?? config?.asset_file_url;
  return typeof candidate === 'string' && /^\/?uploads\//i.test(candidate.trim())
    ? candidate.trim()
    : undefined;
};

/**
 * Resolve Admin artwork against the backend currently serving kiosk templates.
 * Some local backends advertise PUBLIC_BASE_URL from another deployment in the
 * absolute style URL, while the canonical layout config has the local upload
 * path. Use that path only when the advertised host differs from the active
 * HTTP(S) backend; preserve external URLs and the Electron bridge otherwise.
 */
export const resolveFrameArtworkUrl = (
  style: FramePayload,
  config: FramePayload,
  apiBaseUrl: string,
): string | undefined => {
  const root = assetRoot(apiBaseUrl);
  const advertised = style?.overlayUrl ?? style?.overlay_url;
  const localPath = relativeAdminAsset(config);
  if (localPath && typeof advertised === 'string' && /^https?:\/\//i.test(advertised)
    && /^https?:\/\//i.test(root)) {
    try {
      if (new URL(advertised).origin !== new URL(root).origin) {
        return `${root}/${localPath.replace(/^\/+/, '')}`;
      }
    } catch { /* fall back to ordinary URL resolution below */ }
  }

  const background = style?.backgroundConfig ?? style?.background_config ?? style?.background
    ?? config?.backgroundConfig ?? config?.background_config ?? config?.background;
  const candidates = [
    style?.overlayUrl, style?.overlay_url,
    style?.backgroundImageUrl, style?.background_image_url,
    background?.imageUrl, background?.image_url, background?.fileUrl, background?.file_url,
    background?.url, background?.src,
    style?.assetUrl, style?.asset_url, style?.asset_file_url,
    style?.imageUrl, style?.image_url,
    config?.overlayUrl, config?.overlay_url,
    config?.backgroundImageUrl, config?.background_image_url,
    config?.assetUrl, config?.asset_url, config?.asset_file_url,
    config?.imageUrl, config?.image_url,
    style?.previewUrl, style?.preview_url, config?.previewUrl, config?.preview_url,
  ];
  const value = candidates.find((candidate): candidate is string =>
    typeof candidate === 'string' && candidate.trim().length > 0
  )?.trim();
  if (!value) return undefined;
  if (/^(?:https?:|data:|blob:)/i.test(value)) return value;
  return root ? `${root}/${value.replace(/^\/+/, '')}` : value;
};

/** Old unscoped pb_frames snapshots can belong to a completely different API. */
export const frameCacheStorageKey = (baseUrl: string, kioskId: string): string =>
  `pb_frames:${encodeURIComponent(String(baseUrl || '').trim().toLowerCase())}:${encodeURIComponent(String(kioskId || '').trim())}`;

export const shouldRefreshFrameCatalog = (step: string, visibilityState: string): boolean =>
  visibilityState === 'visible' && (step === 'LANDING' || step === 'EDIT');

export const isSelectedFrameAvailable = (
  availableStyles: FramePayload[] | null | undefined,
  selectedFrame: FramePayload,
): boolean => Boolean(selectedFrame?.id != null && availableStyles?.some(
  (style) => style?.id != null && String(style.id) === String(selectedFrame.id)
));

export const staleFrameSyncWarning = (): string =>
  'Sinkronisasi frame Admin gagal. Kiosk menampilkan data tersimpan; tekan Retry atau periksa koneksi.';
