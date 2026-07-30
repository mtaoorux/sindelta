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

// ===== BATCH CONTENT API FUNCTIONS =====

/**
 * Fetch root folder contents for a course
 * @param {string|number} courseId - The course/batch ID
 * @param {number} start - Pagination start index (default: 0)
 * @param {string} cls - Class (11 or 12)
 * @returns {Promise<Array>} Array of content items
 */
async function fetchRootContents(courseId, start = 0, cls) {
  if (!courseId) throw new Error("courseId is required");
  if (!cls) throw new Error("cls is required");

  const url = `${VIBRANT_API}/get/folder_contentsv3?course_id=${encodeURIComponent(courseId)}&parent_id=-1&start=${start}`;
  const headers = getOriginHeaders(cls);
  
  const res = await axios.get(url, { headers });
  const data = res.data;

  if (data.status === 200) {
    return data.data || [];
  } else {
    throw new Error(data.message || "Failed to fetch root contents");
  }
}

/**
 * Fetch folder contents for a specific folder
 * @param {string|number} courseId - The course/batch ID
 * @param {string|number} folderId - The folder ID
 * @param {number} start - Pagination start index (default: 0)
 * @param {string} cls - Class (11 or 12)
 * @returns {Promise<Array>} Array of content items
 */
async function fetchFolderContents(courseId, folderId, start = 0, cls) {
  if (!courseId) throw new Error("courseId is required");
  if (!folderId) throw new Error("folderId is required");
  if (!cls) throw new Error("cls is required");

  const url = `${VIBRANT_API}/get/folder_contentsv3?course_id=${encodeURIComponent(courseId)}&parent_id=${encodeURIComponent(folderId)}&start=${start}`;
  const headers = getOriginHeaders(cls);
  
  const res = await axios.get(url, { headers });
  const data = res.data;

  if (data.status === 200) {
    return data.data || [];
  } else {
    throw new Error(data.message || "Failed to fetch folder contents");
  }
}

/**
 * Recursively fetch all contents in a course/folder
 * @param {string|number} courseId - The course/batch ID
 * @param {string|number} folderId - The folder ID (-1 for root)
 * @param {string} cls - Class (11 or 12)
 * @returns {Promise<Array>} Array of all content items
 */
async function fetchAllContentsRecursive(courseId, folderId = -1, cls) {
  const allContents = [];
  let start = 0;
  let hasMore = true;

  while (hasMore) {
    const contents = folderId === -1 
      ? await fetchRootContents(courseId, start, cls)
      : await fetchFolderContents(courseId, folderId, start, cls);
    
    if (contents.length === 0) {
      hasMore = false;
    } else {
      allContents.push(...contents);
      start += contents.length;
      // If less than expected page size, we've reached the end
      if (contents.length < 20) { // Typical page size
        hasMore = false;
      }
    }
  }

  return allContents;
}

// ===== ROUTES =====

// Health check route
app.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "Vibrant Academy API Wrapper",
    endpoints: {
      video: "/vibrant/video/:courseId/:videoId/:cls",
      rootContents: "/vibrant/contents/:courseId/:cls",
      folderContents: "/vibrant/contents/:courseId/:folderId/:cls",
      allContents: "/vibrant/contents/:courseId/:cls/all"
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
      video: "/vibrant/video/:courseId/:videoId/:cls",
      rootContents: "/vibrant/contents/:courseId/:cls",
      folderContents: "/vibrant/contents/:courseId/:folderId/:cls",
      allContents: "/vibrant/contents/:courseId/:cls/all"
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

// Get root contents of a course
vibrantRouter.get("/contents/:courseId/:cls", async (req, res) => {
  try {
    const { courseId, cls } = req.params;
    const start = parseInt(req.query.start) || 0;

    const contents = await fetchRootContents(courseId, start, cls);

    res.json({
      success: true,
      courseId,
      class: cls,
      start,
      count: contents.length,
      contents,
    });
  } catch (err) {
    console.error("Error /vibrant/contents:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch root contents",
      message: err.message,
    });
  }
});

// Get all contents of a course recursively
vibrantRouter.get("/contents/:courseId/:cls/all", async (req, res) => {
  try {
    const { courseId, cls } = req.params;

    const contents = await fetchAllContentsRecursive(courseId, -1, cls);

    res.json({
      success: true,
      courseId,
      class: cls,
      count: contents.length,
      contents,
    });
  } catch (err) {
    console.error("Error /vibrant/contents/all:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch all contents",
      message: err.message,
    });
  }
});

// Get folder contents
vibrantRouter.get("/contents/:courseId/:folderId/:cls", async (req, res) => {
  try {
    const { courseId, folderId, cls } = req.params;
    const start = parseInt(req.query.start) || 0;

    // Check if recursive flag is set
    const recursive = req.query.recursive === 'true';

    let contents;
    if (recursive) {
      contents = await fetchAllContentsRecursive(courseId, folderId, cls);
    } else {
      contents = await fetchFolderContents(courseId, folderId, start, cls);
    }

    res.json({
      success: true,
      courseId,
      folderId,
      class: cls,
      start: recursive ? 0 : start,
      recursive,
      count: contents.length,
      contents,
    });
  } catch (err) {
    console.error("Error /vibrant/contents/:folderId:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch folder contents",
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
  console.log(`Vibrant API available at: http://localhost:${PORT}/vibrant`);
  console.log(`Example endpoints:`);
  console.log(`  - Video: http://localhost:${PORT}/vibrant/video/:courseId/:videoId/:cls`);
  console.log(`  - Root Contents: http://localhost:${PORT}/vibrant/contents/:courseId/:cls`);
  console.log(`  - Folder Contents: http://localhost:${PORT}/vibrant/contents/:courseId/:folderId/:cls`);
  console.log(`  - All Contents: http://localhost:${PORT}/vibrant/contents/:courseId/:cls/all`);
});
