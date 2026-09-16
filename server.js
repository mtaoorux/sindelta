const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Credentials
// ============================================================
const auth13 = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEwMjc1IiwidGltZXN0YW1wIjoxNzg0MjgxMTI1LCJpdl92ZXIiOjQ5LCJzZXNzaW9uIjoiZXlKMGVYQWlPaUpLVjFRaUxDSmhiR2NpT2lKSVV6STFOaUo5LmV5SnBaQ0k2SWpFd01qYzFJaXdpWlcxaGFXd2lPaUp6WVdoMUxuTjFjbmxoYm5Ob0xtTnpaVUJuYldGcGJDNWpiMjBpTENKdVlXMWxJam9pVTNWeWRTSXNJblJsYm1GdWRGUjVjR1VpT2lKMWMyVnlJaXdpZEdWdVlXNTBUbUZ0WlNJNkluWnBZbkpoYm5SaFkyRmtaVzE1YTI5MFlWOWtZaUlzSW5SbGJtRnVkRWxrSWpvaUlpd2laR2x6Y0c5ellXSnNaU0k2Wm1Gc2MyVjkuNEt3VDUxbUptSE05aFRaWE5sOXU4NTF2SWJqdlBxaE1abjVYamZQTDE5SSJ9.fDRsvfD_cHiDjU4t23NVEcF_BJKlXXZETwHwXJO7PN8";
const id13 = "10275";

const auth10 = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjY4NjQxIiwidGltZXN0YW1wIjoxNzg0Mjc1NTQ0LCJpdl92ZXIiOjMsInNlc3Npb24iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKcFpDSTZJalk0TmpReElpd2laVzFoYVd3aU9pSTVOalV4TlRVNU1UWTBRR2R0WVdsc0xtTnZiU0lzSW01aGJXVWlPaUpMZFhOb1lXZHlZU0JRWVd3aUxDSjBaVzVoYm5SVWVYQmxJam9pZFhObGNpSXNJblJsYm1GdWRFNWhiV1VpT2lKMmFXSnlZVzUwWVdOaFpHVnRlV3R2ZEdGZlpHSWlMQ0owWlc1aGJuUkpaQ0k2SWlJc0ltUnBjM0J2YzJGaWJHVWlPbVpoYkhObGZRLkhnVURtTFBueWhxaVVaNF9qVVgzTHVUX1FLVUI1TzR1WGNGVWV6YTBBY3MifQ.65NI2ur5DLJqcNVqff13fzCjWeaMlb16vfkNYYWvCi8";
const id10 = "68641";

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
  // Default to class 11
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

// Shared CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Accept, User-Id, Auth-Key, Client-Service, Device-Type, Origin, Referer",
};

// ============================================================
// Middleware
// ============================================================
app.use(express.json());

// Handle CORS preflight
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
// 1. Folder Contents Endpoint
//    GET /folder_contents?course_id=...&folder_id=...&class=11
// ------------------------------------------------------------
app.get("/folder_contents", async (req, res) => {
  try {
    const { course_id, folder_id, class: cls } = req.query;

    // Validate required params
    if (!course_id || !folder_id) {
      res.set(corsHeaders);
      return res.status(400).json({
        error: "Missing required query params: course_id and folder_id",
      });
    }

    // Build target URL
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

    res.set(corsHeaders);
    res.json(response.data);
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
// 2. Generic Proxy for /vib/* routes
//    GET /vib/<any-path>?<query>
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

    res.set(corsHeaders);
    res.json(response.data);
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
// 3. 404 Handler
// ------------------------------------------------------------
app.use((req, res) => {
  res.set(corsHeaders);
  res.status(404).json({ error: "Route not found", path: req.path });
});

// ------------------------------------------------------------
// 4. Global Error Handler
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
  console.log(`   Folder contents:   http://localhost:${PORT}/folder_contents?course_id=...&folder_id=...&class=11`);
  console.log(`   Generic proxy:     http://localhost:${PORT}/vib/*`);
});

module.exports = app;
