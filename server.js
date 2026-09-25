const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Credentials (prefer env vars; fall back to hardcoded values)
// ============================================================
const auth13 =
  process.env.AUTH_13 ||
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEwMjc1IiwidGltZXN0YW1wIjoxNzg0MjgxMTI1LCJpdl92ZXIiOjQ5LCJzZXNzaW9uIjoiZXlKMGVYQWlPaUpLVjFRaUxDSmhiR2NpT2lKSVV6STFOaUo5LmV5SnBaQ0k2SWpFd01qYzFJaXdpWlcxaGFXd2lPaUp6WVdndUxuTjFjbmxoYm5Ob0xtTnpaVUJuYldGcGJDNWpiMjBpTENKdVlXMWxJam9pVTNWeWRTSXNJblJsYm1GdWRGUjVjR1VpT2lKMWMyVnlJaXdpZEdWdVlXNTBUbUZ0WlNJNkluWnBZbkp4Ym5SaFkyRmtaVzE1YTI5MFlWOWtZaUlzSW5SbGJtRnVkRWxrSWpvaUlpd2laR2x6Y0c5ellXSnNaU0k2Wm1Gc2MyVjkuNEt3VDUxbUptSE05aFRaWE5sOXU4NTF2SWJqdlBxaE1abjVYamZQTDE5SSJ9.fDRsvfD_cHiDjU4t23NVEcF_BJKlXXZETwHwXJO7PN8";
const id13 = process.env.ID_13 || "10275";

const auth10 =
  process.env.AUTH_10 ||
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjY4NjQxIiwidGltZXN0YW1wIjoxNzg0Mjc1NTQ0LCJpdl92ZXIiOjMsInNlc3Npb24iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKcFpDSTZJalk0TmpReElpd2laVzFoYVd3aU9pSTVOalV4TlRVNU1UWTBRR2R0WVdsc0xtTnZiU0lzSW01aGJXVWlPaUpMZFhOb1lXZHlZU0JRWVd3aUxDSjBaVzVoYm5SVWVYQmxJam9pZFhObGNpSXNJblJsYm1GdWRFNWhiV1VpT2lKMmFXSnlZVzUwWVdOaFpHVnRlV3R2ZEdGZlpHSWlMQ0owWlc1aGJuUkpaQ0k2SWlJc0ltUnBjM0J2YzJGaWJHVWlPbVpoYkhObGZRLkhnVURtTFBueWhxaVVaNF9qVVgzTHVUX1FLVUI1TzR1WGNGVWV6YTBBY3MifQ.65NI2ur5DLJqcNVqff13fzCjWeaMlb16vfkNYYWvCi8";
const id10 = process.env.ID_10 || "68641";

// ============================================================
// AES Constants
// ============================================================
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
// DECRYPTION
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

  if (key.length !== 16) throw new Error("decryptVibrantLink: AES key must be 16 bytes");
  if (iv.length  !== 16) throw new Error("decryptVibrantLink: AES IV must be 16 bytes");

  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(true);

  let decrypted;
  try {
    decrypted = Buffer.concat([decipher.update(encryptedBytes), decipher.final()]);
  } catch (err) {
    try {
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
    } catch (err2) {
      throw new Error("decryptVibrantLink: decryption failed");
    }
  }

  return decrypted.toString("utf8");
}

const DECRYPT_FIELDS = new Set([
  "file_link",
  "pdf_link",
  "video_link",
  "url",
  "link",
  "encrypted_url",
  "video_url",
  "download_link",
  "attachment",
  "file",
]);

function looksEncrypted(value) {
  if (typeof value !== "string") return false;
  if (value.length < 24) return false;
  if (!/^[A-Za-z0-9+/=_-]+$/.test(value.split(":")[0])) return false;
  try {
    const buf = Buffer.from(value.split(":")[0], "base64");
    return buf.length > 0 && buf.length % 16 === 0;
  } catch {
    return false;
  }
}

function decryptFields(node, aggressive = false) {
  if (node === null || node === undefined) return node;

  if (Array.isArray(node)) {
    return node.map((item) => decryptFields(item, aggressive));
  }

  if (typeof node === "object") {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string") {
        const shouldTry = aggressive || DECRYPT_FIELDS.has(key) || looksEncrypted(value);
        if (shouldTry) {
          try {
            out[key] = decryptVibrantLink(value);
          } catch {
            out[key] = value;
          }
        } else {
          out[key] = value;
        }
      } else {
        out[key] = decryptFields(value, aggressive);
      }
    }
    return out;
  }

  return node;
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
// Middleware
// ============================================================
app.use(express.json());

// ============================================================
// Routes
// ============================================================

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// ------------------------------------------------------------
// List all batches
// GET /batches
// ------------------------------------------------------------
app.get("/batches", (req, res) => {
  res.json({ success: true, count: batches.length, batches });
});

// ------------------------------------------------------------
// Standalone decryption endpoint
// GET /decrypt?text=<encrypted>
// ------------------------------------------------------------
app.get("/decrypt", (req, res) => {
  try {
    const { text } = req.query;
    if (!text) {
      return res.status(400).json({ error: "Missing required query param: text" });
    }
    const decrypted = decryptVibrantLink(text);
    res.json({ success: true, decrypted });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ------------------------------------------------------------
// Batch detail endpoint
// GET /detail?id=<batchId>
// ------------------------------------------------------------
app.get("/detail", async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "Missing required query param: id" });
    }

    const batch = findBatch(id);
    if (!batch) {
      return res.status(404).json({
        error: "Batch not found",
        id,
        available: batches.map((b) => b.id),
      });
    }

    const targetUrl =
      `https://vibrantacademykotaapi.akamai.net.in/get/folder_contentsv3` +
      `?course_id=${encodeURIComponent(batch.id)}` +
      `&parent_id=0` +
      `&windowsapp=false` +
      `&start=0`;

    console.log("📡 Proxying to:", targetUrl);

    const response = await axios.get(targetUrl, {
      headers: getOriginHeaders(batch.cls),
      timeout: 15000,
      maxRedirects: 5,
    });

    const payload = decryptFields(response.data, false);

    res.json({
      success: true,
      batch,
      contents: payload,
    });
  } catch (error) {
    console.error("❌ Detail error:", error.message);
    console.error("❌ Error response:", error.response?.data);

    res.status(error.response?.status ?? 500).json({
      success: false,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data ?? null,
    });
  }
});

// ------------------------------------------------------------
// Folder contents
// GET /folder_contents?course_id=...&folder_id=...&class=11
// Optional: &decrypt=1
// ------------------------------------------------------------
app.get("/folder_contents", async (req, res) => {
  try {
    const { course_id, folder_id, class: cls, decrypt } = req.query;

    if (!course_id || !folder_id) {
      return res.status(400).json({
        error: "Missing required query params: course_id and folder_id",
      });
    }

    const targetUrl =
      `https://vibrantacademykotaapi.akamai.net.in/get/folder_contentsv3` +
      `?course_id=${encodeURIComponent(course_id)}` +
      `&parent_id=${encodeURIComponent(folder_id)}` +
      `&windowsapp=false` +
      `&start=0`;

    console.log("📡 Proxying to:", targetUrl);

    const response = await axios.get(targetUrl, {
      headers: getOriginHeaders(cls || 11),
      timeout: 15000,
      maxRedirects: 5,
    });

    let payload = response.data;
    if (decrypt === "1" || decrypt === "true") {
      payload = decryptFields(payload, false);
    }

    res.json(payload);
  } catch (error) {
    console.error("❌ Folder contents error:", error.message);
    console.error("❌ Error response:", error.response?.data);

    res.status(error.response?.status ?? 500).json({
      error: error.message,
      status: error.response?.status,
      data: error.response?.data ?? null,
    });
  }
});

// ------------------------------------------------------------
// Video details
// GET /video_details?course_id=...&video_id=...&class=11
// Optional: &decrypt=1
// ------------------------------------------------------------
app.get("/video_details", async (req, res) => {
  try {
    const {
      course_id,
      video_id,
      class: cls,
      ytflag = "0",
      folder_wise_course = "1",
      lc_app_api_url = "",
      decrypt,
    } = req.query;

    if (!course_id || !video_id) {
      return res.status(400).json({
        error: "Missing required query params: course_id and video_id",
      });
    }

    const targetUrl =
      `https://vibrantacademykotaapi.akamai.net.in/get/fetchVideoDetailsById` +
      `?course_id=${encodeURIComponent(course_id)}` +
      `&video_id=${encodeURIComponent(video_id)}` +
      `&ytflag=${encodeURIComponent(ytflag)}` +
      `&folder_wise_course=${encodeURIComponent(folder_wise_course)}` +
      `&lc_app_api_url=${encodeURIComponent(lc_app_api_url)}`;

    console.log("📡 Proxying to:", targetUrl);

    const response = await axios.get(targetUrl, {
      headers: getOriginHeaders(cls || 11),
      timeout: 15000,
      maxRedirects: 5,
    });

    let payload = response.data;
    if (decrypt === "1" || decrypt === "true") {
      payload = decryptFields(payload, false);
    }

    res.json(payload);
  } catch (error) {
    console.error("❌ Video details error:", error.message);
    console.error("❌ Error response:", error.response?.data);

    res.status(error.response?.status ?? 500).json({
      error: error.message,
      status: error.response?.status,
      data: error.response?.data ?? null,
    });
  }
});

// ------------------------------------------------------------
// Generic open proxy for ANY /vib/* path (no allow-list)
// GET /vib/<any-path>?<query>
// Optional: &decrypt=1
// Optional: &class=11|12 to pick credentials
// ------------------------------------------------------------
app.get("/vib/*", async (req, res) => {
  try {
    const pathWithoutPrefix = req.path.replace(/^\/vib/, "");

    const endpointPath =
      pathWithoutPrefix +
      (req.originalUrl.includes("?")
        ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
        : "");

    const targetUrl = `https://vibrantacademykotaapi.akamai.net.in${endpointPath}`;

    console.log("📡 Proxying to:", targetUrl);

    const response = await axios.get(targetUrl, {
      headers: getOriginHeaders(req.query.class || 11),
      timeout: 15000,
      maxRedirects: 5,
    });

    let payload = response.data;
    if (req.query.decrypt === "1" || req.query.decrypt === "true") {
      payload = decryptFields(payload, false);
    }

    res.json(payload);
  } catch (error) {
    console.error("❌ Proxy error:", error.message);
    console.error("❌ Error response:", error.response?.data);

    res.status(error.response?.status ?? 500).json({
      error: error.message,
      status: error.response?.status,
      data: error.response?.data ?? null,
    });
  }
});

// ------------------------------------------------------------
// 404 Handler
// ------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: "Route not found", path: req.path });
});

// ------------------------------------------------------------
// Global Error Handler
// ------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// ============================================================
// Start server
// ============================================================
app.listen(PORT, () => {
  console.log(`🚀 Proxy server running on http://localhost:${PORT}`);
  console.log(`   Health check:      http://localhost:${PORT}/health`);
  console.log(`   Batches list:      http://localhost:${PORT}/batches`);
  console.log(`   Decrypt (single):  http://localhost:${PORT}/decrypt?text=<encrypted>`);
  console.log(`   Batch detail:      http://localhost:${PORT}/detail?id=8`);
  console.log(`   Folder contents:   http://localhost:${PORT}/folder_contents?course_id=...&folder_id=...&class=11&decrypt=1`);
  console.log(`   Video details:     http://localhost:${PORT}/video_details?course_id=...&video_id=...&class=11&decrypt=1`);
  console.log(`   Open proxy:        http://localhost:${PORT}/vib/<any-path>?<query>&class=11&decrypt=1`);
});

module.exports = app;
