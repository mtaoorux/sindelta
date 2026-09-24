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
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEwMjc1IiwidGltZXN0YW1wIjoxNzg0MjgxMTI1LCJpdl92ZXIiOjQ5LCJzZXNzaW9uIjoiZXlKMGVYQWlPaUpLVjFRaUxDSmhiR2NpT2lKSVV6STFOaUo5LmV5SnBaQ0k2SWpFd01qYzFJaXdpWlcxaGFXd2lPaUp6WVdoMUxuTjFjbmxoYm5Ob0xtTnpaVUJuYldGcGJDNWpiMjBpTENKdVlXMWxJam9pVTNWeWRTSXNJblJsYm1GdWRGUjVjR1VpT2lKMWMyVnlJaXdpZEdWdVlXNTBUbUZ0WlNJNkluWnBZbkpoYm5SaFkyRmtaVzE1YTI5MFlWOWtZaUlzSW5SbGJtRnVkRWxrSWpvaUlpd2laR2x6Y0c5ellXSnNaU0k2Wm1Gc2MyVjkuNEt3VDUxbUptSE05aFRaWE5sOXU4NTF2SWJqdlBxaE1abjVYamZQTDE5SSJ9.fDRsvfD_cHiDjU4t23NVEcF_BJKlXXZETwHwXJO7PN8";
const id13 = process.env.ID_13 || "10275";

const auth10 =
  process.env.AUTH_10 ||
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjY4NjQxIiwidGltZXN0YW1wIjoxNzg0Mjc1NTQ0LCJpdl92ZXIiOjMsInNlc3Npb24iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKcFpDSTZJalk0TmpReElpd2laVzFoYVd3aU9pSTVOalV4TlRVNU1UWTBRR2R0WVdsc0xtTnZiU0lzSW01aGJXVWlPaUpMZFhOb1lXZHlZU0JRWVd3aUxDSjBaVzVoYm5SVWVYQmxJam9pZFhObGNpSXNJblJsYm1GdWRFNWhiV1VpT2lKMmFXSnlZVzUwWVdOaFpHVnRlV3R2ZEdGZlpHSWlMQ0owWlc1aGJuUkpaQ0k2SWlJc0ltUnBjM0J2YzJGaWJHVWlPbVpoYkhObGZRLkhnVURtTFBueWhxaVVaNF9qVVgzTHVUX1FLVUI1TzR1WGNGVWV6YTBBY3MifQ.65NI2ur5DLJqcNVqff13fzCjWeaMlb16vfkNYYWvCi8";
const id10 = process.env.ID_10 || "68641";

// ============================================================
// AES Constants (same as the support file)
// ============================================================
const AES_KEY_TEXT = process.env.AES_KEY_TEXT || "638udh3829162018";
const AES_IV_TEXT = process.env.AES_IV_TEXT || "fedcba9876543210";

// ============================================================
// Helpers
// ============================================================
function getCreds(cls) {
  if (cls === "12" || cls === 12) {
    return { id: id13, auth: auth13 };
  }
  if (cls === "11" || cls === 11) {
    return { id: id10, auth: auth10 };
  }
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
// DECRYPTION (ported from the support file)
// ============================================================
/**
 * Decrypts a Vibrant-encrypted string.
 * Input format: "<base64-ciphertext>[:...anything else ignored]"
 *
 * Equivalent to the browser-side `decryptVibrantLink()`:
 *   - split on ":" and take the first part
 *   - base64-decode
 *   - AES-128-CBC decrypt with key/iv
 *   - strip PKCS#7 padding
 */
function decryptVibrantLink(encryptedText) {
  if (typeof encryptedText !== "string" || !encryptedText.length) {
    throw new Error("decryptVibrantLink: input must be a non-empty string");
  }

  // 1) Take the part before the first colon (matches browser code)
  const firstPart = encryptedText.split(":")[0];

  // 2) Base64 decode
  let encryptedBytes;
  try {
    encryptedBytes = Buffer.from(firstPart, "base64");
  } catch (err) {
    throw new Error("decryptVibrantLink: invalid base64 input");
  }

  if (!encryptedBytes.length || encryptedBytes.length % 16 !== 0) {
    throw new Error("decryptVibrantLink: ciphertext length must be a multiple of 16");
  }

  // 3) AES-128-CBC decrypt
  const key = Buffer.from(AES_KEY_TEXT, "utf8");
  const iv = Buffer.from(AES_IV_TEXT, "utf8");

  if (key.length !== 16) {
    throw new Error("decryptVibrantLink: AES key must be 16 bytes (128-bit)");
  }
  if (iv.length !== 16) {
    throw new Error("decryptVibrantLink: AES IV must be 16 bytes");
  }

  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(true); // Node handles PKCS#7 automatically

  let decrypted;
  try {
    decrypted = Buffer.concat([
      decipher.update(encryptedBytes),
      decipher.final(),
    ]);
  } catch (err) {
    // Fall back to manual padding strip (matches browser fallback behavior)
    try {
      const decipher2 = crypto.createDecipheriv("aes-128-cbc", key, iv);
      decipher2.setAutoPadding(false);
      let raw = Buffer.concat([
        decipher2.update(encryptedBytes),
        decipher2.final(),
      ]);
      // Manual PKCS#7 strip
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

/**
 * Recursively walk an object and decrypt any field whose value looks like
 * an encrypted Vibrant link. Fields explicitly listed in DECRYPT_FIELDS
 * are always attempted; other fields are attempted only when
 * `aggressive` is true.
 */
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
  // base64-ish (allow "=" padding, "+", "/", "-", "_")
  if (!/^[A-Za-z0-9+/=_-]+$/.test(value.split(":")[0])) return false;
  // must decode to multiple of 16 bytes
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
            out[key] = value; // leave as-is if it isn't actually encrypted
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

// Shared CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Accept, User-Id, Auth-Key, Client-Service, Device-Type, Origin, Referer",
};

// Allow-listed upstream paths for the generic /vib/* proxy.
const ALLOWED_VIB_PATHS = [
  "/get/folder_contentsv3",
  "/get/fetchVideoDetailsById",
  "/get/fetchContents",
  "/get/course_list",
  "/get/video_list",
];

function isAllowedVibPath(pathWithoutPrefix) {
  return ALLOWED_VIB_PATHS.some(
    (allowed) =>
      pathWithoutPrefix === allowed ||
      pathWithoutPrefix.startsWith(allowed + "/")
  );
}

// ============================================================
// Middleware
// ============================================================
app.use(express.json());

app.options("*", (req, res) => {
  res.set(corsHeaders);
  res.sendStatus(204);
});

// ============================================================
// Routes
// ============================================================

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// ------------------------------------------------------------
// 0. Standalone decryption endpoint
//    GET /decrypt?text=<encrypted>
// ------------------------------------------------------------
app.get("/decrypt", (req, res) => {
  try {
    const { text } = req.query;
    if (!text) {
      res.set(corsHeaders);
      return res.status(400).json({ error: "Missing required query param: text" });
    }
    const decrypted = decryptVibrantLink(text);
    res.set(corsHeaders);
    res.json({ success: true, decrypted });
  } catch (error) {
    res.set(corsHeaders);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ------------------------------------------------------------
// 1. Folder Contents Endpoint
//    GET /folder_contents?course_id=...&folder_id=...&class=11
//    Optional: &decrypt=1 to auto-decrypt file_link/pdf_link fields
// ------------------------------------------------------------
app.get("/folder_contents", async (req, res) => {
  try {
    const { course_id, folder_id, class: cls, decrypt } = req.query;

    if (!course_id || !folder_id) {
      res.set(corsHeaders);
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

    res.set(corsHeaders);
    res.json(payload);
  } catch (error) {
    console.error("❌ Folder contents error:", error.message);
    console.error("❌ Error response:", error.response?.data);

    res.set(corsHeaders);
    res.status(error.response?.status ?? 500).json({
      error: error.message,
      status: error.response?.status,
      data: error.response?.data ?? null,
    });
  }
});

// ------------------------------------------------------------
// 2. Video Details Endpoint
//    GET /video_details?course_id=...&video_id=...&class=11
//    Optional: &decrypt=1
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
      res.set(corsHeaders);
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

    res.set(corsHeaders);
    res.json(payload);
  } catch (error) {
    console.error("❌ Video details error:", error.message);
    console.error("❌ Error response:", error.response?.data);

    res.set(corsHeaders);
    res.status(error.response?.status ?? 500).json({
      error: error.message,
      status: error.response?.status,
      data: error.response?.data ?? null,
    });
  }
});

// ------------------------------------------------------------
// 3. Generic Proxy for /vib/* routes (allow-listed paths only)
//    GET /vib/<allowed-path>?<query>
//    Optional: &decrypt=1
// ------------------------------------------------------------
app.get("/vib/*", async (req, res) => {
  try {
    const pathWithoutPrefix = req.path.replace(/^\/vib/, "");

    if (!isAllowedVibPath(pathWithoutPrefix)) {
      res.set(corsHeaders);
      return res.status(403).json({
        error: "Path not allowed",
        path: pathWithoutPrefix,
        allowed: ALLOWED_VIB_PATHS,
      });
    }

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

    res.set(corsHeaders);
    res.json(payload);
  } catch (error) {
    console.error("❌ Proxy error:", error.message);
    console.error("❌ Error response:", error.response?.data);

    res.set(corsHeaders);
    res.status(error.response?.status ?? 500).json({
      error: error.message,
      status: error.response?.status,
      data: error.response?.data ?? null,
    });
  }
});

// ------------------------------------------------------------
// 4. 404 Handler
// ------------------------------------------------------------
app.use((req, res) => {
  res.set(corsHeaders);
  res.status(404).json({ error: "Route not found", path: req.path });
});

// ------------------------------------------------------------
// 5. Global Error Handler
// ------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res.set(corsHeaders);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// ============================================================
// Start server
// ============================================================
app.listen(PORT, () => {
  console.log(`🚀 Proxy server running on http://localhost:${PORT}`);
  console.log(`   Health check:      http://localhost:${PORT}/health`);
  console.log(`   Decrypt (single):  http://localhost:${PORT}/decrypt?text=<encrypted>`);
  console.log(`   Folder contents:   http://localhost:${PORT}/folder_contents?course_id=...&folder_id=...&class=11&decrypt=1`);
  console.log(`   Video details:     http://localhost:${PORT}/video_details?course_id=...&video_id=...&class=11&decrypt=1`);
  console.log(`   Generic proxy:     http://localhost:${PORT}/vib/* (allow-listed paths only)`);
});

module.exports = app;
