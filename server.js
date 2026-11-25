// server.js
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================
//  CONFIG
// ========================
const BASE_API = process.env.BASE_API || 'https://sciencefunapi.classx.co.in';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef';
const IV_LENGTH = 16;

// ========================
//  ALL TOKENS
// ========================
const ACCOUNTS = {
  '733566': {
    token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjczMzU2NiIsInRpbWVzdGFtcCI6MTc5MDYwODA3MSwiaXZfdmVyIjo3LCJzZXNzaW9uIjoiZXlKMGVYQWlPaUpLVjFRaUxDSmhiR2NpT2lKSVV6STFOaUo5LmV5SnBaQ0k2SWpjek16VTJOaUlzSW1WdFlXbHNJam9pYzJGeWRHaGhhMjFoZEdoMWNqWTRNRUJuYldGcGJDNWpiMjBpTENKdVlXMWxJam9pVTJGeWRHaGhheUJOWVhSb2RYSWlMQ0owWlc1aGJuUlVlWEJsSWpvaWRYTmxjaUlzSW5SbGJtRnVkRTVoYldVaU9pSnpZMmxsYm1ObFpuVnVYMlJpSWl3aWRHVnVZVzUwU1dRaU9pSWlMQ0prYVhOd2IzTmhZbXhsSWpwbVlXeHpaWDAuR2g3S0lSQTVGRTlWMWhSMmE5Zl9ZbllCZEhMQlN2dGx6UmdSMjJwcXlnVSJ9.XpYS08YqcKcqZRdp8wYSxFWfG0VSuB9xfmJ3F0XH1LU',
    userId: '733566',
    email: 'sarthakmathur680@gmail.com',
    name: 'Sarthak Mathur',
  },
  '714264': {
    token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjcxNDI2NCIsInRpbWVzdGFtcCI6MTc5MTMyMDQ5OSwiaXZfdmVyIjozNCwic2Vzc2lvbiI6ImV5SjBlWEFpT2lKS1YxUWlMQ0poYkdjaU9pSklVekkxTmlKOS5leUpwWkNJNklqY3hOREkyTkNJc0ltVnRZV2xzSWpvaVUwMUZXRUJIVFVGSlRDNURUMDBpTENKdVlXMWxJam9pYzIxbGVDSXNJblJsYm1GdWRGUjVjR1VpT2lKMWMyVnlJaXdpZEdWdVlXNTBUbUZ0WlNJNkluTmphV1Z1WTJWbWRXNWZaR0lpTENKMFpXNWhiblJKWkNJNklpSXNJbVJwYzNCdmMyRmliR1VpT21aaGJITmxmUS5Yak5CM2tvVEZ3elg2ckpla3hHYzhKMUhYVU1kMjZIUnBscnRPV3RvTi1NIn0.TrjUlWXttL7urT1PldVoWjW9UxK2KjugCWvND1J7SAo',
    userId: '714264',
    email: 'SMEX@GMIL.COM',
    name: 'smex',
  },
  '367839': {
    token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjM2NzgzOSIsInRpbWVzdGFtcCI6MTc5MTY1NDY0NiwiaXZfdmVyIjozMSwic2Vzc2lvbiI6ImV5SjBlWEFpT2lKS1YxUWlMQ0poYkdjaU9pSklVekkxTmlKOS5leUpwWkNJNklqTTJOemd6T1NJc0ltVnRZV2xzSWpvaU56QXhOREl6TWpJeE5rQm5iV0ZwYkM1amIyMGlMQ0p1WVcxbElqb2lSR2wyZVdFaUxDSjBaVzVoYm5SVWVYQmxJam9pZFhObGNpSXNJblJsYm1GdWRFNWhiV1VpT2lKelkybGxibU5sWm5WdVgyUmlJaXdpZEdWdVlXNTBTV1FpT2lJaUxDSmthWE53YjNOaFlteGxJanBtWVd4elpYMC5EeW9KY0tYZVZ1R19jZ01BQjNyd3lNR0lXTVpGZmtNZ2pqVU1GTkU2WFdjIn0._1ycmhFrmOnb6Sae6XGlYQFPEZIrNfr9-r58RPEBFJA',
    userId: '367839',
    email: '7014232216@gmail.com',
    name: 'Divya',
  },
};

// Priority order for auto-fallback
const ACCOUNT_ORDER = ['733566', '367839', '714264'];

// ========================
//  ENCRYPTION HELPERS
// ========================
function decrypt(text) {
  try {
    if (typeof text !== 'string' || !text.includes(':')) return text;
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return JSON.parse(decrypted.toString());
  } catch {
    return null;
  }
}

function decodeJwt(token) {
  try {
    const [, payload] = token.split('.');
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    let session = null;
    if (data.session) {
      try {
        const [, sp] = data.session.split('.');
        session = JSON.parse(Buffer.from(sp, 'base64url').toString('utf8'));
      } catch {}
    }
    return { ...data, sessionDecoded: session };
  } catch {
    return null;
  }
}

// ========================
//  SINGLE FETCH WITH ONE TOKEN
// ========================
async function tryFetch(endpoint, params, accountKey) {
  const account = ACCOUNTS[accountKey];
  if (!account) return { success: false, error: `Unknown account "${accountKey}"`, status: 400, account: accountKey };

  const url = `${BASE_API}${endpoint}`;
  try {
    const response = await axios.get(url, {
      params,
      headers: {
        Authorization: `Bearer ${account.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'ClassX-Client/1.0',
      },
      timeout: 20000,
    });

    let data = response.data;
    if (typeof data === 'string') {
      const d = decrypt(data);
      if (d !== null) data = d;
    } else if (data && data.encrypted) {
      const d = decrypt(data.encrypted);
      if (d !== null) data = d;
    }

    console.log(`✅ [${accountKey}] ${endpoint} → ${response.status}`);
    return { success: true, data, status: response.status, account: accountKey };
  } catch (error) {
    const statusCode = error.response?.status || 500;
    const message = error.response?.data?.message || error.response?.statusText || error.message;
    console.warn(`⚠️  [${accountKey}] ${endpoint} → ${statusCode}: ${message}`);
    return { success: false, error: message, status: statusCode, account: accountKey };
  }
}

// ========================
//  FETCH WITH AUTO-FALLBACK
// ========================
async function fetchClassX(endpoint, params = {}, preferredAccount = null) {
  const order = preferredAccount
    ? [preferredAccount, ...ACCOUNT_ORDER.filter((k) => k !== preferredAccount)]
    : ACCOUNT_ORDER;

  const attempts = [];
  for (const key of order) {
    const result = await tryFetch(endpoint, params, key);
    attempts.push({ account: key, status: result.status, success: result.success });

    if (result.success) {
      return { ...result, attempts };
    }

    // Only fallback on auth failures — not on 404 / bad params
    if (![401, 403].includes(result.status)) {
      return { ...result, attempts };
    }
  }

  return {
    success: false,
    error: 'All tokens failed (401/403)',
    status: 401,
    attempts,
  };
}

// ========================
//  MIDDLEWARE
// ========================
app.use(express.json());

// ========================
//  ROUTES
// ========================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    baseApi: BASE_API,
    accounts: Object.keys(ACCOUNTS).map((k) => ({
      key: k,
      userId: ACCOUNTS[k].userId,
      name: ACCOUNTS[k].name,
      email: ACCOUNTS[k].email,
      hasToken: !!ACCOUNTS[k].token,
    })),
    fallbackOrder: ACCOUNT_ORDER,
    timestamp: new Date().toISOString(),
  });
});

// Inspect all tokens (for debugging)
app.get('/api/debug/tokens', (req, res) => {
  const out = {};
  for (const [key, acc] of Object.entries(ACCOUNTS)) {
    const d = decodeJwt(acc.token);
    out[key] = d
      ? { id: d.id, name: d.name, email: d.email, iv_ver: d.iv_ver, timestamp: d.timestamp }
      : { error: 'invalid JWT' };
  }
  res.json({ success: true, tokens: out });
});

/**
 * 1. Folder contents
 */
app.get('/api/folder-contents', async (req, res) => {
  const { course_id, folder_id, account } = req.query;
  if (!course_id) return res.status(400).json({ success: false, error: 'course_id is required' });

  const result = await fetchClassX(
    '/get/folder_contentsv3',
    { course_id, parent_id: folder_id || '', windowsapp: 0, start: 0 },
    account || null
  );

  if (!result.success) return res.status(result.status).json({ success: false, error: result.error, attempts: result.attempts });
  res.json({ success: true, endpoint: 'folder_contentsv3', usedAccount: result.account, attempts: result.attempts, data: result.data });
});

/**
 * 2. Previous live videos
 */
app.get('/api/previous-live-videos', async (req, res) => {
  const { course_id, account } = req.query;
  if (!course_id) return res.status(400).json({ success: false, error: 'course_id is required' });

  const result = await fetchClassX(
    '/get/get_previous_live_videos',
    { course_id, start: 0, folder_wise_course: 1, userid: -1 },
    account || null
  );

  if (!result.success) return res.status(result.status).json({ success: false, error: result.error, attempts: result.attempts });
  res.json({ success: true, endpoint: 'get_previous_live_videos', usedAccount: result.account, attempts: result.attempts, data: result.data });
});

/**
 * 3. All subjects
 */
app.get('/api/subjects', async (req, res) => {
  const { courseid, account } = req.query;
  if (!courseid) return res.status(400).json({ success: false, error: 'courseid is required' });

  const result = await fetchClassX(
    '/get/allsubjectfrmlivecourseclass',
    { courseid, start: -1 },
    account || null
  );

  if (!result.success) return res.status(result.status).json({ success: false, error: result.error, attempts: result.attempts });
  res.json({ success: true, endpoint: 'allsubjectfrmlivecourseclass', usedAccount: result.account, attempts: result.attempts, data: result.data });
});

/**
 * 4. Video details
 */
app.get('/api/video-details', async (req, res) => {
  const { course_id, video_id, account } = req.query;
  if (!course_id || !video_id) {
    return res.status(400).json({ success: false, error: 'course_id and video_id are required' });
  }

  const result = await fetchClassX(
    '/get/fetchVideoDetailsById',
    { course_id, video_id, ytflag: 0, folder_wise_course: 1, lc_app_api_url: '' },
    account || null
  );

  if (!result.success) return res.status(result.status).json({ success: false, error: result.error, attempts: result.attempts });
  res.json({ success: true, endpoint: 'fetchVideoDetailsById', usedAccount: result.account, attempts: result.attempts, data: result.data });
});

/**
 * 5. Course overview — parallel, with fallback
 */
app.get('/api/course-overview', async (req, res) => {
  const { course_id, account } = req.query;
  if (!course_id) return res.status(400).json({ success: false, error: 'course_id is required' });

  const [folders, live, subjects] = await Promise.all([
    fetchClassX('/get/folder_contentsv3', { course_id, parent_id: '', windowsapp: 0, start: 0 }, account || null),
    fetchClassX('/get/get_previous_live_videos', { course_id, start: 0, folder_wise_course: 1, userid: -1 }, account || null),
    fetchClassX('/get/allsubjectfrmlivecourseclass', { courseid: course_id, start: -1 }, account || null),
  ]);

  res.json({
    success: true,
    course_id,
    fetchedAt: new Date().toISOString(),
    results: {
      folder_contents: folders.success
        ? { usedAccount: folders.account, attempts: folders.attempts, data: folders.data }
        : { error: folders.error, attempts: folders.attempts },
      previous_live_videos: live.success
        ? { usedAccount: live.account, attempts: live.attempts, data: live.data }
        : { error: live.error, attempts: live.attempts },
      subjects: subjects.success
        ? { usedAccount: subjects.account, attempts: subjects.attempts, data: subjects.data }
        : { error: subjects.error, attempts: subjects.attempts },
    },
  });
});

/**
 * 6. Test ALL tokens against an endpoint (diagnostic)
 */
app.get('/api/debug/test-tokens', async (req, res) => {
  const { course_id } = req.query;
  if (!course_id) return res.status(400).json({ success: false, error: 'course_id is required' });

  const results = {};
  for (const key of ACCOUNT_ORDER) {
    results[key] = await tryFetch(
      '/get/folder_contentsv3',
      { course_id, parent_id: '', windowsapp: 0, start: 0 },
      key
    );
  }
  res.json({ success: true, results });
});

// ========================
//  ERROR HANDLER
// ========================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ========================
//  START
// ========================
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Base API: ${BASE_API}`);
  console.log(`🔑 Loaded accounts: ${ACCOUNT_ORDER.join(' → ')} (fallback order)`);
  console.log('\nRoutes:');
  console.log('  GET /health');
  console.log('  GET /api/debug/tokens');
  console.log('  GET /api/debug/test-tokens?course_id=249');
  console.log('  GET /api/folder-contents?course_id=249&folder_id=...');
  console.log('  GET /api/previous-live-videos?course_id=249');
  console.log('  GET /api/subjects?courseid=249');
  console.log('  GET /api/video-details?course_id=249&video_id=...');
  console.log('  GET /api/course-overview?course_id=249');
  console.log('\nAdd ?account=733566|714264|367839 to force a specific token.');
});
