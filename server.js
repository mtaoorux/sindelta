// ============================================================
// Vibrant Proxy Server — Optimized Version
// ============================================================

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// ✅ CORS — FIRST
// ============================================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['*'],
    credentials: false,
    optionsSuccessStatus: 204
}));

app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Max-Age', '86400');
    res.sendStatus(204);
});

app.use(express.json());

// ============================================================
// ⚡ HTTP agents — keep-alive for faster repeat requests
// ============================================================
const httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10
});
const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10
});

// ============================================================
// ⚡ In-memory cache (5 min TTL)
// ============================================================
const CACHE_TTL_MS = 5 * 60 * 1000;   // 5 minutes
const cache = new Map();

function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.t > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry.v;
}

function cacheSet(key, value) {
    cache.set(key, { v: value, t: Date.now() });
    // Trim old entries if the cache grows too big
    if (cache.size > 500) {
        const now = Date.now();
        for (const [k, e] of cache.entries()) {
            if (now - e.t > CACHE_TTL_MS) cache.delete(k);
        }
    }
}

// ============================================================
// Credentials
// ============================================================
const auth13 =
    process.env.AUTH_13 ||
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEwMjc1IiwidGltZXN0YW1wIjoxNzg0MjgxMTI1LCJpdl92ZXIiOjQ5LCJzZXNzaW9uIjoiZXlKMGVYQWlPaUpLVjFRaUxDSmhiR2NpT2lKSVV6STFOaUo5LmV5SnBaQ0k2SWpFd01qYzFJaXdpWlcxaGFXd2lPaUp6WVdndUxuTjFjbmxoYm5Ob0xtTnpaVUJuYldGcGJDNWpiMjBpTENKdVlXMWxJam9pVTNWeWRTSXNJblJsYm1GdWRGUjVjR1VpT2lKMWMyVnlJaXdpZEdWdVlXNTBUbUZ0WlNJNkluWnBZbkp4Ym5SaFkyRmtaVzE1YTI5MFlWOWtZaUlzSW5SbGJtRnVkRWxrSWpvaUlpd2laR2x6Y0c5ellXSnNaU0k2Wm1Gc2MyVjkuNEt3VDUxbUptSE05aFRaWE5sOXU4NTF2SWJqdlBxaE1abjVYamZQTDE5SSJ9.fDRsvfD_cHiDjU4t23NVEcF_BJKlXXZETwHwXJO7PN8";
const id13 = process.env.ID_13 || "10275";

const auth10 =
    process.env.AUTH_10 ||
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjY4NjQxIiwidGltZXN0YW1wIjoxNzg0Mjc1NTQ0LCJpdl92ZXIiOjMsInNlc3Npb24iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKcFpDSTZJalk0TmpReElpd2laVzFoYVd3aU9pSTVOalV4TlRVNU1UWTBRR2R0WVdsc0xtTnZiU0lzSW01aGJXVWlPaUpMZFhOb1lXZHlZU0JRWVd3aUxDSjBaVzVoYm5SVWVYQmxJam9pZFhObGNpSXNJblJsYm1GdWRFNWhiV1VpT2lKMmFXSnlZVzUwWVdOaFpHVnRlV3R2ZEdGZlpHSWlMQ0owWlc1aGJuUkpaQ0k2SWlJc0ltUnBjM0J2YzJGaWJHVWlPbVpoYkhObGZRLkhnVURtTFBueWhxaVVaNF9qVVgzTHVUX1FLVUI1TzR1WGNGVWV6YTBBY3MifQ.65NI2ur5DLJqcNVqff13fzCjWeaMlb16vfkNYYWvCi8";
const id10 = process.env.ID_10 || "68641";

const AES_KEY_TEXT = process.env.AES_KEY_TEXT || "638udh3829162018";
const AES_IV_TEXT  = process.env.AES_IV_TEXT  || "fedcba9876543210";

// ============================================================
// Helpers
// ============================================================
function getCreds(cls) {
    if (cls === "12" || cls === 12) return { id: id13, auth: auth13 };
    if (cls === "11" || cls === 11) return { id: id10, auth: auth10 };
    return { id: id10, auth: auth10 };
}

function getOriginHeaders(cls) {
    const { id, auth } = getCreds(cls);
    return {
        accept: "*/*",
        "accept-encoding": "gzip, deflate, br, zstd",
        "accept-language": "en-US,en;q=0.9",
        "auth-key": "appxapi",
        "client-service": "Appx",
        "device-type": "",
        "user-Id": id,
        authorization: auth,
        origin: "https://www.vibrantacademy.com",
        referer: "https://www.vibrantacademy.com/",
        "user-agent":
            "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
    };
}

// ============================================================
// AES-128-CBC Decryption
// ============================================================
function decryptVibrantLink(encryptedText) {
    if (typeof encryptedText !== "string" || !encryptedText.length) {
        throw new Error("decryptVibrantLink: input must be a non-empty string");
    }
    const firstPart = encryptedText.split(":")[0];
    let encryptedBytes;
    try {
        encryptedBytes = Buffer.from(firstPart, "base64");
    } catch (err) {
        throw new Error("decryptVibrantLink: invalid base64 input");
    }
    if (!encryptedBytes.length || encryptedBytes.length % 16 !== 0) {
        throw new Error("decryptVibrantLink: ciphertext length must be a multiple of 16");
    }
    const key = Buffer.from(AES_KEY_TEXT, "utf8");
    const iv  = Buffer.from(AES_IV_TEXT,  "utf8");
    if (key.length !== 16) throw new Error("AES key must be 16 bytes");
    if (iv.length  !== 16) throw new Error("AES IV must be 16 bytes");

    const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
    decipher.setAutoPadding(true);
    let decrypted;
    try {
        decrypted = Buffer.concat([decipher.update(encryptedBytes), decipher.final()]);
    } catch (err) {
        const decipher2 = crypto.createDecipheriv("aes-128-cbc", key, iv);
        decipher2.setAutoPadding(false);
        let raw = Buffer.concat([decipher2.update(encryptedBytes), decipher2.final()]);
        if (raw.length > 0) {
            const pad = raw[raw.length - 1];
            if (pad > 0 && pad <= 16 && pad <= raw.length) {
                const tail = raw.slice(-pad);
                const valid = tail.every((b) => b === pad);
                if (valid) raw = raw.slice(0, raw.length - pad);
            }
        }
        decrypted = raw;
    }
    return decrypted.toString("utf8");
}

const DECRYPT_FIELDS = new Set([
    "file_link","pdf_link","video_link","url","link","encrypted_url",
    "video_url","download_link","attachment","file",
]);

function looksEncrypted(value) {
    if (typeof value !== "string") return false;
    if (value.length < 24) return false;
    if (!/^[A-Za-z0-9+/=_-]+$/.test(value.split(":")[0])) return false;
    try {
        const buf = Buffer.from(value.split(":")[0], "base64");
        return buf.length > 0 && buf.length % 16 === 0;
    } catch { return false; }
}

function decryptFields(node, aggressive = false) {
    if (node === null || node === undefined) return node;
    if (Array.isArray(node)) return node.map((item) => decryptFields(item, aggressive));
    if (typeof node === "object") {
        const out = {};
        for (const [key, value] of Object.entries(node)) {
            if (typeof value === "string") {
                const shouldTry = aggressive || DECRYPT_FIELDS.has(key) || looksEncrypted(value);
                if (shouldTry) {
                    try { out[key] = decryptVibrantLink(value); }
                    catch { out[key] = value; }
                } else out[key] = value;
            } else out[key] = decryptFields(value, aggressive);
        }
        return out;
    }
    return node;
}

// ============================================================
// ⚡ Upstream fetch with keep-alive + retry + timing
// ============================================================
async function fetchUpstream(targetUrl, cls, retries = 2) {
    const startTime = Date.now();
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`📡 [upstream] attempt ${attempt}/${retries}: ${targetUrl}`);
            const response = await axios.get(targetUrl, {
                headers: getOriginHeaders(cls || 11),
                timeout: 30000,              // 30s timeout (was 15s)
                maxRedirects: 5,
                httpAgent,
                httpsAgent,
                // Disable axios automatic JSON transform for speed
                transformResponse: [(data) => data],
            });
            const elapsed = Date.now() - startTime;
            console.log(`✅ [upstream] done in ${elapsed}ms`);
            return response;
        } catch (err) {
            lastError = err;
            const elapsed = Date.now() - startTime;
            console.error(`❌ [upstream] attempt ${attempt} failed after ${elapsed}ms: ${err.message}`);
            if (attempt < retries) {
                // Small backoff before retry
                await new Promise((r) => setTimeout(r, 500));
            }
        }
    }
    throw lastError;
}

// ============================================================
// Batches
// ============================================================
const batches = [
    { id: 8,  cls: 11, title: "JEE 2028: 11th Class OG KOTA BATCH", imageUrl: "https://appx-content-v2.classx.co.in/paid_course3/2026-03-20-0_7755858005992874.jpeg", price: "Free", originalPrice: "", discount: "" },
    { id: 10, cls: 12, title: "JEE 2027: 12th Class OG KOTA Batch",  imageUrl: "https://appx-content-v2.classx.co.in/paid_course3/2026-03-20-0_1711192735086824.jpeg", price: "Free", originalPrice: "", discount: "" },
    { id: 35, cls: 11, title: "JEE 2028: 11th Class P2 Batch",      imageUrl: "https://appx-content-v2.classx.co.in/paid_course3/2026-06-28-0_5171654847118846.png",  price: "Free", originalPrice: "", discount: "" },
    { id: 36, cls: 12, title: "JEE 2027: 12th Class A2 Batch",      imageUrl: "https://appx-content-v2.classx.co.in/paid_course3/2026-06-10-0_5680222141996314.png",  price: "Free", originalPrice: "", discount: "" },
    { id: 7,  cls: 11, title: "Free Resources",                     imageUrl: "https://appx-content-v2.classx.co.in/paid_course3/2026-03-15-0_9931362198126962.jpeg", price: "Free", originalPrice: "", discount: "" }
];

function findBatch(id) {
    const numId = Number(id);
    return batches.find((b) => b.id === numId) || null;
}

// ============================================================
// ROUTES
// ============================================================

app.get("/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString(), cacheSize: cache.size });
});

app.get("/", (req, res) => {
    res.json({
        name: "Vibrant Proxy Server",
        status: "running",
        cacheSize: cache.size,
        routes: [
            "/health",
            "/batches",
            "/decrypt?text=<encrypted>",
            "/detail?id=<batchId>",
            "/folder_contents?course_id=&folder_id=&class=&decrypt=1",
            "/video_details?course_id=&video_id=&class=&decrypt=1",
            "/vib/*  (generic proxy)"
        ]
    });
});

app.get("/batches", (req, res) => {
    res.json({ success: true, count: batches.length, batches });
});

app.get("/decrypt", (req, res) => {
    try {
        const { text } = req.query;
        if (!text) return res.status(400).json({ error: "Missing required query param: text" });
        res.json({ success: true, decrypted: decryptVibrantLink(text) });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================================
// /detail — cached
// ============================================================
app.get("/detail", async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: "Missing required query param: id" });

        const batch = findBatch(id);
        if (!batch) {
            return res.status(404).json({
                error: "Batch not found",
                id,
                available: batches.map((b) => b.id),
            });
        }

        const cacheKey = `detail:${batch.id}:${batch.cls}`;
        const cached = cacheGet(cacheKey);
        if (cached) {
            console.log(`⚡ [detail] cache HIT: ${cacheKey}`);
            return res.json(cached);
        }

        const targetUrl =
            `https://vibrantacademykotaapi.akamai.net.in/get/folder_contentsv3` +
            `?course_id=${encodeURIComponent(batch.id)}` +
            `&parent_id=0&windowsapp=false&start=0`;

        const response = await fetchUpstream(targetUrl, batch.cls);
        const payload = decryptFields(response.data, false);

        const result = { success: true, batch, contents: payload };
        cacheSet(cacheKey, result);
        res.json(result);
    } catch (error) {
        console.error("❌ [detail] error:", error.message);
        res.status(error.response?.status ?? 500).json({
            success: false,
            error: error.message,
            status: error.response?.status,
            data: error.response?.data ?? null,
        });
    }
});

// ============================================================
// ⚡ /folder_contents — CACHED + retried
// ============================================================
app.get("/folder_contents", async (req, res) => {
    const startTime = Date.now();
    try {
        const {
            course_id,
            folder_id,
            parent_id,
            class: cls,
            decrypt
        } = req.query;

        if (!course_id) {
            return res.status(400).json({ error: "Missing required query param: course_id" });
        }

        // Accept either folder_id or parent_id, default to -1 (or 0)
        const folderId = folder_id ?? parent_id ?? '-1';

        const cacheKey = `folder:${course_id}:${folderId}:${cls || 11}:${decrypt || 0}`;
        const cached = cacheGet(cacheKey);
        if (cached) {
            const elapsed = Date.now() - startTime;
            console.log(`⚡ [folder_contents] cache HIT in ${elapsed}ms: ${cacheKey}`);
            return res.json(cached);
        }

        const targetUrl =
            `https://vibrantacademykotaapi.akamai.net.in/get/folder_contentsv3` +
            `?course_id=${encodeURIComponent(course_id)}` +
            `&parent_id=${encodeURIComponent(folderId)}` +
            `&windowsapp=false` +
            `&start=0`;

        const response = await fetchUpstream(targetUrl, cls || 11);

        let payload = response.data;
        // axios returns a string now (transformResponse disabled)
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch (e) {}
        }

        if (decrypt === "1" || decrypt === "true") {
            payload = decryptFields(payload, false);
        }

        cacheSet(cacheKey, payload);
        const elapsed = Date.now() - startTime;
        console.log(`✅ [folder_contents] done in ${elapsed}ms: ${cacheKey}`);
        res.json(payload);
    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`❌ [folder_contents] failed after ${elapsed}ms:`, error.message);
        res.status(error.response?.status ?? 500).json({
            error: error.message,
            status: error.response?.status,
            data: error.response?.data ?? null,
            elapsedMs: elapsed
        });
    }
});

// ============================================================
// /video_details — cached
// ============================================================
app.get("/video_details", async (req, res) => {
    try {
        const {
            course_id, video_id, class: cls,
            ytflag = "0", folder_wise_course = "1",
            lc_app_api_url = "", decrypt
        } = req.query;

        if (!course_id || !video_id) {
            return res.status(400).json({
                error: "Missing required query params: course_id and video_id"
            });
        }

        const cacheKey = `video:${course_id}:${video_id}:${cls || 11}:${decrypt || 0}`;
        const cached = cacheGet(cacheKey);
        if (cached) {
            console.log(`⚡ [video_details] cache HIT: ${cacheKey}`);
            return res.json(cached);
        }

        const targetUrl =
            `https://vibrantacademykotaapi.akamai.net.in/get/fetchVideoDetailsById` +
            `?course_id=${encodeURIComponent(course_id)}` +
            `&video_id=${encodeURIComponent(video_id)}` +
            `&ytflag=${encodeURIComponent(ytflag)}` +
            `&folder_wise_course=${encodeURIComponent(folder_wise_course)}` +
            `&lc_app_api_url=${encodeURIComponent(lc_app_api_url)}`;

        const response = await fetchUpstream(targetUrl, cls || 11);

        let payload = response.data;
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch (e) {}
        }
        if (decrypt === "1" || decrypt === "true") {
            payload = decryptFields(payload, false);
        }

        cacheSet(cacheKey, payload);
        res.json(payload);
    } catch (error) {
        console.error("❌ [video_details] error:", error.message);
        res.status(error.response?.status ?? 500).json({
            error: error.message,
            status: error.response?.status,
            data: error.response?.data ?? null,
        });
    }
});

// ============================================================
// /vib/* — generic proxy
// ============================================================
app.get("/vib/*", async (req, res) => {
    try {
        const pathWithoutPrefix = req.path.replace(/^\/vib/, "");
        const endpointPath = pathWithoutPrefix +
            (req.originalUrl.includes("?")
                ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
                : "");
        const targetUrl = `https://vibrantacademykotaapi.akamai.net.in${endpointPath}`;

        const response = await fetchUpstream(targetUrl, req.query.class || 11);
        let payload = response.data;
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch (e) {}
        }
        if (req.query.decrypt === "1" || req.query.decrypt === "true") {
            payload = decryptFields(payload, false);
        }
        res.json(payload);
    } catch (error) {
        console.error("❌ [vib] error:", error.message);
        res.status(error.response?.status ?? 500).json({
            error: error.message,
            status: error.response?.status,
            data: error.response?.data ?? null,
        });
    }
});

// ============================================================
// 404 + Error handler
// ============================================================
app.use((req, res) => {
    res.status(404).json({ error: "Route not found", path: req.path });
});

app.use((err, req, res, next) => {
    console.error("❌ Unhandled error:", err);
    res.status(500).json({ error: "Internal server error", message: err.message });
});

// ============================================================
// Start server
// ============================================================
app.listen(PORT, () => {
    console.log(`🚀 Vibrant Proxy Server on port ${PORT}`);
    console.log(`   /health              →  status check`);
    console.log(`   /detail?id=8         →  batch detail`);
    console.log(`   /folder_contents?... →  folder listing (cached 5min)`);
    console.log(`   /video_details?...   →  video details (cached 5min)`);
    console.log(`   ⚡ Cache TTL: 5 minutes`);
    console.log(`   ⚡ Keep-alive: enabled`);
    console.log(`   ⚡ Timeout: 30s (with 2 retries)`);
});

module.exports = app;
