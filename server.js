const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// VIBRANT ACADEMY CONFIGURATION
// ==========================================
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

// ==========================================
// MISSIONJEET (NEXTTOPPERS) CONFIGURATION
// ==========================================
const MISSIONJEET_CONFIG = {
    NT_HEADERS: {
        'accept': 'application/json, text/plain, */*',
        'app_id': '1772100600',
        'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozMTY4MDcyLCJhcHBfaWQiOiIxNzcyMTAwNjAwIiwiZGV2aWNlX2lkIjoiNmZiYzk3OGYtYmEzZC00ZjcyLTg2ZTItZGI3OGI1MzY3YzQwIiwicGxhdGZvcm0iOiIzIiwidXNlcl90eXBlIjoxLCJpYXQiOjE3ODQ0NDMyNzgsImV4cCI6MTc4NzAzNTI3OH0.Ub-QZZHhSpS5i-GZRW79f29JlIHMCng90j6Q3QtlzcU',
        'content-type': 'application/json',
        'origin': 'https://missionjeet.in',
        'platform': '3',
        'referer': 'https://missionjeet.in/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'user_id': '3168072',
        'version': '1'
    },
    
    API: {
        OVERVIEW: 'https://course.nexttoppers.com/course/course-details',
        CONTENT: 'https://course.nexttoppers.com/course/all-content',
        MEDIA: 'https://course.nexttoppers.com/course/content-details',
        CONTENT_DETAILS: 'https://sp-api-seven.vercel.app/api/content-details'
    }
};

// ==========================================
// MISSIONJEET (NEXTTOPPERS) FUNCTIONS
// ==========================================
async function missionjeetRequest(endpoint, method = 'POST', payload = null) {
    try {
        const response = await axios({
            method: method,
            url: endpoint,
            headers: MISSIONJEET_CONFIG.NT_HEADERS,
            data: payload || {},
            timeout: 30000
        });
        
        return {
            success: true,
            data: response.data,
            status: response.status
        };
    } catch (error) {
        console.error('Missionjeet API Error:', error.message);
        return {
            success: false,
            error: error.message,
            status: error.response?.status || 500,
            data: error.response?.data || null
        };
    }
}

async function getMissionjeetCourseOverview(courseId) {
    const payload = { course_id: String(courseId), parent_id: "0" };
    return await missionjeetRequest(MISSIONJEET_CONFIG.API.OVERVIEW, 'POST', payload);
}

async function getMissionjeetCourseContent(courseId, folderId = "0", limit = "1000", page = "1") {
    const payload = {
        course_id: String(courseId),
        folder_id: String(folderId),
        is_free: "",
        keyword: "",
        limit: String(limit),
        page: String(page),
        parent_course_id: "0"
    };
    return await missionjeetRequest(MISSIONJEET_CONFIG.API.CONTENT, 'POST', payload);
}

async function getMissionjeetMediaDetails(contentId, courseId) {
    const payload = {
        content_id: String(contentId),
        course_id: String(courseId)
    };
    return await missionjeetRequest(MISSIONJEET_CONFIG.API.MEDIA, 'POST', payload);
}

async function getMissionjeetContentDetails(contentId, courseId) {
    try {
        const url = `${MISSIONJEET_CONFIG.API.CONTENT_DETAILS}?content_id=${contentId}&course_id=${courseId}`;
        const response = await axios({
            method: 'GET',
            url: url,
            headers: MISSIONJEET_CONFIG.NT_HEADERS,
            timeout: 30000
        });
        
        return {
            success: true,
            data: response.data,
            status: response.status
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            status: error.response?.status || 500
        };
    }
}

async function scanMissionjeetForLiveContent(courseId, maxDepth = 5) {
    const liveItems = [];
    const scannedFolders = new Set();
    
    async function scanFolder(folderId, depth = 0) {
        if (depth > maxDepth || scannedFolders.has(folderId)) return;
        scannedFolders.add(folderId);
        
        const content = await getMissionjeetCourseContent(courseId, folderId);
        if (!content.success || !content.data || !content.data.data) return;
        
        const items = Array.isArray(content.data.data) 
            ? content.data.data 
            : (Array.isArray(content.data.data.list) ? content.data.data.list : []);
        
        const subFolders = [];
        
        for (const item of items) {
            const type = (item.type || "").toLowerCase();
            const d = item.data || {};
            const vType = parseInt(item.video_type || d.video_type || 0);
            
            if (vType === 3 || type === 'live' || 
                parseInt(d.is_live) === 1 || parseInt(item.is_live) === 1) {
                liveItems.push({ ...item, parent_folder_id: folderId });
            }
            
            if (type === 'folder' || type === 'subject' || type === 'chapter') {
                const id = d.id || item.entity_id || item.id;
                if (id) subFolders.push(id);
            }
        }
        
        for (const subId of subFolders) {
            await scanFolder(subId, depth + 1);
        }
    }
    
    await scanFolder("0");
    return liveItems;
}

// ==========================================
// VIBRANT ACADEMY ROUTES
// ==========================================

// Health check route
app.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "Multi-Platform API Wrapper",
    platforms: {
      vibrant: {
        prefix: "/vibrant",
        endpoints: {
          video: "/vibrant/video/:courseId/:videoId/:cls"
        }
      },
      missionjeet: {
        prefix: "/missionjeet",
        endpoints: {
          overview: "/missionjeet/course/:courseId/overview",
          content: "/missionjeet/course/:courseId/content",
          media: "/missionjeet/media/:contentId",
          contentDetails: "/missionjeet/content-details/:contentId",
          live: "/missionjeet/course/:courseId/live",
          discover: "/missionjeet/discover",
          proxy: "/missionjeet/proxy"
        }
      }
    }
  });
});

// Vibrant API routes
const vibrantRouter = express.Router();

vibrantRouter.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "Vibrant Academy API Wrapper",
    endpoints: {
      video: "/vibrant/video/:courseId/:videoId/:cls"
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

// ==========================================
// MISSIONJEET (NEXTTOPPERS) ROUTES
// ==========================================
const missionjeetRouter = express.Router();

missionjeetRouter.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "Missionjeet API Wrapper",
    endpoints: {
      overview: "/missionjeet/course/:courseId/overview",
      content: "/missionjeet/course/:courseId/content",
      media: "/missionjeet/media/:contentId",
      contentDetails: "/missionjeet/content-details/:contentId",
      live: "/missionjeet/course/:courseId/live",
      discover: "/missionjeet/discover",
      proxy: "/missionjeet/proxy"
    }
  });
});

missionjeetRouter.get('/course/:courseId/overview', async (req, res) => {
    const { courseId } = req.params;
    const result = await getMissionjeetCourseOverview(courseId);
    res.status(result.success ? 200 : (result.status || 500)).json(result);
});

missionjeetRouter.get('/course/:courseId/content', async (req, res) => {
    const { courseId } = req.params;
    const { folder_id = "0", limit = "1000", page = "1" } = req.query;
    const result = await getMissionjeetCourseContent(courseId, folder_id, limit, page);
    res.status(result.success ? 200 : (result.status || 500)).json(result);
});

missionjeetRouter.get('/media/:contentId', async (req, res) => {
    const { contentId } = req.params;
    const { courseId } = req.query;
    
    if (!courseId) {
        return res.status(400).json({
            success: false,
            error: 'courseId is required'
        });
    }
    
    const result = await getMissionjeetMediaDetails(contentId, courseId);
    res.status(result.success ? 200 : (result.status || 500)).json(result);
});

missionjeetRouter.get('/content-details/:contentId', async (req, res) => {
    const { contentId } = req.params;
    const { courseId } = req.query;
    
    if (!courseId) {
        return res.status(400).json({
            success: false,
            error: 'courseId is required'
        });
    }
    
    const result = await getMissionjeetContentDetails(contentId, courseId);
    res.status(result.success ? 200 : (result.status || 500)).json(result);
});

missionjeetRouter.get('/course/:courseId/live', async (req, res) => {
    const { courseId } = req.params;
    const { maxDepth = 5 } = req.query;
    
    try {
        const liveItems = await scanMissionjeetForLiveContent(courseId, parseInt(maxDepth));
        res.json({
            success: true,
            data: liveItems,
            count: liveItems.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

missionjeetRouter.get('/discover', async (req, res) => {
    const COURSE_IDS = [];
    for (let i = 185; i >= 184; i--) COURSE_IDS.push(i);
    for (let i = 152; i >= 151; i--) COURSE_IDS.push(i);
    for (let i = 161; i >= 160; i--) COURSE_IDS.push(i);
    
    const results = [];
    
    for (const id of COURSE_IDS) {
        try {
            const overview = await getMissionjeetCourseOverview(id);
            if (overview.success && overview.data && overview.data.data) {
                const details = overview.data.data.find(d => d.type === 'overview');
                if (details && details.data) {
                    const layout = details.data.find(l => l.layout_type === 'details');
                    if (layout && layout.layout_data && layout.layout_data[0]) {
                        const batchInfo = layout.layout_data[0];
                        results.push({
                            id: id,
                            title: batchInfo.title,
                            thumbnail: batchInfo.thumbnail,
                            price: batchInfo.offer_price || 0,
                            mrp: batchInfo.mrp || 0,
                            description: batchInfo.description
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`Failed to fetch course ${id}:`, error.message);
        }
    }
    
    res.json({
        success: true,
        data: results,
        count: results.length
    });
});

missionjeetRouter.post('/proxy', async (req, res) => {
    const { target_url, method = 'POST', payload = null } = req.body;
    
    if (!target_url) {
        return res.status(400).json({
            success: false,
            error: 'target_url is required'
        });
    }
    
    const result = await missionjeetRequest(target_url, method, payload);
    res.status(result.success ? 200 : (result.status || 500)).json(result);
});

app.use("/missionjeet", missionjeetRouter);

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`🚀 Multi-Platform API Server is running`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`========================================`);
  console.log(`📚 Available Platforms:`);
  console.log(`  🎓 Vibrant Academy: http://localhost:${PORT}/vibrant/video/:courseId/:videoId/:cls`);
  console.log(`  🎯 Missionjeet: http://localhost:${PORT}/missionjeet/*`);
  console.log(`========================================`);
});
