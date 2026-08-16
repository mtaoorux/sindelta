const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===== CORS - ALLOW ALL ORIGINS =====
app.use(cors()); // Allow all origins

// ===== CONSTANTS =====
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
  // Default to class 12 if invalid
  console.warn(`Invalid class "${cls}", defaulting to 12`);
  return { id: id12, auth: auth12 };
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

// ===== DECRYPTION FUNCTIONS =====
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

function decryptContentItem(item) {
  if (!item) return item;
  if (Array.isArray(item)) {
    return item.map(decryptContentItem);
  }
  if (typeof item !== 'object') return item;
  
  const decrypted = { ...item };
  
  const fieldsToDecrypt = [
    'path', 'file_url', 'video_url', 'thumbnail_url', 
    'poster_url', 'pdf_url', 'test_url', 'content_url',
    'stream_url', 'download_url', 'encrypted_url',
    'url', 'link', 'file', 'video', 'image',
    'thumbnail', 'poster', 'pdf', 'content'
  ];
  
  Object.keys(decrypted).forEach(key => {
    const shouldDecrypt = fieldsToDecrypt.some(field => 
      key.toLowerCase().includes(field.toLowerCase())
    );
    
    if (shouldDecrypt && typeof decrypted[key] === 'string') {
      const decryptedValue = decryptPathWebLike(decrypted[key]);
      if (decryptedValue) {
        decrypted[`${key}_decrypted`] = decryptedValue;
        if (!isPlainUrl(decrypted[key])) {
          decrypted[key] = decryptedValue;
        }
      }
    }
  });
  
  Object.keys(decrypted).forEach(key => {
    if (decrypted[key] && typeof decrypted[key] === 'object') {
      decrypted[key] = decryptContentItem(decrypted[key]);
    }
  });
  
  return decrypted;
}

function decryptAllData(data, deep = true) {
  if (!data) return data;
  
  if (Array.isArray(data)) {
    return data.map(item => {
      if (deep && typeof item === 'object') {
        return decryptAllData(item, deep);
      }
      return decryptContentItem(item);
    });
  }
  
  if (typeof data === 'object') {
    const result = { ...data };
    
    if (result.data && Array.isArray(result.data)) {
      result.data = result.data.map(item => decryptContentItem(item));
    }
    
    if (result.contents && Array.isArray(result.contents)) {
      result.contents = result.contents.map(item => decryptContentItem(item));
    }
    
    const decryptedItem = decryptContentItem(result);
    
    if (deep) {
      Object.keys(decryptedItem).forEach(key => {
        if (decryptedItem[key] && typeof decryptedItem[key] === 'object') {
          decryptedItem[key] = decryptAllData(decryptedItem[key], deep);
        }
      });
    }
    
    return decryptedItem;
  }
  
  return data;
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

// ===== API FETCH FUNCTIONS =====
async function fetchVideoDetailsById(courseId, videoId, cls) {
  const apiUrl = `${VIBRANT_API}/get/fetchVideoDetailsById?course_id=${courseId}&video_id=${videoId}&ytflag=0&folder_wise_course=1&lc_app_api_url=`;
  const headers = getOriginHeaders(cls);
  const res = await axios.get(apiUrl, { headers, timeout: 30000 });
  return res.data;
}

async function fetchRootContents(courseId, start = 0, cls, decrypt = false) {
  if (!courseId) throw new Error("courseId is required");
  if (!cls) throw new Error("cls is required");

  const url = `${VIBRANT_API}/get/folder_contentsv3?course_id=${encodeURIComponent(courseId)}&parent_id=-1&start=${start}`;
  const headers = getOriginHeaders(cls);
  
  const res = await axios.get(url, { headers, timeout: 30000 });
  const data = res.data;

  if (data.status === 200) {
    const contents = data.data || [];
    if (decrypt) {
      return decryptAllData(contents, true);
    }
    return contents;
  } else {
    throw new Error(data.message || "Failed to fetch root contents");
  }
}

async function fetchFolderContents(courseId, folderId, start = 0, cls, decrypt = false) {
  if (!courseId) throw new Error("courseId is required");
  if (!folderId) throw new Error("folderId is required");
  if (!cls) throw new Error("cls is required");

  const url = `${VIBRANT_API}/get/folder_contentsv3?course_id=${encodeURIComponent(courseId)}&parent_id=${encodeURIComponent(folderId)}&start=${start}`;
  const headers = getOriginHeaders(cls);
  
  const res = await axios.get(url, { headers, timeout: 30000 });
  const data = res.data;

  if (data.status === 200) {
    const contents = data.data || [];
    if (decrypt) {
      return decryptAllData(contents, true);
    }
    return contents;
  } else {
    throw new Error(data.message || "Failed to fetch folder contents");
  }
}

// ===== LIVE CONTENT FUNCTIONS =====

async function fetchLiveContent(courseId, cls, decrypt = false) {
  if (!courseId) throw new Error("courseId is required");
  if (!cls) throw new Error("cls is required");

  const url = `${VIBRANT_API}/get/course_contents_by_live_status?course_id=${encodeURIComponent(courseId)}&start=0`;
  const headers = getOriginHeaders(cls);
  
  try {
    const res = await axios.get(url, { headers, timeout: 30000 });
    const data = res.data;

    if (data.status === 200) {
      const result = {
        live: data.data?.live || [],
        upcoming: data.data?.upcoming || []
      };
      
      if (decrypt) {
        return {
          live: decryptAllData(result.live, true),
          upcoming: decryptAllData(result.upcoming, true)
        };
      }
      return result;
    } else {
      throw new Error(data.message || "Failed to fetch live content");
    }
  } catch (error) {
    console.error("fetchLiveContent error:", error.message);
    throw error;
  }
}

async function fetchPreviousLiveVideos(courseId, cls, start = 0, decrypt = false) {
  if (!courseId) throw new Error("courseId is required");
  if (!cls) throw new Error("cls is required");

  const url = `${VIBRANT_API}/get/get_previous_live_videos?course_id=${encodeURIComponent(courseId)}&start=${start}&folder_wise_course=1`;
  const headers = getOriginHeaders(cls);
  
  try {
    const res = await axios.get(url, { headers, timeout: 30000 });
    const data = res.data;

    if (data.status === 200) {
      const contents = data.data || [];
      if (decrypt) {
        return decryptAllData(contents, true);
      }
      return contents;
    } else {
      throw new Error(data.message || "Failed to fetch previous live videos");
    }
  } catch (error) {
    console.error("fetchPreviousLiveVideos error:", error.message);
    throw error;
  }
}

// ===== ROUTES =====

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "Vibrant Academy API Wrapper (CORS enabled - all origins allowed)",
    endpoints: {
      video: "/vibrant/video/:courseId/:videoId/:cls",
      rootContents: "/vibrant/contents/:courseId/:cls",
      folderContents: "/vibrant/contents/:courseId/:folderId/:cls",
      allContents: "/vibrant/contents/:courseId/:cls/all",
      liveContent: "/vibrant/live/:courseId/:cls",
      previousLive: "/vibrant/previous-live/:courseId/:cls",
      proxy: "/vibrant/proxy/:endpoint",
      decryptContents: "/vibrant/contents/decrypt/:courseId/:cls",
      decryptFolderContents: "/vibrant/contents/decrypt/:courseId/:folderId/:cls",
      decryptAny: "/vibrant/decrypt (POST)",
      decryptUrl: "/vibrant/decrypt/url (POST)"
    }
  });
});

const vibrantRouter = express.Router();

// ===== LIVE CONTENT ROUTES =====

vibrantRouter.get("/live/:courseId/:cls", async (req, res) => {
  try {
    const { courseId, cls } = req.params;
    const decrypt = req.query.decrypt === 'true';

    const result = await fetchLiveContent(courseId, cls, decrypt);

    res.json({
      success: true,
      courseId,
      class: cls,
      decrypted: decrypt,
      live: result.live,
      upcoming: result.upcoming,
    });
  } catch (err) {
    console.error("Error /vibrant/live:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch live content",
      message: err.message,
    });
  }
});

vibrantRouter.get("/previous-live/:courseId/:cls", async (req, res) => {
  try {
    const { courseId, cls } = req.params;
    const start = parseInt(req.query.start) || 0;
    const decrypt = req.query.decrypt === 'true';

    const contents = await fetchPreviousLiveVideos(courseId, cls, start, decrypt);

    res.json({
      success: true,
      courseId,
      class: cls,
      start,
      decrypted: decrypt,
      count: contents.length,
      contents,
    });
  } catch (err) {
    console.error("Error /vibrant/previous-live:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch previous live videos",
      message: err.message,
    });
  }
});

// ===== PROXY ROUTE =====
vibrantRouter.all("/proxy/:endpoint", async (req, res) => {
  try {
    const { endpoint } = req.params;
    const cls = req.query.cls || req.body?.cls || '12';
    const headers = getOriginHeaders(cls);
    
    let apiUrl = `${VIBRANT_API}/get/${endpoint}`;
    
    const queryParams = { ...req.query };
    delete queryParams.cls;
    
    const queryString = new URLSearchParams(queryParams).toString();
    if (queryString) {
      apiUrl += `?${queryString}`;
    }
    
    const config = {
      headers,
      timeout: 30000,
    };
    
    let response;
    if (req.method === 'POST' || req.method === 'PUT') {
      response = await axios({
        method: req.method,
        url: apiUrl,
        data: req.body,
        ...config
      });
    } else {
      response = await axios.get(apiUrl, config);
    }
    
    const shouldDecrypt = req.query.decrypt === 'true' || req.body?.decrypt === true;
    let responseData = response.data;
    
    if (shouldDecrypt && responseData) {
      responseData = decryptAllData(responseData, true);
    }
    
    res.json({
      success: true,
      endpoint,
      decrypted: shouldDecrypt,
      data: responseData,
    });
  } catch (err) {
    console.error("Error /vibrant/proxy:", err.message);
    res.status(500).json({
      success: false,
      error: "Proxy request failed",
      message: err.message,
    });
  }
});

// ===== OTHER ROUTES =====

vibrantRouter.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "Vibrant Academy API Wrapper",
    endpoints: {
      video: "/vibrant/video/:courseId/:videoId/:cls",
      rootContents: "/vibrant/contents/:courseId/:cls",
      folderContents: "/vibrant/contents/:courseId/:folderId/:cls",
      allContents: "/vibrant/contents/:courseId/:cls/all",
      liveContent: "/vibrant/live/:courseId/:cls",
      previousLive: "/vibrant/previous-live/:courseId/:cls",
      proxy: "/vibrant/proxy/:endpoint",
      decryptContents: "/vibrant/contents/decrypt/:courseId/:cls",
      decryptFolderContents: "/vibrant/contents/decrypt/:courseId/:folderId/:cls",
      decryptAny: "/vibrant/decrypt (POST)",
      decryptUrl: "/vibrant/decrypt/url (POST)"
    }
  });
});

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
    const decryptedData = decryptAllData(data, true);

    res.json({
      success: true,
      courseId,
      videoId,
      class: cls,
      title: data.Title,
      encType: data.enc_type,
      iv_string: data.iv_string,
      qualities,
      decryptedData,
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

vibrantRouter.get("/contents/:courseId/:cls", async (req, res) => {
  try {
    const { courseId, cls } = req.params;
    const start = parseInt(req.query.start) || 0;
    const decrypt = req.query.decrypt === 'true';

    const contents = await fetchRootContents(courseId, start, cls, decrypt);

    res.json({
      success: true,
      courseId,
      class: cls,
      start,
      count: contents.length,
      decrypted: decrypt,
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

vibrantRouter.get("/contents/:courseId/:cls/all", async (req, res) => {
  try {
    const { courseId, cls } = req.params;
    const decrypt = req.query.decrypt === 'true';

    const rootContents = await fetchRootContents(courseId, 0, cls, decrypt);
    let allContents = [...rootContents];
    
    for (const item of rootContents) {
      if (item.material_type === 'FOLDER') {
        try {
          const folderContents = await fetchFolderContents(courseId, item.id, 0, cls, decrypt);
          allContents = allContents.concat(folderContents);
        } catch (e) {
          console.warn(`Failed to fetch folder ${item.id}:`, e.message);
        }
      }
    }

    res.json({
      success: true,
      courseId,
      class: cls,
      count: allContents.length,
      decrypted: decrypt,
      contents: allContents,
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

vibrantRouter.get("/contents/decrypt/:courseId/:cls", async (req, res) => {
  try {
    const { courseId, cls } = req.params;
    const start = parseInt(req.query.start) || 0;

    const contents = await fetchRootContents(courseId, start, cls, true);

    res.json({
      success: true,
      courseId,
      class: cls,
      start,
      count: contents.length,
      decrypted: true,
      contents,
    });
  } catch (err) {
    console.error("Error /vibrant/contents/decrypt:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch and decrypt root contents",
      message: err.message,
    });
  }
});

vibrantRouter.get("/contents/:courseId/:folderId/:cls", async (req, res) => {
  try {
    const { courseId, folderId, cls } = req.params;
    const start = parseInt(req.query.start) || 0;
    const recursive = req.query.recursive === 'true';
    const decrypt = req.query.decrypt === 'true';

    let contents;
    if (recursive) {
      const folderContents = await fetchFolderContents(courseId, folderId, start, cls, decrypt);
      contents = folderContents;
      for (const item of folderContents) {
        if (item.material_type === 'FOLDER') {
          try {
            const subContents = await fetchFolderContents(courseId, item.id, 0, cls, decrypt);
            contents = contents.concat(subContents);
          } catch (e) {}
        }
      }
    } else {
      contents = await fetchFolderContents(courseId, folderId, start, cls, decrypt);
    }

    res.json({
      success: true,
      courseId,
      folderId,
      class: cls,
      start: recursive ? 0 : start,
      recursive,
      decrypted: decrypt,
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

vibrantRouter.get("/contents/decrypt/:courseId/:folderId/:cls", async (req, res) => {
  try {
    const { courseId, folderId, cls } = req.params;
    const start = parseInt(req.query.start) || 0;
    const recursive = req.query.recursive === 'true';

    let contents;
    if (recursive) {
      const folderContents = await fetchFolderContents(courseId, folderId, start, cls, true);
      contents = folderContents;
      for (const item of folderContents) {
        if (item.material_type === 'FOLDER') {
          try {
            const subContents = await fetchFolderContents(courseId, item.id, 0, cls, true);
            contents = contents.concat(subContents);
          } catch (e) {}
        }
      }
    } else {
      contents = await fetchFolderContents(courseId, folderId, start, cls, true);
    }

    res.json({
      success: true,
      courseId,
      folderId,
      class: cls,
      start: recursive ? 0 : start,
      recursive,
      decrypted: true,
      count: contents.length,
      contents,
    });
  } catch (err) {
    console.error("Error /vibrant/contents/decrypt/:folderId:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch and decrypt folder contents",
      message: err.message,
    });
  }
});

vibrantRouter.post("/decrypt", (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data) {
      return res.status(400).json({
        success: false,
        error: "Missing data to decrypt"
      });
    }
    
    const decrypted = decryptAllData(data, true);
    
    res.json({
      success: true,
      decrypted,
    });
  } catch (err) {
    console.error("Error /vibrant/decrypt:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to decrypt data",
      message: err.message,
    });
  }
});

vibrantRouter.post("/decrypt/url", (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: "Missing URL to decrypt"
      });
    }
    
    const decrypted = decryptPathWebLike(url);
    
    res.json({
      success: true,
      original: url,
      decrypted: decrypted,
    });
  } catch (err) {
    console.error("Error /vibrant/decrypt/url:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to decrypt URL",
      message: err.message,
    });
  }
});

// Mount the vibrant router
app.use("/vibrant", vibrantRouter);

// Legacy route for backward compatibility
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

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Vibrant API available at: http://localhost:${PORT}/vibrant`);
  console.log(`\n=== CORS: ALL ORIGINS ALLOWED ===`);
  console.log(`\n=== LIVE ENDPOINTS ===`);
  console.log(`  Live & Upcoming: /vibrant/live/:courseId/:cls`);
  console.log(`  Previous Live:   /vibrant/previous-live/:courseId/:cls`);
  console.log(`  Proxy:           /vibrant/proxy/:endpoint`);
  console.log(`\nExample: http://localhost:${PORT}/vibrant/live/12345/12`);
  console.log(`\nCORS: Enabled for all origins`);
});
