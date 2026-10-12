export const resolveBackendBaseUrl = (
  buildTimeUrl: unknown,
  savedUrl: unknown,
  fallback = 'http://localhost:8000',
): string => {
  const normalize = (value: unknown): string => String(value || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/v1(?:\/kiosk)?$/i, '')
    .replace(/\/+$/, '');

  return normalize(buildTimeUrl) || normalize(savedUrl) || fallback;
};
