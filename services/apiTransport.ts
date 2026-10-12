export const apiAdapterForProtocol = (protocol: string): 'fetch' | undefined =>
  protocol === 'app-photobooth:' ? 'fetch' : undefined;

// The bundled Electron UI is same-origin with its native API bridge.
// Keep the configured backend URL for display and for ordinary web deployments.
export const transportBaseUrl = (remoteBaseUrl: string, pageProtocol: string): string =>
  pageProtocol === 'app-photobooth:' && remoteBaseUrl === 'https://backend-photobooth.uniinside.net'
    ? 'app-photobooth://ui'
    : remoteBaseUrl;
