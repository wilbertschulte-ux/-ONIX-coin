const fs = require('node:fs');
const dns = require('node:dns').promises;
const net = require('node:net');
const tls = require('node:tls');
const mongoose = require('mongoose');
const {
  createDeploymentIsolationConfig,
} = require('./deploymentIsolation');
const {
  checkWeeklyFortuneWheelReadiness,
  checkWeeklyFortuneWheelStorageReadiness,
} = require('./fortuneWheelWeeklyApi');

const EXPECTED_DATABASE = 'onix_staging';
const EXPECTED_MODE = 'weekly_random_v1';
const EXPECTED_CAMPAIGN_KEY = 'fortune-wheel-weekly-v1';
const EXPECTED_CONFIG_VERSION = 'weekly-random-v1';

class Stage9d2VerificationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'Stage9d2VerificationError';
    this.code = code;
  }
}

function fail(code) {
  throw new Stage9d2VerificationError(code);
}

function readEnv(path) {
  if (!path || !fs.existsSync(path)) fail('STAGING_ENV_FILE_REQUIRED');
  const result = {};
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const raw = match[2];
    result[match[1]] = (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) ? raw.slice(1, -1) : raw;
  }
  return result;
}

function exactBooleanFlag(value, name) {
  if (value !== 'true' && value !== 'false') fail(`${name}_INVALID`);
  return value === 'true';
}

function validateEnvironment(environment) {
  const isolation = createDeploymentIsolationConfig(environment);
  if (!isolation.staging) fail('STAGING_DEPLOYMENT_REQUIRED');
  if (isolation.mongoDatabase !== EXPECTED_DATABASE) fail('STAGING_DATABASE_MISMATCH');

  const allowedHosts = String(environment.STAGING_MONGODB_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (
    allowedHosts.length === 0 ||
    isolation.mongoHosts.length === 0 ||
    isolation.mongoHosts.some((host) => !allowedHosts.includes(host)) ||
    isolation.mongoHosts.some((host) => /(^|[.-])(prod|production)([.-]|$)/i.test(host)) ||
    isolation.mongoHosts.some((host) => !/(^|[.-])staging([.-]|$)/i.test(host))
  ) {
    fail('STAGING_MONGODB_TARGET_NOT_ISOLATED');
  }

  if (String(environment.FORTUNE_WHEEL_MODE || '') !== EXPECTED_MODE) {
    fail('FORTUNE_WHEEL_MODE_MISMATCH');
  }
  if (String(environment.FORTUNE_WHEEL_CAMPAIGN_KEY || '') !== EXPECTED_CAMPAIGN_KEY) {
    fail('FORTUNE_WHEEL_CAMPAIGN_KEY_MISMATCH');
  }
  if (String(environment.FORTUNE_WHEEL_CONFIG_VERSION || '') !== EXPECTED_CONFIG_VERSION) {
    fail('FORTUNE_WHEEL_CONFIG_VERSION_MISMATCH');
  }
  if (String(environment.FORTUNE_WHEEL_MIGRATION_WRITE_ENABLED || '') !== 'false') {
    fail('FORTUNE_WHEEL_MIGRATION_WRITE_MUST_BE_DISABLED');
  }

  const enabled = exactBooleanFlag(
    environment.FORTUNE_WHEEL_ENABLED,
    'FORTUNE_WHEEL_ENABLED'
  );
  const approved = exactBooleanFlag(
    environment.FORTUNE_WHEEL_CAMPAIGN_APPROVED,
    'FORTUNE_WHEEL_CAMPAIGN_APPROVED'
  );
  const eligibleIds = [...new Set(
    String(environment.FORTUNE_WHEEL_ELIGIBLE_TELEGRAM_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  )];
  if (eligibleIds.length !== 1 || !/^\d{5,20}$/.test(eligibleIds[0])) {
    fail('FORTUNE_WHEEL_STAGING_ALLOWLIST_INVALID');
  }
  const colors = [...new Set(
    String(environment.FORTUNE_WHEEL_IPHONE_COLORS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  )];
  if (colors.length === 0) fail('FORTUNE_WHEEL_COLOR_ALLOWLIST_EMPTY');

  return Object.freeze({ isolation, enabled, approved, eligibleCount: 1, colorCount: colors.length });
}

function canonicalCredential(value) {
  try {
    return encodeURIComponent(decodeURIComponent(value));
  } catch {
    fail('STAGING_MONGODB_CREDENTIALS_INVALID');
  }
}

async function expandValidatedSrvUri(uri, fetchImpl = globalThis.fetch) {
  if (!uri.startsWith('mongodb+srv://')) return uri;
  if (typeof fetchImpl !== 'function') fail('STAGING_DNS_RESOLVER_UNAVAILABLE');
  const parsed = new URL(uri);
  const originalHost = parsed.hostname.toLowerCase();
  const parentSuffix = originalHost.split('.').slice(1).join('.');
  if (!parentSuffix.includes('.')) fail('STAGING_MONGODB_HOST_INVALID');

  const query = async (name, type) => {
    const response = await fetchImpl(
      `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`
    );
    if (!response?.ok) fail(`STAGING_DNS_${type}_FAILED`);
    const payload = await response.json();
    if (payload?.Status !== 0) fail(`STAGING_DNS_${type}_FAILED`);
    return payload;
  };
  const [srv, txt] = await Promise.all([
    query(`_mongodb._tcp.${originalHost}`, 'SRV'),
    query(originalHost, 'TXT'),
  ]);
  const hosts = [...new Set((srv.Answer || []).map((record) => {
    const match = String(record.data || '').trim().match(/^\d+\s+\d+\s+(\d+)\s+([^\s]+)\.?$/);
    if (!match) fail('STAGING_DNS_SRV_INVALID');
    const port = Number(match[1]);
    const host = match[2].replace(/\.$/, '').toLowerCase();
    if (
      !Number.isInteger(port) || port < 1 || port > 65535 ||
      !host.endsWith(`.${parentSuffix}`) ||
      /(^|[.-])(prod|production)([.-]|$)/i.test(host)
    ) {
      fail('STAGING_DNS_SRV_TARGET_FORBIDDEN');
    }
    return `${host}:${port}`;
  }))];
  if (hosts.length === 0 || hosts.length > 20) fail('STAGING_DNS_SRV_INVALID');

  const txtOptions = (txt.Answer || [])
    .map((record) => String(record.data || '').replace(/^"|"$/g, '').replace(/"\s+"/g, ''))
    .filter(Boolean)
    .flatMap((entry) => entry.split('&'));
  for (const option of txtOptions) {
    const [key, value, extra] = option.split('=');
    if (
      extra !== undefined ||
      !['authSource', 'replicaSet', 'loadBalanced'].includes(key) ||
      !/^[A-Za-z0-9._-]{1,128}$/.test(value || '')
    ) {
      fail('STAGING_DNS_TXT_INVALID');
    }
  }
  const auth = parsed.username
    ? `${canonicalCredential(parsed.username)}:${canonicalCredential(parsed.password)}@`
    : '';
  const options = [...txtOptions, ...parsed.searchParams.entries()].map((entry) => (
    Array.isArray(entry) ? `${encodeURIComponent(entry[0])}=${encodeURIComponent(entry[1])}` : entry
  ));
  options.push('tls=true');
  return `mongodb://${auth}${hosts.join(',')}${parsed.pathname}?${options.join('&')}`;
}

function safeNetworkCode(error) {
  const code = String(error?.code || '');
  if (/^[A-Z0-9_]{3,80}$/.test(code)) return code;
  if (/ServerSelectionError$/.test(String(error?.name || ''))) {
    const nestedCodes = [...(error?.reason?.servers?.values?.() || [])]
      .map((server) => String(server?.error?.code || server?.error?.cause?.code || ''))
      .filter((value) => /^[A-Z0-9_]{3,80}$/.test(value));
    if (nestedCodes.length > 0) return [...new Set(nestedCodes)].sort().join('+');
    return 'MONGODB_SERVER_SELECTION_FAILED';
  }
  return safeErrorCode(error);
}

function seedEndpoints(expandedUri) {
  const remainder = expandedUri.replace(/^mongodb:\/\//, '');
  const authority = remainder.slice(0, remainder.indexOf('/'));
  const hosts = authority.slice(authority.lastIndexOf('@') + 1);
  return hosts.split(',').map((entry) => {
    const separator = entry.lastIndexOf(':');
    return { host: entry.slice(0, separator), port: Number(entry.slice(separator + 1)) };
  });
}

function probeTcp({ host, port }, timeoutMs = 7000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => finish({ ok: false, code: 'TCP_TIMEOUT' }));
    socket.once('connect', () => finish({ ok: true }));
    socket.once('error', (error) => finish({ ok: false, code: safeNetworkCode(error) }));
  });
}

function probeTls({ host, port }, timeoutMs = 7000) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => finish({ ok: false, code: 'TLS_TIMEOUT' }));
    socket.once('secureConnect', () => finish({
      ok: socket.authorized === true,
      code: socket.authorized === true ? 'TLS_OK' : 'TLS_CERTIFICATE_REJECTED',
      protocol: socket.getProtocol() || 'unknown',
    }));
    socket.once('error', (error) => finish({ ok: false, code: safeNetworkCode(error) }));
  });
}

async function diagnoseNetwork(verified) {
  const originalHost = new URL(verified.isolation.mongoUri).hostname;
  const native = {};
  try {
    native.srvRecords = (await dns.resolveSrv(`_mongodb._tcp.${originalHost}`)).length;
    native.srv = 'PASS';
  } catch (error) {
    native.srv = safeNetworkCode(error);
  }
  try {
    native.txtRecords = (await dns.resolveTxt(originalHost)).length;
    native.txt = 'PASS';
  } catch (error) {
    native.txt = safeNetworkCode(error);
  }

  let expandedUri;
  try {
    expandedUri = await expandValidatedSrvUri(verified.isolation.mongoUri);
  } catch (error) {
    return { nativeDns: native, validatedDoh: { status: safeNetworkCode(error) } };
  }
  const endpoints = seedEndpoints(expandedUri);
  const probes = [];
  for (const endpoint of endpoints) {
    let addresses = 0;
    let dnsCode = 'PASS';
    try {
      addresses = (await dns.lookup(endpoint.host, { all: true })).length;
    } catch (error) {
      dnsCode = safeNetworkCode(error);
    }
    const tcp = await probeTcp(endpoint);
    const tlsResult = tcp.ok ? await probeTls(endpoint) : { ok: false, code: 'TCP_NOT_READY' };
    probes.push({ addresses, dns: dnsCode, tcp, tls: tlsResult });
  }

  let mongo = { status: 'NOT_ATTEMPTED' };
  const connection = mongoose.createConnection();
  try {
    await connection.openUri(expandedUri, {
      dbName: verified.isolation.mongoDatabase,
      family: 4,
      serverSelectionTimeoutMS: 15000,
      autoCreate: false,
      autoIndex: false,
    });
    await connection.db.command({ ping: 1 });
    mongo = { status: 'PASS' };
  } catch (error) {
    mongo = { status: safeNetworkCode(error) };
  } finally {
    await connection.close().catch(() => {});
  }

  const errorCodes = (field) => [...new Set(
    probes.filter((probe) => !probe[field].ok).map((probe) => probe[field].code)
  )].sort();
  return {
    nativeDns: native,
    validatedDoh: { status: 'PASS', seedCount: endpoints.length },
    nodeDns: {
      resolved: probes.filter((probe) => probe.addresses > 0).length,
      total: probes.length,
      errorCodes: [...new Set(probes.filter((probe) => probe.dns !== 'PASS').map((probe) => probe.dns))],
    },
    tcp: { reachable: probes.filter((probe) => probe.tcp.ok).length, total: probes.length, errorCodes: errorCodes('tcp') },
    tls: { ready: probes.filter((probe) => probe.tls.ok).length, total: probes.length, errorCodes: errorCodes('tls') },
    mongo,
  };
}

async function main() {
  const envPath = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
  const validateOnly = process.argv.includes('--validate-only');
  const diagnoseOnly = process.argv.includes('--diagnose-network');
  const env = readEnv(envPath);
  const verified = validateEnvironment(env);
  if (validateOnly) {
    process.stdout.write(`${JSON.stringify({
      staging: true,
      database: verified.isolation.mongoDatabase,
      mode: EXPECTED_MODE,
      campaignKey: EXPECTED_CAMPAIGN_KEY,
      migrationWriteEnabled: false,
      enabled: verified.enabled,
      approved: verified.approved,
      eligibleCount: verified.eligibleCount,
      colorCount: verified.colorCount,
    }, null, 2)}\n`);
    return;
  }
  if (diagnoseOnly) {
    process.stdout.write(`${JSON.stringify(await diagnoseNetwork(verified), null, 2)}\n`);
    return;
  }
  const mongoUri = await expandValidatedSrvUri(verified.isolation.mongoUri);
  await mongoose.connect(mongoUri, {
    dbName: verified.isolation.mongoDatabase,
    family: 4,
    serverSelectionTimeoutMS: 15000,
    autoCreate: false,
    autoIndex: false,
  });
  const db = mongoose.connection.db;
  if (db.databaseName !== EXPECTED_DATABASE) fail('CONNECTED_DATABASE_MISMATCH');
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  let indexes = 0;
  for (const { name } of collections) indexes += (await db.collection(name).indexes()).length;
  const legacy = await db.collection('fortune_wheel_progress').findOne({ campaignKey: 'fortune-wheel-staging-v1' });
  const request = await db.collection('physical_prize_requests').findOne({ campaignKey: 'fortune-wheel-staging-v1' });
  const entitlement = await db.collection('fortune_wheel_prize_entitlements').findOne({ campaignKey: 'fortune-wheel-staging-v1' });
  const inventory = await db.collection('fortune_wheel_prize_inventory').findOne({ campaignKey: 'fortune-wheel-weekly-v1', prizeCode: 'iphone_duo' });
  const user = legacy ? await db.collection('users').findOne({ telegramId: legacy.telegramId }) : null;
  const weeklyProgress = await db.collection('fortune_wheel_progress').countDocuments({ campaignKey: 'fortune-wheel-weekly-v1' });
  const weeklyClaims = await db.collection('fortune_wheel_progress').aggregate([
    { $match: { campaignKey: 'fortune-wheel-weekly-v1' } },
    { $project: { count: { $size: { $ifNull: ['$claims', []] } } } },
    { $group: { _id: null, count: { $sum: '$count' } } },
  ]).toArray();
  const storage = await checkWeeklyFortuneWheelStorageReadiness({ connection: mongoose.connection });
  const runtime = await checkWeeklyFortuneWheelReadiness({ connection: mongoose.connection, environment: env });
  process.stdout.write(`${JSON.stringify({
    database: db.databaseName,
    collections: collections.length,
    indexes,
    storage: { ready: storage.ready, code: storage.code },
    runtime: { ready: runtime.ready, mode: runtime.mode, code: runtime.code },
    campaign: {
      enabled: verified.enabled,
      approved: verified.approved,
      eligibleCount: verified.eligibleCount,
      colorCount: verified.colorCount,
    },
    weeklyProgress,
    weeklyClaims: weeklyClaims[0]?.count || 0,
    inventory: inventory && { capacity: inventory.capacity, reserved: inventory.reserved, fulfilled: inventory.fulfilled },
    legacy: legacy && { claims: Array.isArray(legacy.claims) ? legacy.claims.length : 0 },
    request: request && { status: request.status },
    entitlement: entitlement && { status: entitlement.status, slot: entitlement.slot },
    user: user && { balance: user.balance, transactions: Array.isArray(user.transactions) ? user.transactions.length : 0 },
  }, null, 2)}\n`);
  await mongoose.disconnect();
}

function safeErrorCode(error) {
  if ([18, 8000].includes(Number(error?.code))) return 'MONGODB_AUTH_FAILED';
  if (error?.code && /^[A-Z0-9_]{3,80}$/.test(String(error.code))) return String(error.code);
  if (/ServerSelectionError$/.test(String(error?.name || ''))) {
    return 'MONGODB_SERVER_SELECTION_FAILED';
  }
  if (error?.name === 'MongoParseError') return 'MONGODB_URI_INVALID';
  if (error?.name === 'MongoNetworkError') return 'MONGODB_NETWORK_FAILED';
  return 'STAGING_VERIFICATION_FAILED';
}

if (require.main === module) {
  main().catch(async (error) => {
    process.stderr.write(`Stage9d2VerificationError: ${safeErrorCode(error)}\n`);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = {
  EXPECTED_CAMPAIGN_KEY,
  EXPECTED_CONFIG_VERSION,
  EXPECTED_DATABASE,
  EXPECTED_MODE,
  Stage9d2VerificationError,
  diagnoseNetwork,
  expandValidatedSrvUri,
  readEnv,
  safeErrorCode,
  validateEnvironment,
};
