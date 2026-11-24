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
// ============================================================
const courseCredentials = {
  '86': {
    token:
      'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEyMjMzOSIsInRpbWVzdGFtcCI6MTc3OTkyMDc2MCwiaXZfdmVyIjo1LCJzZXNzaW9uIjoiZXlKMGVYQWlPaUpLVjFRaUxDSmhiR2NpT2lKSVV6STFOaUo5LmV5SnBaQ0k2SWpFeU1qTXpPU0lzSW1WdFlXbHNJam9pYlc5c2FXc3VPWGhBWjIxaGFXd3VZMjl0SWl3aWJtRnRaU0k2SWsxdmJHbHJJRXRwY21GeUlpd2lkR1Z1WVc1MFZIbHdaU0k2SW5WelpYSWlMQ0owWlc1aGJuUk9ZVzFsSWpvaWJYVnVhV3h6YVhKZlpHSWlMQ0owWlc1aGJuUkpaQ0k2SWlJc0ltUnBjM0J2YzJGaWJHVWlPbVpoYkhObGZRLkpIYjZsWllNMk9WcWxqWGtMZkZTWV83NkpYMkQ3TXYyYUlKRThzSndtOWsifQ.Rc62G9Y1nopPktxbt9Ot2A6MmhW6YeX5SSvGz2SwYf8',
    userId: '122339',
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
function getAuthHeaders(courseId) {
  const creds = courseCredentials[courseId];
  if (!creds) {
    throw new Error(`No credentials found for course_id: ${courseId}`);
  }
  return {
    ...BROWSER_HEADERS,
    Authorization: `Bearer ${creds.token}`,
    userId: creds.userId,
    userid: creds.userId,
    'Content-Type': 'application/json',
  };
}

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
  } catch (err) {
    return null;
  }
}

// Normalizes the different possible field names from the Akamai API
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

  // Sometimes video_url is inside a nested "video" object
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
  });
  return data;
}

// ============================================================
// ROUTES
// ============================================================

// Health check
app.get('/', (_req, res) => res.json({ ok: true, service: 'munilsir-api-proxy' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

// ------------------------------------------------------------
// GET /api/video/details?course_id=86&video_id=XXXX
// Returns normalized stream info (url, key, iv) + raw
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
    const stream = extractStreamInfo(data);

    return res.json({
      success: true,
      stream,   // { url, key, iv, raw }
      data,     // full raw response (handy for debugging)
    });
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

    return res.json({ success: true, data });
  } catch (err) {
    const status = err?.response?.status || 500;
    const payload = err?.response?.data || { message: err.message };
    console.error('[folder/contents]', status, payload);
    return res.status(status).json({ success: false, error: payload });
  }
});

// ------------------------------------------------------------
// GET /api/decrypt?data=BASE64&key=BASE64&iv=BASE64 (optional)
// Use only if the API returns AES-encrypted payload directly.
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
// Optional: proxies the encrypted HLS stream so the browser
// does not hit CORS or Origin restrictions on the CDN.
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

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`   GET /api/video/details?course_id=86&video_id=XXXX`);
  console.log(`   GET /api/folder/contents?course_id=86&folder_id=0&start=0`);
});
