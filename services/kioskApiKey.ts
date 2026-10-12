export const parseAdminKioskCredentials = (value: unknown): { apiKey: string; kioskId?: string } => {
  const raw = String(value || '').trim();
  const token = raw.match(/(?:^|\s|DEVICE_ID=[^\s]*?)DEVICE_TOKEN\s*=\s*([^\s=]+)/i)
    || raw.match(/^DEVICE_TOKEN\s*=\s*([^\s=]+)/i);
  if (token) {
    const kioskId = raw.match(/DEVICE_ID\s*=\s*([^\s=]*?)(?=DEVICE_TOKEN|\s|$)/i)?.[1];
    return { apiKey: token[1], ...(kioskId ? { kioskId } : {}) };
  }
  if (/\bDEVICE_(?:ID|TOKEN)\s*=/i.test(raw)) return { apiKey: '' };
  return { apiKey: raw };
};

export const isUsableKioskApiKey = (value: unknown): boolean => {
  const apiKey = String(value || '').trim();
  return Boolean(apiKey)
    && !/[\s=]/.test(apiKey)
    && !/^<[^>]+>$/.test(apiKey)
    && !/(API_KEY_KIOSK_DARI_ADMIN|YOUR[_ -]?API[_ -]?KEY|CHANGE[_ -]?ME|REPLACE[_ -]?ME|PLACEHOLDER)/i.test(apiKey);
};

/** An operator-entered key must never be overridden by credentials baked into a build. */
export const selectKioskApiKey = (...candidates: unknown[]): string =>
  candidates.map(value => parseAdminKioskCredentials(value).apiKey).find(isUsableKioskApiKey) || '';

