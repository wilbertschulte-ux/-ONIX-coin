export const PRODUCTION_API_URL = 'https://onix-coin.onrender.com/api/coins';

type ApiUrlConfiguration = {
  configuredUrl?: string;
  deployEnvironment?: string;
  hostingEnvironment?: string;
  productionBuild: boolean;
};

const NON_PRODUCTION_ENVIRONMENTS = new Set([
  'development',
  'preview',
  'staging',
  'test',
]);

function normalizeEnvironment(value?: string) {
  return String(value || '').trim().toLowerCase();
}

function normalizeConfiguredUrl(value: string) {
  const rawUrl = value.trim();
  if (!rawUrl) return '';
  if (rawUrl.length > 2048) {
    throw new Error('VITE_API_URL is too long');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('VITE_API_URL must be an absolute URL');
  }

  const localHttp =
    parsed.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !localHttp) {
    throw new Error('VITE_API_URL must use HTTPS outside local development');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('VITE_API_URL must not contain credentials, query parameters, or fragments');
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, '');
  if (!normalizedPath.endsWith('/api/coins')) {
    throw new Error('VITE_API_URL must point to the /api/coins API base');
  }

  parsed.pathname = normalizedPath;
  return parsed.toString().replace(/\/$/, '');
}

export function resolveApiBaseUrl({
  configuredUrl,
  deployEnvironment,
  hostingEnvironment,
  productionBuild,
}: ApiUrlConfiguration) {
  const explicitEnvironment = normalizeEnvironment(deployEnvironment);
  const platformEnvironment = normalizeEnvironment(hostingEnvironment);
  // The hosting provider context is authoritative so a preview deployment cannot
  // be relabelled as production through a mistakenly configured VITE variable.
  const environment = platformEnvironment || explicitEnvironment;

  if (
    environment &&
    environment !== 'production' &&
    !NON_PRODUCTION_ENVIRONMENTS.has(environment)
  ) {
    throw new Error(`Unsupported frontend deployment environment: ${environment}`);
  }

  const normalizedUrl = normalizeConfiguredUrl(String(configuredUrl || ''));
  if (normalizedUrl) {
    const configuredOrigin = new URL(normalizedUrl).origin;
    const productionOrigin = new URL(PRODUCTION_API_URL).origin;
    if (environment !== 'production' && configuredOrigin === productionOrigin) {
      throw new Error('Non-production frontend cannot use the production API');
    }
    return normalizedUrl;
  }

  if (productionBuild && environment === 'production') {
    return PRODUCTION_API_URL;
  }

  throw new Error(
    'VITE_API_URL is required for development, preview, and staging builds'
  );
}
