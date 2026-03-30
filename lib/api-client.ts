const DEFAULT_API_BASE_URL = 'http://63.179.106.186:5000/api';

function normalizeApiBaseUrl(value?: string) {
  const candidate = (value ?? '').trim();
  if (!candidate) {
    return DEFAULT_API_BASE_URL;
  }

  try {
    const normalized = new URL(candidate).toString().replace(/\/$/, '');
    return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
  } catch {
    return DEFAULT_API_BASE_URL;
  }
}

export const API_BASE_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
