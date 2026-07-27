const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const VIBRANT_API = "https://vibrantacademykotaapi.akamai.net.in";

const id12 = "10275";
const id11 = "68641";

const auth12 =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEwMjc1IiwidGltZXN0YW1wIjoxNzg0MjgxMTI1LCJpdl92ZXIiOjQ5LCJzZXNzaW9uIjoiZXlKMGVYQWlPaUpLVjFRaUxDSmhiR2NpT2lKSVV6STFOaUo5LmV5SnBaQ0k2SWpFd01qYzFJaXdpWlcxaGFXd2lPaUp6WVdoMUxuTjFjbmxoYm5Ob0xtTnpaVUJuYldGcGJDNWpiMjBpTENKdVlXMWxJam9pVTNWeWRTSXNJblJsYm1GdWRGUjVjR1VpT2lKMWMyVnlJaXdpZEdWdVlXNTBUbUZ0WlNJNkluWnBZbkpoYm5SaFkyRmtaVzE1YTI5MFlWOWtZaUlzSW5SbGJtRnVkRWxrSWpvaUlpd2laR2x6Y0c5ellXSnNaU0k2Wm1Gc2MyVjkuNEt3VDUxbUptSE05aFRaWE5sOXU4NTF2SWJqdlBxaE1abjVYamZQTDE5SSJ9.fDRsvfD_cHiDjU4t23NVEcF_BJKlXXZETwHwXJO7PN8";

const auth11 =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjY4NjQxIiwidGltZXN0YW1wIjoxNzg0Mjc1NTQ0LCJpdl92ZXIiOjMsInNlc3Npb24iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKcFpDSTZJalk0TmpReElpd2laVzFoYVd3aU9pSTVOalV4TlRVNU1UWTBRR2R0WVdsc0xtTnZiU0lzSW01aGJXVWlPaUpMZFhOb1lXZHlZU0JRWVd3aUxDSjBaVzVoYm5SVWVYQmxJam9pZFhObGNpSXNJblJsYm1GdWRFNWhiV1VpT2lKMmFXSnlZVzUwWVdOaFpHVnRlV3R2ZEdGZlpHSWlMQ0owWlc1aGJuUkpaQ0k2SWlJc0ltUnBjM0J2YzJGaWJHVWlPbVpoYkhObGZRLkhnVURtTFBueWhxaVVaNF9qVVgzTHVUX1FLVUI1TzR1WGNGVWV6YTBBY3MifQ.65NI2ur5DLJqcNVqff13fzCjWeaMlb16vfkNYYWvCi8";

function getCreds(cls) {
  if (cls === "12" || cls === "11") {
    return cls === "12" 
      ? { id: id12, auth: auth12 }
      : { id: id11, auth: auth11 };
  }
  throw new Error("Invalid class (use 11 or 12)");
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
    "user-agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
  };
}

function isPlainUrl(s) {
  return typeof s === "string" && /^https?:\/\//.test(s);
}

function decryptPathWebLike(raw) {
  if (!raw) return null;
  if (isPlainUrl(raw)) return raw;

  try {
    const cipherBase64 = String(raw).split(":")[0];
    if (!cipherBase64) return null;

    const keyBytes = Buffer.from("638udh3829162018", "utf8");
    const ivBytes = Buffer.from("fedcba9876543210", "utf8");
    const cipher = Buffer.from(cipherBase64, "base64");

    const decipher = crypto.createDecipheriv("aes-128-cbc", keyBytes, ivBytes);
    let out = Buffer.concat([decipher.update(cipher), decipher.final()]);
    let i = out.toString("utf8");

    const o = i.charCodeAt(i.length - 1);
    if (o > 0 && o <= 16) {
      const tail = i.slice(-o);
      let allSame = true;
      for (let idx = 0; idx < tail.length; idx++) {
        if (tail.charCodeAt(idx) !== o) {
          allSame = false;
          break;
        }
      }
      if (allSame) {
        return i.substring(0, i.length - o);
      }
    }
    return i;
  } catch (err) {
    console.error("decryptPathWebLike error:", err.message);
    return null;
  }
}

function buildQualitiesFromData(data) {
  const qualities = [];

  if (Array.isArray(data.livestream_links)) {
    for (const item of data.livestream_links) {
      const url = decryptPathWebLike(item.path);
      qualities.push({
        quality: String(item.quality || "360p"),
        url,
        raw: item.path,
        type: "hls",
      });
    }
  }

  if (Array.isArray(data.download_links)) {
    for (const item of data.download_links) {
      const url = decryptPathWebLike(item.path);
      qualities.push({
        quality: String(item.quality || "download"),
        url,
        raw: item.path,
        type: "download",
      });
    }
  }

  return qualities;
}

async function fetchVideoDetailsById(courseId, videoId, cls) {
  const apiUrl = `${VIBRANT_API}/get/fetchVideoDetailsById?course_id=${courseId}&video_id=${videoId}&ytflag=0&folder_wise_course=1&lc_app_api_url=`;
  const headers = getOriginHeaders(cls);
  const res = await axios.get(apiUrl, { headers });
  return res.data;
}

// Health check route
app.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "Vibrant Academy API Wrapper",
    endpoints: {
      video: "/vibrant/video/:courseId/:videoId/:cls"
    }
  });
});

// Vibrant API routes
const vibrantRouter = express.Router();

// Health check for vibrant routes
vibrantRouter.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "Vibrant Academy API Wrapper",
    endpoints: {
      video: "/vibrant/video/:courseId/:videoId/:cls"
    }
  });
});

// Decrypted qualities endpoint
vibrantRouter.get("/video/:courseId/:videoId/:cls", async (req, res) => {
  try {
    const { courseId, videoId, cls } = req.params;

    const apiJson = await fetchVideoDetailsById(courseId, videoId, cls);
    const data = apiJson.data;

    if (!data) {
      return res.status(500).json({
        success: false,
        error: "No data field in response",
      });
    }

    const qualities = buildQualitiesFromData(data);

    res.json({
      success: true,
      courseId,
      videoId,
      class: cls,
      title: data.Title,
      encType: data.enc_type,
      iv_string: data.iv_string,
      qualities,
    });
  } catch (err) {
    console.error("Error /vibrant/video:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch/decrypt",
      message: err.message,
    });
  }
});

// Mount the vibrant router
app.use("/vibrant", vibrantRouter);

// Keep the old route for backward compatibility
app.get("/video/:courseId/:videoId/:cls", async (req, res) => {
  try {
    const { courseId, videoId, cls } = req.params;

    const apiJson = await fetchVideoDetailsById(courseId, videoId, cls);
    const data = apiJson.data;

    if (!data) {
      return res.status(500).json({
        success: false,
        error: "No data field in response",
      });
    }

    const qualities = buildQualitiesFromData(data);

    res.json({
      success: true,
      courseId,
      videoId,
      class: cls,
      title: data.Title,
      encType: data.enc_type,
      iv_string: data.iv_string,
      qualities,
    });
  } catch (err) {
    console.error("Error /video:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch/decrypt",
      message: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Vibrant API available at: http://localhost:${PORT}/vibrant/video/:courseId/:videoId/:cls`);
});
