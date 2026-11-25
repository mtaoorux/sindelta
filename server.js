// server.js — single-file MDClasses proxy with Bearer auth + AES-256 encryption + UI
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// ============================================
// CONFIG (env vars override defaults)
// ============================================
const PORT = process.env.PORT || 3000;
const BASE_API = process.env.BASE_API || 'https://mdclassesapi.classx.co.in';

const BEARER_TOKEN =
  process.env.BEARER_TOKEN ||
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6Ijk3NjM1IiwidGltZXN0YW1wIjoxNzc4Mzg4MTY2LCJpdl92ZXIiOjcsInNlc3Npb24iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKcFpDSTZJamszTmpNMUlpd2laVzFoYVd3aU9pSmxjbUZpYUdsemFHVnJOR1YyWlhKQVoyMWhhV3d1WTI5dElpd2libUZ0WlNJNklrRkNTRWxUU0VWTElGUlNTVkJCVkVoSklpd2lkR1Z1WVc1MFZIbHdaU0k2SW5WelpYSWlMQ0owWlc1aGJuUk9ZVzFsSWpvaWJXUmpiR0Z6YzJWelgyUmlJaXdpZEdWdVlXNTBTV1FpT2lJaUxDSmthWE53YjNOaFlteGxJanBtWVd4elpYMC5IX0lXNDFpc1VuX3hGeDdBWmJQQjROSmdFSUQzTTl0OGE3TjZJbHN2dmt3In0.7ksXgLOXPpwLPnXR8TJZrt0tYTEfgBqWPfRc4-RVlbI';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
  ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
  : crypto.randomBytes(32);

if (ENCRYPTION_KEY.length !== 32) {
  console.error('❌ ENCRYPTION_KEY must be 32 bytes (64 hex chars).');
  process.exit(1);
}

const IV_LENGTH = 16;

// ============================================
// AES-256-CBC HELPERS
// ============================================
function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let out = cipher.update(text, 'utf8', 'hex');
  out += cipher.final('hex');
  return iv.toString('hex') + ':' + out;
}

function decrypt(payload) {
  const [ivHex, hex] = payload.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let out = decipher.update(hex, 'hex', 'utf8');
  out += decipher.final('utf8');
  return out;
}

// ============================================
// UPSTREAM FETCH
// ============================================
async function fetchFromApi(apiPath) {
  try {
    const res = await axios.get(`${BASE_API}${apiPath}`, {
      headers: {
        Authorization: `Bearer ${BEARER_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 15000,
    });
    return res.data;
  } catch (e) {
    if (e.response) {
      throw new Error(`Upstream ${e.response.status}: ${JSON.stringify(e.response.data)}`);
    }
    throw new Error(e.message);
  }
}

// ============================================
// ROUTES
// ============================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    base_api: BASE_API,
    token_set: Boolean(BEARER_TOKEN),
  });
});

// Plain JSON proxies
app.get('/api/all-subjects', async (req, res) => {
  const { courseid, start = -1 } = req.query;
  if (!courseid) return res.status(400).json({ success: false, error: 'courseid required' });
  try {
    const data = await fetchFromApi(
      `/get/allsubjectfrmlivecourseclass?courseid=${courseid}&start=${start}`
    );
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/folder-contents', async (req, res) => {
  const { course_id, folder_id, start = 0 } = req.query;
  if (!course_id || !folder_id) {
    return res.status(400).json({ success: false, error: 'course_id & folder_id required' });
  }
  try {
    const data = await fetchFromApi(
      `/get/folder_contentsv3?course_id=${course_id}&parent_id=${folder_id}&windowsapp=0&start=${start}`
    );
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/previous-live-videos', async (req, res) => {
  const { course_id, start = 0, userid = -1 } = req.query;
  if (!course_id) return res.status(400).json({ success: false, error: 'course_id required' });
  try {
    const data = await fetchFromApi(
      `/get/get_previous_live_videos?course_id=${course_id}&start=${start}&folder_wise_course=1&userid=${userid}`
    );
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/video-details', async (req, res) => {
  const { course_id, video_id, ytflag = 0 } = req.query;
  if (!course_id || !video_id) {
    return res.status(400).json({ success: false, error: 'course_id & video_id required' });
  }
  try {
    const data = await fetchFromApi(
      `/get/fetchVideoDetailsById?course_id=${course_id}&video_id=${video_id}&ytflag=${ytflag}&folder_wise_course=1&lc_app_api_url=`
    );
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Encrypted variants
function secureHandler(builder) {
  return async (req, res) => {
    try {
      const data = await fetchFromApi(builder(req.query));
      const encrypted = encrypt(JSON.stringify(data));
      res.json({ success: true, encrypted, algorithm: 'aes-256-cbc' });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  };
}

app.get('/api/secure/all-subjects', secureHandler((q) => {
  if (!q.courseid) throw new Error('courseid required');
  return `/get/allsubjectfrmlivecourseclass?courseid=${q.courseid}&start=${q.start || -1}`;
}));

app.get('/api/secure/folder-contents', secureHandler((q) => {
  if (!q.course_id || !q.folder_id) throw new Error('course_id & folder_id required');
  return `/get/folder_contentsv3?course_id=${q.course_id}&parent_id=${q.folder_id}&windowsapp=0&start=${q.start || 0}`;
}));

app.get('/api/secure/previous-live-videos', secureHandler((q) => {
  if (!q.course_id) throw new Error('course_id required');
  return `/get/get_previous_live_videos?course_id=${q.course_id}&start=${q.start || 0}&folder_wise_course=1&userid=${q.userid || -1}`;
}));

app.get('/api/secure/video-details', secureHandler((q) => {
  if (!q.course_id || !q.video_id) throw new Error('course_id & video_id required');
  return `/get/fetchVideoDetailsById?course_id=${q.course_id}&video_id=${q.video_id}&ytflag=${q.ytflag || 0}&folder_wise_course=1&lc_app_api_url=`;
}));

// Decrypt helper
app.post('/api/decrypt', (req, res) => {
  try {
    const { encrypted } = req.body;
    if (!encrypted || typeof encrypted !== 'string') {
      return res.status(400).json({ success: false, error: 'encrypted field required' });
    }
    res.json({ success: true, data: JSON.parse(decrypt(encrypted)) });
  } catch (e) {
    res.status(400).json({ success: false, error: 'Decrypt failed: ' + e.message });
  }
});

// ============================================
// BUILT-IN UI (served at /)
// ============================================
const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>MDClasses Explorer</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#222;background:#f7f8fa}
  h1{margin-bottom:.25rem}
  .hint{color:#666;margin-top:0;font-size:.9rem}
  .card{background:#fff;border:1px solid #e3e6ea;border-radius:8px;padding:1rem;margin:1rem 0;box-shadow:0 1px 2px rgba(0,0,0,.03)}
  .card h2{margin:0 0 .75rem;font-size:1rem}
  input,button{font:inherit;padding:.5rem .75rem;border:1px solid #cfd4da;border-radius:6px}
  input{margin-right:.5rem;min-width:180px}
  button{background:#2f6ef7;color:#fff;border-color:#2f6ef7;cursor:pointer}
  button:hover{background:#2558c8}
  pre{background:#111827;color:#e5e7eb;padding:1rem;border-radius:8px;overflow:auto;max-height:480px;font-size:.85rem}
</style>
</head>
<body>
  <h1>MDClasses API Explorer</h1>
  <p class="hint">Token stays server-side. All calls go through this proxy.</p>

  <div class="card"><h2>All Subjects</h2>
    <input id="c1" placeholder="courseid" /><button id="b1">Fetch</button>
  </div>

  <div class="card"><h2>Folder Contents</h2>
    <input id="c2" placeholder="course_id" /><input id="f2" placeholder="folder_id" /><button id="b2">Fetch</button>
  </div>

  <div class="card"><h2>Video Details</h2>
    <input id="c3" placeholder="course_id" /><input id="v3" placeholder="video_id" /><button id="b3">Fetch</button>
  </div>

  <div class="card"><h2>Previous Live Videos</h2>
    <input id="c4" placeholder="course_id" /><button id="b4">Fetch</button>
  </div>

  <div class="card"><h2>Encryption demo</h2>
    <button id="b5">Fetch encrypted → auto-decrypt</button>
  </div>

  <pre id="out">Output will appear here…</pre>

<script>
const out = document.getElementById('out');
const show = (x) => out.textContent = typeof x === 'string' ? x : JSON.stringify(x, null, 2);
async function j(url, opts) {
  const r = await fetch(url, opts);
  const d = await r.json();
  if (!r.ok || d.success === false) throw new Error(d.error || ('HTTP ' + r.status));
  return d;
}
const bind = (id, fn) => document.getElementById(id).onclick = async () => {
  try { show(await fn()); } catch (e) { show('Error: ' + e.message); }
};

bind('b1', async () => {
  const c = document.getElementById('c1').value.trim();
  if (!c) throw new Error('courseid required');
  return (await j('/api/all-subjects?courseid=' + encodeURIComponent(c))).data;
});

bind('b2', async () => {
  const c = document.getElementById('c2').value.trim();
  const f = document.getElementById('f2').value.trim();
  if (!c || !f) throw new Error('course_id & folder_id required');
  return (await j('/api/folder-contents?course_id=' + encodeURIComponent(c) + '&folder_id=' + encodeURIComponent(f))).data;
});

bind('b3', async () => {
  const c = document.getElementById('c3').value.trim();
  const v = document.getElementById('v3').value.trim();
  if (!c || !v) throw new Error('course_id & video_id required');
  return (await j('/api/video-details?course_id=' + encodeURIComponent(c) + '&video_id=' + encodeURIComponent(v))).data;
});

bind('b4', async () => {
  const c = document.getElementById('c4').value.trim();
  if (!c) throw new Error('course_id required');
  return (await j('/api/previous-live-videos?course_id=' + encodeURIComponent(c))).data;
});

bind('b5', async () => {
  const c = document.getElementById('c1').value.trim() || 'DEMO';
  const enc = await j('/api/secure/all-subjects?courseid=' + encodeURIComponent(c));
  const dec = await j('/api/decrypt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encrypted: enc.encrypted }),
  });
  return { algorithm: enc.algorithm, note: 'ciphertext → plaintext OK', plaintext: dec.data };
});
</script>
</body>
</html>`;

app.get('/', (req, res) => res.type('html').send(HTML));

// ============================================
// START
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 http://localhost:${PORT}`);
  console.log(`🌐 ${BASE_API}`);
  console.log(`🎫 Token set: ${Boolean(BEARER_TOKEN)}`);
  console.log(`🔐 Key: ${ENCRYPTION_KEY.toString('hex').slice(0, 8)}…`);
});
