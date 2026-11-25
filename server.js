// server.js
require('dotenv').config();

const express = require('express');
const compression = require('compression');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================
//  CONFIG
// ========================
const BASE_API = process.env.BASE_API || 'https://sciencefunapi.classx.co.in';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef';
const CLIENT_ID = process.env.CLIENT_ID || '';
const CLIENT_SECRET = process.env.CLIENT_SECRET || '';
const REQUEST_TIMEOUT_MS = 20000;

const TTL = {
  folder: 5 * 60 * 1000,
  videos: 60 * 1000,
  subjects: 30 * 60 * 1000,
  videoDetails: 10 * 60 * 1000,
};

// ========================
//  TOKENS (server-only)
// ========================
const ACCOUNTS = {
  '733566': {
    token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjczMzU2NiIsInRpbWVzdGFtcCI6MTc5MDYwODA3MSwiaXZfdmVyIjo3LCJzZXNzaW9uIjoiZXlKMGVYQWlPaUpLVjFRaUxDSmhiR2NpT2lKSVV6STFOaUo5LmV5SnBaQ0k2SWpjek16VTJOaUlzSW1WdFlXbHNJam9pYzJGeWRHaGhhMjFoZEdoMWNqWTRNRUJuYldGcGJDNWpiMjBpTENKdVlXMWxJam9pVTJGeWRHaGhheUJOWVhSb2RYSWlMQ0owWlc1aGJuUlVlWEJsSWpvaWRYTmxjaUlzSW5SbGJtRnVkRTVoYldVaU9pSnpZMmxsYm1ObFpuVnVYMlJpSWl3aWRHVnVZVzUwU1dRaU9pSWlMQ0prYVhOd2IzTmhZbXhsSWpwbVlXeHpaWDAuR2g3S0lSQTVGRTlWMWhSMmE5Zl9ZbllCZEhMQlN2dGx6UmdSMjJwcXlnVSJ9.XpYS08YqcKcqZRdp8wYSxFWfG0VSuB9xfmJ3F0XH1LU',
    userId: '733566',
  },
  '714264': {
    token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjcxNDI2NCIsInRpbWVzdGFtcCI6MTc5MTMyMDQ5OSwiaXZfdmVyIjozNCwic2Vzc2lvbiI6ImV5SjBlWEFpT2lKS1YxUWlMQ0poYkdjaU9pSklVekkxTmlKOS5leUpwWkNJNklqY3hOREkyTkNJc0ltVnRZV2xzSWpvaVUwMUZXRUJIVFVGSlRDNURUMDBpTENKdVlXMWxJam9pYzIxbGVDSXNJblJsYm1GdWRGUjVjR1VpT2lKMWMyVnlJaXdpZEdWdVlXNTBUbUZ0WlNJNkluTmphV1Z1WTJWbWRXNWZaR0lpTENKMFpXNWhiblJKWkNJNklpSXNJbVJwYzNCdmMyRmliR1VpT21aaGJITmxmUS5Yak5CM2tvVEZ3elg2ckpla3hHYzhKMUhYVU1kMjZIUnBscnRPV3RvTi1NIn0.TrjUlWXttL7urT1PldVoWjW9UxK2KjugCWvND1J7SAo',
    userId: '714264',
  },
  '367839': {
    token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjM2NzgzOSIsInRpbWVzdGFtcCI6MTc5MTY1NDY0NiwiaXZfdmVyIjozMSwic2Vzc2lvbiI6ImV5SjBlWEFpT2lKS1YxUWlMQ0poYkdjaU9pSklVekkxTmlKOS5leUpwWkNJNklqTTJOemd6T1NJc0ltVnRZV2xzSWpvaU56QXhOREl6TWpJeE5rQm5iV0ZwYkM1amIyMGlMQ0p1WVcxbElqb2lSR2wyZVdFaUxDSjBaVzVoYm5SVWVYQmxJam9pZFhObGNpSXNJblJsYm1GdWRFNWhiV1VpT2lKelkybGxibU5sWm5WdVgyUmlJaXdpZEdWdVlXNTBTV1FpT2lJaUxDSmthWE53YjNOaFlteGxJanBtWVd4elpYMC5EeW9KY0tYZVZ1R19jZ01BQjNyd3lNR0lXTVpGZmtNZ2pqVU1GTkU2WFdjIn0._1ycmhFrmOnb6Sae6XGlYQFPEZIrNfr9-r58RPEBFJA',
    userId: '367839',
  },
};

const ACCOUNT_ORDER = ['733566', '367839', '714264'];
const deadTokens = new Map();
const DEAD_COOLDOWN = 10 * 60 * 1000;

// ========================
//  ENCRYPTION
// ========================
function decrypt(text) {
  try {
    if (typeof text !== 'string' || !text.includes(':')) return text;
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const enc = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let out = decipher.update(enc);
    out = Buffer.concat([out, decipher.final()]);
    return JSON.parse(out.toString());
  } catch {
    return null;
  }
}

// ========================
//  CACHE + DEDUP
// ========================
const cache = new Map();
const inFlight = new Map();

function cacheKey(endpoint, params) {
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  return `${endpoint}?${sorted}`;
}

function getCache(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() > e.expires) { cache.delete(key); return null; }
  return e.value;
}

function setCache(key, value, ttl) {
  cache.set(key, { value, expires: Date.now() + ttl });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache) if (now > v.expires) cache.delete(k);
}, 60 * 1000);

function dedupe(key, fn) {
  if (inFlight.has(key)) return inFlight.get(key);
  const p = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

// ========================
//  NATIVE FETCH WITH TIMEOUT
// ========================
async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ========================
//  SINGLE FETCH WITH RETRY
// ========================
async function tryFetch(endpoint, params, accountKey, retries = 2) {
  const account = ACCOUNTS[accountKey];
  if (!account) return { success: false, error: 'Unknown account', status: 400, account: accountKey };

  const dead = deadTokens.get(accountKey);
  if (dead && Date.now() - dead < DEAD_COOLDOWN) {
    return { success: false, error: 'Token in cooldown', status: 401, account: accountKey };
  }

  // Build URL with query string
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    qs.append(k, v === null || v === undefined ? '' : String(v));
  }
  const url = `${BASE_API}${endpoint}?${qs.toString()}`;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`🔗 [${accountKey}] GET ${endpoint}?${qs.toString()}`);

      const res = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${account.token}`,
          Accept: 'application/json',
          'User-Agent': 'okhttp/4.9.3',
          clientid: CLIENT_ID,
          clientsecret: CLIENT_SECRET,
        },
      });

      // Read raw text first — ClassX sometimes returns HTML errors, encrypted strings, or empty bodies
      const rawText = await res.text();

      if (!res.ok) {
        // 401/403 → token is bad, mark dead
        if (res.status === 401 || res.status === 403) {
          deadTokens.set(accountKey, Date.now());
          console.warn(`❌ [${accountKey}] ${endpoint} → ${res.status} (token dead)`);
          console.warn(`   Body: ${rawText.slice(0, 300)}`);
          return { success: false, error: `HTTP ${res.status}`, status: res.status, account: accountKey };
        }

        // 429 or 5xx → transient, retry
        if (attempt < retries && (res.status >= 500 || res.status === 429)) {
          const backoff = 300 * Math.pow(2, attempt);
          console.warn(`⏳ [${accountKey}] ${endpoint} → ${res.status}, retrying in ${backoff}ms`);
          await new Promise(r => setTimeout(r, backoff));
          lastError = { status: res.status, body: rawText };
          continue;
        }

        console.warn(`❌ [${accountKey}] ${endpoint} → ${res.status}`);
        console.warn(`   Body: ${rawText.slice(0, 300)}`);
        return { success: false, error: `HTTP ${res.status}: ${rawText.slice(0, 200)}`, status: res.status, account: accountKey };
      }

      // Empty body?
      if (!rawText || rawText.trim() === '') {
        console.warn(`⚠️  [${accountKey}] ${endpoint} → 200 but EMPTY body`);
        return { success: false, error: 'Empty response from upstream', status: 502, account: accountKey };
      }

      // Parse JSON
      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        // Maybe it's an encrypted string
        const d = decrypt(rawText);
        if (d !== null) {
          data = d;
        } else {
          console.warn(`⚠️  [${accountKey}] ${endpoint} → 200 but not JSON`);
          console.warn(`   Body: ${rawText.slice(0, 300)}`);
          return { success: false, error: 'Upstream returned non-JSON', status: 502, account: accountKey, rawPreview: rawText.slice(0, 300) };
        }
      }

      // Encrypted wrapper `{ encrypted: "iv:ct" }`
      if (data && typeof data === 'object' && data.encrypted) {
        const d = decrypt(data.encrypted);
        if (d !== null) data = d;
      }

      // Some ClassX endpoints wrap data in { status: 'success', data: ... }
      // — leave as-is, deepClean handles it.
      console.log(`✅ [${accountKey}] ${endpoint} → 200 (${rawText.length} bytes)`);
      deadTokens.delete(accountKey);
      return { success: true, data, status: 200, account: accountKey };

    } catch (err) {
      lastError = err;
      const isAbort = err.name === 'AbortError';
      console.warn(`❌ [${accountKey}] ${endpoint} → ${isAbort ? 'TIMEOUT' : err.message}`);

      if (attempt < retries && (isAbort || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
        const backoff = 300 * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }

      return {
        success: false,
        error: isAbort ? 'Request timeout' : err.message,
        status: isAbort ? 504 : 500,
        account: accountKey,
      };
    }
  }

  return {
    success: false,
    error: lastError?.message || `Failed after ${retries + 1} attempts`,
    status: lastError?.status || 500,
    account: accountKey,
  };
}

// ========================
//  FETCH WITH FALLBACK + CACHE + DEDUP
// ========================
async function fetchClassX(endpoint, params = {}, preferredAccount = null, ttl = 60_000) {
  const key = cacheKey(endpoint, params);

  const cached = getCache(key);
  if (cached) return { ...cached, cached: true };

  return dedupe(key, async () => {
    const order = preferredAccount
      ? [preferredAccount, ...ACCOUNT_ORDER.filter(k => k !== preferredAccount)]
      : ACCOUNT_ORDER;

    const attempts = [];
    for (const accountKey of order) {
      const result = await tryFetch(endpoint, params, accountKey);
      attempts.push({ account: accountKey, status: result.status, success: result.success });

      if (result.success) {
        const payload = { ...result, attempts };
        setCache(key, payload, ttl);
        return payload;
      }

      // Don't fall back on non-auth errors (404, 400, etc.)
      if (![401, 403].includes(result.status)) {
        return { ...result, attempts };
      }
    }

    return { success: false, error: 'All tokens failed', status: 401, attempts };
  });
}

// ========================
//  LEAK FILTER
// ========================
const LEAK_KEYS = new Set([
  'token', 'access_token', 'auth_token', 'bearer', 'bearer_token',
  'session', 'session_data', 'jwt', 'refresh_token',
  'email', 'user_email', 'mobile', 'phone', 'userid', 'user_id',
  'userid_str', 'user_id_str', 'password', 'secret', 'clientsecret', 'client_id',
]);

function deepClean(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(deepClean);
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (LEAK_KEYS.has(k.toLowerCase())) continue;
    out[k] = deepClean(v);
  }
  return out;
}

// ========================
//  MIDDLEWARE
// ========================
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// ========================
//  ROUTES
// ========================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    baseApi: BASE_API,
    nodeVersion: process.version,
    cacheSize: cache.size,
    inFlight: inFlight.size,
    deadTokens: [...deadTokens.entries()].map(([k, t]) => ({
      account: k,
      cooldownLeftMs: Math.max(0, DEAD_COOLDOWN - (Date.now() - t)),
    })),
    timestamp: new Date().toISOString(),
  });
});

// Raw diagnostic — returns exactly what upstream returns (still leak-filtered)
app.get('/api/debug/raw', async (req, res) => {
  const { endpoint, course_id, folder_id, video_id, video } = req.query;
  if (!endpoint || !course_id) {
    return res.status(400).json({ success: false, error: 'endpoint and course_id required' });
  }

  // Build known param sets for each supported endpoint
  const paramSets = {
    '/get/folder_contentsv3': { course_id, parent_id: folder_id || '', windowsapp: 0, start: 0 },
    '/get/get_previous_live_videos': { course_id, start: 0, folder_wise_course: 1, userid: -1 },
    '/get/allsubjectfrmlivecourseclass': { courseid: course_id, start: -1 },
    '/get/fetchVideoDetailsById': { course_id, video_id: video_id || video || '', ytflag: 0, folder_wise_course: 1, lc_app_api_url: '' },
  };

  const params = paramSets[endpoint];
  if (!params) return res.status(400).json({ success: false, error: `Unknown endpoint. Supported: ${Object.keys(paramSets).join(', ')}` });

  const result = await tryFetch(endpoint, params, ACCOUNT_ORDER[0]);
  res.json({
    success: result.success,
    endpoint,
    params,
    status: result.status,
    error: result.error,
    attempts: result.attempts,
    data: result.success ? deepClean(result.data) : undefined,
    rawPreview: result.rawPreview,
  });
});

app.get('/api/debug/test-tokens', async (req, res) => {
  const { course_id } = req.query;
  if (!course_id) return res.status(400).json({ success: false, error: 'course_id is required' });

  const results = {};
  for (const key of ACCOUNT_ORDER) {
    const r = await tryFetch('/get/folder_contentsv3', { course_id, parent_id: '', windowsapp: 0, start: 0 }, key);
    results[key] = {
      success: r.success,
      status: r.status,
      error: r.success ? undefined : r.error,
      bytes: r.success ? JSON.stringify(r.data).length : 0,
    };
  }
  res.json({ success: true, course_id, results });
});

// 1. Folder contents
app.get('/api/folder-contents', async (req, res) => {
  const { course_id, folder_id, account } = req.query;
  if (!course_id) return res.status(400).json({ success: false, error: 'course_id is required' });

  const result = await fetchClassX(
    '/get/folder_contentsv3',
    { course_id, parent_id: folder_id || '', windowsapp: 0, start: 0 },
    account || null,
    TTL.folder
  );

  if (!result.success) return res.status(result.status).json({ success: false, error: result.error, attempts: result.attempts });

  res.setHeader('X-Cache', result.cached ? 'HIT' : 'MISS');
  res.json({ success: true, data: deepClean(result.data) });
});

// 2. Previous live videos
app.get('/api/previous-live-videos', async (req, res) => {
  const { course_id, account } = req.query;
  if (!course_id) return res.status(400).json({ success: false, error: 'course_id is required' });

  const result = await fetchClassX(
    '/get/get_previous_live_videos',
    { course_id, start: 0, folder_wise_course: 1, userid: -1 },
    account || null,
    TTL.videos
  );

  if (!result.success) return res.status(result.status).json({ success: false, error: result.error, attempts: result.attempts });

  res.setHeader('X-Cache', result.cached ? 'HIT' : 'MISS');
  res.json({ success: true, data: deepClean(result.data) });
});

// 3. Subjects
app.get('/api/subjects', async (req, res) => {
  const { courseid, account } = req.query;
  if (!courseid) return res.status(400).json({ success: false, error: 'courseid is required' });

  const result = await fetchClassX(
    '/get/allsubjectfrmlivecourseclass',
    { courseid, start: -1 },
    account || null,
    TTL.subjects
  );

  if (!result.success) return res.status(result.status).json({ success: false, error: result.error, attempts: result.attempts });

  res.setHeader('X-Cache', result.cached ? 'HIT' : 'MISS');
  res.json({ success: true, data: deepClean(result.data) });
});

// 4. Video details
app.get('/api/video-details', async (req, res) => {
  const { course_id, video_id, account } = req.query;
  if (!course_id || !video_id) {
    return res.status(400).json({ success: false, error: 'course_id and video_id are required' });
  }

  const result = await fetchClassX(
    '/get/fetchVideoDetailsById',
    { course_id, video_id, ytflag: 0, folder_wise_course: 1, lc_app_api_url: '' },
    account || null,
    TTL.videoDetails
  );

  if (!result.success) return res.status(result.status).json({ success: false, error: result.error, attempts: result.attempts });

  res.setHeader('X-Cache', result.cached ? 'HIT' : 'MISS');
  res.json({ success: true, data: deepClean(result.data) });
});

// 5. Course overview (parallel)
app.get('/api/course-overview', async (req, res) => {
  const { course_id, account } = req.query;
  if (!course_id) return res.status(400).json({ success: false, error: 'course_id is required' });

  const [folders, live, subjects] = await Promise.all([
    fetchClassX('/get/folder_contentsv3', { course_id, parent_id: '', windowsapp: 0, start: 0 }, account || null, TTL.folder),
    fetchClassX('/get/get_previous_live_videos', { course_id, start: 0, folder_wise_course: 1, userid: -1 }, account || null, TTL.videos),
    fetchClassX('/get/allsubjectfrmlivecourseclass', { courseid: course_id, start: -1 }, account || null, TTL.subjects),
  ]);

  res.json({
    success: true,
    course_id,
    fetchedAt: new Date().toISOString(),
    results: {
      folder_contents: folders.success ? deepClean(folders.data) : { error: folders.error },
      previous_live_videos: live.success ? deepClean(live.data) : { error: live.error },
      subjects: subjects.success ? deepClean(subjects.data) : { error: subjects.error },
    },
  });
});

// ========================
//  ERROR HANDLER
// ========================
app.use((err, req, res, next) => {
  console.error('Unhandled:', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ========================
//  START
// ========================
app.listen(PORT, () => {
  console.log(`🚀 http://localhost:${PORT}`);
  console.log(`📡 Base API: ${BASE_API}`);
  console.log(`⚙️  Node ${process.version} (native fetch)`);
  console.log(`🔑 ${ACCOUNT_ORDER.length} accounts loaded`);
  console.log('\nDebug:');
  console.log('  GET /api/debug/test-tokens?course_id=249');
  console.log('  GET /api/debug/raw?endpoint=/get/folder_contentsv3&course_id=249');
  console.log('  GET /api/debug/raw?endpoint=/get/allsubjectfrmlivecourseclass&course_id=249');
  console.log('  GET /api/debug/raw?endpoint=/get/get_previous_live_videos&course_id=249');
  console.log('\nContent:');
  console.log('  GET /api/folder-contents?course_id=249&folder_id=...');
  console.log('  GET /api/previous-live-videos?course_id=249');
  console.log('  GET /api/subjects?courseid=249');
  console.log('  GET /api/video-details?course_id=249&video_id=...');
  console.log('  GET /api/course-overview?course_id=249');
});
