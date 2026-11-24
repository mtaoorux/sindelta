// server.js
// Run: npm install express axios cors
// Then: node server.js

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// COURSE CREDENTIALS
//   token  -> JWT (without "Bearer " prefix)
//   userId -> Munilsir user id
//   cookie -> optional; paste from DevTools if present
// ============================================================
const courseCredentials = {
  '86': {
    token:
      'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEyMjMzOSIsInRpbWVzdGFtcCI6MTc3OTkyMDc2MCwiaXZfdmVyIjo1LCJzZXNzaW9uIjoiZXlKMGVYQWlPaUpLVjFRaUxDSmhiR2NpT2lKSVV6STFOaUo5LmV5SnBaQ0k2SWpFeU1qTXpPU0lzSW1WdFlXbHNJam9pYlc5c2FXc3VPWGhBWjIxaGFXd3VZMjl0SWl3aWJtRnRaU0k2SWsxdmJHbHJJRXRwY21GeUlpd2lkR1Z1WVc1MFZIbHdaU0k2SW5WelpYSWlMQ0owWlc1aGJuUk9ZVzFsSWpvaWJYVnVhV3h6YVhKZlpHSWlMQ0owWlc1aGJuUkpaQ0k2SWlJc0ltUnBjM0J2YzJGaWJHVWlPbVpoYkhObGZRLkpIYjZsWllNMk9WcWxqWGtMZkZTWV83NkpYMkQ3TXYyYUlKRThzSndtOWsifQ.Rc62G9Y1nopPktxbt9Ot2A6MmhW6YeX5SSvGz2SwYf8',
    userId: '122339',
    cookie: null,
  },
};

// ============================================================
// CONSTANTS
// ============================================================
const BASE_URL = 'https://munilsirapi.akamai.net.in';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://www.munilsir.com',
  Referer: 'https://www.munilsir.com/',
  'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'cross-site',
};

// ============================================================
// HELPERS
// ============================================================

// Build a working set of auth headers for a given course.
// If the token in courseCredentials is rejected, see /api/debug/auth.
function getAuthHeaders(courseId, extra = {}) {
  const creds = courseCredentials[courseId];
  if (!creds) throw new Error(`No credentials for course_id: ${courseId}`);

  const headers = {
    ...BROWSER_HEADERS,
    Authorization: `Bearer ${creds.token}`,
    userId: creds.userId,
    userid: creds.userId,
    'Content-Type': 'application/json',
    ...extra,
  };
  if (creds.cookie) headers.Cookie = creds.cookie;
  return headers;
}

// Base64url decode (JWT payloads use - and _ instead of + and /)
function b64urlDecode(str) {
  return JSON.parse(
    Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  );
}

// Decode outer JWT + nested `session` JWT and report expiry
function inspectToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) throw new Error('Not a JWT');
    const header = b64urlDecode(parts[0]);
    const payload = b64urlDecode(parts[1]);

    let session = null;
    if (payload.session && typeof payload.session === 'string') {
      const sp = payload.session.split('.');
      if (sp.length >= 2) session = b64urlDecode(sp[1]);
    }

    const now = Date.now();
    const outerExp = payload.timestamp ? payload.timestamp * 1000 : null;
    const innerExp = session && session.exp ? session.exp * 1000 : null;

    return {
      header,
      payload,
      session,
      checks: {
        outerTimestamp: outerExp ? new Date(outerExp).toISOString() : null,
        outerExpired: outerExp ? outerExp < now : null,
        sessionExp: innerExp ? new Date(innerExp).toISOString() : null,
        sessionExpired: innerExp ? innerExp < now : null,
        now: new Date(now).toISOString(),
      },
    };
  } catch (err) {
    return { error: err.message };
  }
}

// Best-effort AES-CBC decrypt (only used if the API returns ciphertext)
function safeDecryptAES(base64Data, keyBase64, ivBase64) {
  try {
    const key = Buffer.from(keyBase64, 'base64');
    const iv = ivBase64 ? Buffer.from(ivBase64, 'base64') : Buffer.alloc(16, 0);
    const algo = key.length === 32 ? 'aes-256-cbc' : 'aes-128-cbc';
    const decipher = crypto.createDecipheriv(algo, key, iv);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(base64Data, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

// Normalize the many possible field names returned by the video API
function extractStreamInfo(detail) {
  if (!detail || typeof detail !== 'object') return null;
  const d = detail.data || detail.result || detail;

  const url =
    d.videoUrl ||
    d.video_url ||
    d.encryptedUrl ||
    d.encrypted_url ||
    d.url ||
    d.streamUrl ||
    d.stream_url ||
    d.hlsUrl ||
    d.hls_url ||
    null;

  const key = d.key || d.video_key || d.videoKey || d.aes_key || d.aesKey || null;
  const iv = d.iv || d.aes_iv || d.aesIv || null;

  if (!url && d.video && typeof d.video === 'object') {
    return extractStreamInfo(d.video);
  }
  return { url, key, iv, raw: d };
}

async function fetchVideoDetailsRaw(courseId, videoId) {
  const headers = getAuthHeaders(courseId);
  const { data } = await axios.get(`${BASE_URL}/get/fetchVideoDetailsById`, {
    headers,
    params: {
      course_id: courseId,
      video_id: videoId,
      ytflag: 0,
      folder_wise_course: 1,
      lc_app_api_url: '',
    },
    timeout: 30000,
    maxRedirects: 5,
    validateStatus: () => true, // we want to see 401 bodies too
  });
  return data;
}

async function fetchFolderContentsRaw(courseId, folderId, start = 0) {
  const headers = getAuthHeaders(courseId);
  const { data } = await axios.get(`${BASE_URL}/get/folder_contentsv3`, {
    headers,
    params: {
      course_id: courseId,
      parent_id: folderId,
      windowsapp: false,
      start,
    },
    timeout: 30000,
    maxRedirects: 5,
    validateStatus: () => true,
  });
  return data;
}

// ============================================================
// ROUTES
// ============================================================

// Health
app.get('/', (_req, res) =>
  res.json({ ok: true, service: 'munilsir-api-proxy', version: '1.1.0' })
);
app.get('/health', (_req, res) => res.json({ ok: true }));

// ------------------------------------------------------------
// GET /api/video/details?course_id=86&video_id=XXXX
// ------------------------------------------------------------
app.get('/api/video/details', async (req, res) => {
  try {
    const { course_id, video_id } = req.query;
    if (!course_id || !video_id) {
      return res.status(400).json({
        success: false,
        error: 'course_id and video_id are required',
      });
    }

    const data = await fetchVideoDetailsRaw(course_id, video_id);

    // If upstream returned 401 in body, surface it clearly
    if (data && (data.status === 401 || data.success === false)) {
      return res.status(401).json({
        success: false,
        error: data,
        hint: 'Token rejected. Run /api/debug/token?course_id=86 and /api/debug/auth?course_id=86&video_id=XXXX',
      });
    }

    const stream = extractStreamInfo(data);
    return res.json({ success: true, stream, data });
  } catch (err) {
    const status = err?.response?.status || 500;
    const payload = err?.response?.data || { message: err.message };
    console.error('[video/details]', status, payload);
    return res.status(status).json({ success: false, error: payload });
  }
});

// ------------------------------------------------------------
// GET /api/folder/contents?course_id=86&folder_id=0&start=0
// ------------------------------------------------------------
app.get('/api/folder/contents', async (req, res) => {
  try {
    const { course_id, folder_id, start } = req.query;
    if (!course_id || folder_id === undefined) {
      return res.status(400).json({
        success: false,
        error: 'course_id and folder_id are required',
      });
    }

    const data = await fetchFolderContentsRaw(
      course_id,
      folder_id,
      start ? parseInt(start, 10) : 0
    );

    if (data && (data.status === 401 || data.success === false)) {
      return res.status(401).json({
        success: false,
        error: data,
        hint: 'Token rejected. Run /api/debug/token?course_id=86',
      });
    }

    return res.json({ success: true, data });
  } catch (err) {
    const status = err?.response?.status || 500;
    const payload = err?.response?.data || { message: err.message };
    console.error('[folder/contents]', status, payload);
    return res.status(status).json({ success: false, error: payload });
  }
});

// ------------------------------------------------------------
// GET /api/decrypt?data=BASE64&key=BASE64&iv=BASE64
// ------------------------------------------------------------
app.get('/api/decrypt', (req, res) => {
  const { data, key, iv } = req.query;
  if (!data || !key) {
    return res
      .status(400)
      .json({ success: false, error: 'data and key are required' });
  }
  const out = safeDecryptAES(data, key, iv);
  if (out === null) {
    return res.status(400).json({ success: false, error: 'decrypt failed' });
  }
  return res.json({ success: true, decrypted: out });
});

// ------------------------------------------------------------
// GET /api/proxy?url=<encoded m3u8 or ts url>
// ------------------------------------------------------------
app.get('/api/proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url required' });

    const upstream = await axios.get(url, {
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': BROWSER_HEADERS['User-Agent'],
        Origin: 'https://www.munilsir.com',
        Referer: 'https://www.munilsir.com/',
      },
    });

    res.setHeader(
      'Content-Type',
      upstream.headers['content-type'] || 'application/octet-stream'
    );
    if (upstream.headers['content-length']) {
      res.setHeader('Content-Length', upstream.headers['content-length']);
    }
    upstream.data.pipe(res);
  } catch (err) {
    console.error('[proxy]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------
// GET /api/debug/token?course_id=86
// Decodes the outer JWT and the nested `session` JWT and
// shows the real expiry so you know whether the token is dead.
// ------------------------------------------------------------
app.get('/api/debug/token', (req, res) => {
  const { course_id = '86' } = req.query;
  const creds = courseCredentials[course_id];
  if (!creds) return res.status(400).json({ error: 'no creds' });
  res.json({ course_id, ...inspectToken(creds.token) });
});

// ------------------------------------------------------------
// GET /api/debug/auth?course_id=86&video_id=XXXX
// Tries 6 header variants against fetchVideoDetailsById and
// reports which (if any) returns 200.
// ------------------------------------------------------------
app.get('/api/debug/auth', async (req, res) => {
  const { course_id = '86', video_id = '1' } = req.query;
  const creds = courseCredentials[course_id];
  if (!creds) return res.status(400).json({ error: 'no creds' });

  const base = { ...BROWSER_HEADERS };
  if (creds.cookie) base.Cookie = creds.cookie;

  const variants = [
    {
      name: 'bearer + userId (capital U)',
      headers: { ...base, Authorization: `Bearer ${creds.token}`, userId: creds.userId },
    },
    {
      name: 'bearer + userid (lowercase)',
      headers: { ...base, Authorization: `Bearer ${creds.token}`, userid: creds.userId },
    },
    {
      name: 'bearer + both userId and userid',
      headers: {
        ...base,
        Authorization: `Bearer ${creds.token}`,
        userId: creds.userId,
        userid: creds.userId,
      },
    },
    {
      name: 'bearer only',
      headers: { ...base, Authorization: `Bearer ${creds.token}` },
    },
    {
      name: 'raw token (no "Bearer" prefix)',
      headers: { ...base, Authorization: creds.token, userId: creds.userId },
    },
    {
      name: 'bearer + userId + x-user-id',
      headers: {
        ...base,
        Authorization: `Bearer ${creds.token}`,
        userId: creds.userId,
        'x-user-id': creds.userId,
      },
    },
    {
      name: 'token in query string',
      headers: { ...base, userId: creds.userId },
      tokenInQuery: true,
    },
  ];

  const results = [];
  for (const v of variants) {
    const params = {
      course_id,
      video_id,
      ytflag: 0,
      folder_wise_course: 1,
      lc_app_api_url: '',
    };
    if (v.tokenInQuery) params.token = creds.token;

    try {
      const r = await axios.get(`${BASE_URL}/get/fetchVideoDetailsById`, {
        headers: v.headers,
        params,
        timeout: 15000,
        validateStatus: () => true,
      });
      results.push({
        variant: v.name,
        status: r.status,
        ok: r.status >= 200 && r.status < 300,
        body: typeof r.data === 'string' ? r.data.slice(0, 300) : r.data,
      });
    } catch (e) {
      results.push({ variant: v.name, status: 'network-error', error: e.message });
    }
  }

  const winner = results.find((r) => r.ok);
  res.json({
    course_id,
    video_id,
    winner: winner ? winner.variant : null,
    results,
    hint: winner
      ? `Use variant "${winner.variant}" in getAuthHeaders().`
      : 'All variants failed. Decode /api/debug/token — the session JWT is likely expired. Get a fresh token from DevTools → Network.',
  });
});

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log('   GET /health');
  console.log('   GET /api/video/details?course_id=86&video_id=XXXX');
  console.log('   GET /api/folder/contents?course_id=86&folder_id=0&start=0');
  console.log('   GET /api/decrypt?data=...&key=...&iv=...');
  console.log('   GET /api/proxy?url=...');
  console.log('   GET /api/debug/token?course_id=86');
  console.log('   GET /api/debug/auth?course_id=86&video_id=XXXX');
});
