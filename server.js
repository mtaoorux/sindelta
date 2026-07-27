const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

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

function getVibrantCreds(cls) {
  if (cls === "12" || cls === "11") {
    return cls === "12" 
      ? { id: id12, auth: auth12 }
      : { id: id11, auth: auth11 };
  }
  throw new Error("Invalid class (use 11 or 12)");
}

function getVibrantHeaders(cls) {
  const { id, auth } = getVibrantCreds(cls);
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

async function fetchVibrantVideoDetails(courseId, videoId, cls) {
  const apiUrl = `${VIBRANT_API}/get/fetchVideoDetailsById?course_id=${courseId}&video_id=${videoId}&ytflag=0&folder_wise_course=1&lc_app_api_url=`;
  const headers = getVibrantHeaders(cls);
  const res = await axios.get(apiUrl, { headers });
  return res.data;
}

// ==========================================
// MISSIONJEET (NEXTTOPPERS) CONFIGURATION
// ==========================================
const NT_HEADERS = {
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
};

const NT_API_BASE = 'https://course.nexttoppers.com/course';
const PDF_BACKEND = 'https://sp-api-seven.vercel.app/api';

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
    const item = cache.get(key);
    if (item && Date.now() - item.timestamp < CACHE_TTL) {
        return item.data;
    }
    cache.delete(key);
    return null;
}

function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

async function proxyFetch(targetUrl, method = 'POST', payload = null) {
    try {
        const config = {
            method: method.toLowerCase(),
            url: targetUrl,
            headers: NT_HEADERS,
            timeout: 30000
        };
        
        if (payload && method === 'POST') {
            config.data = payload;
        }
        
        const response = await axios(config);
        
        if (typeof response.data === 'string') {
            try {
                const jsonStart = response.data.indexOf('{');
                const jsonEnd = response.data.lastIndexOf('}') + 1;
                if (jsonStart !== -1 && jsonEnd > jsonStart) {
                    return JSON.parse(response.data.substring(jsonStart, jsonEnd));
                }
            } catch (e) {
                console.error('JSON parse error:', e);
            }
        }
        
        return response.data;
    } catch (error) {
        console.error('Proxy fetch error:', error.message);
        throw error;
    }
}

// ==========================================
// MAIN ROOT ENDPOINT
// ==========================================
app.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "Combined API Server",
    services: {
      vibrant: "/vibrant",
      missionjeet: "/missionjeet"
    },
    endpoints: {
      vibrant_video: "/vibrant/video/:courseId/:videoId/:cls",
      missionjeet_health: "/missionjeet/api/health"
    }
  });
});

// ==========================================
// VIBRANT ROUTER (/vibrant)
// ==========================================
const vibrantRouter = express.Router();

vibrantRouter.get("/", (req, res) => {
  res.json({
    status: "running",
    service: "Vibrant Academy API",
    endpoints: {
      video: "/vibrant/video/:courseId/:videoId/:cls"
    }
  });
});

vibrantRouter.get("/video/:courseId/:videoId/:cls", async (req, res) => {
  try {
    const { courseId, videoId, cls } = req.params;

    const apiJson = await fetchVibrantVideoDetails(courseId, videoId, cls);
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

// ==========================================
// MISSIONJEET ROUTER (/missionjeet)
// ==========================================
const missionjeetRouter = express.Router();

// Health check
missionjeetRouter.get("/api/health", (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        service: 'MissionJeet API',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        cacheSize: cache.size,
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
    });
});

// Main proxy endpoint
missionjeetRouter.post("/api/v1/proxy", async (req, res) => {
    try {
        const { target_url, method = 'POST', payload = null, headers = {} } = req.body;
        
        if (!target_url) {
            return res.status(400).json({ success: false, error: 'target_url is required' });
        }
        
        console.log(`MissionJeet Proxy: ${method} ${target_url}`);
        
        const mergedHeaders = { ...NT_HEADERS, ...headers };
        
        const config = {
            method: method.toLowerCase(),
            url: target_url,
            headers: mergedHeaders,
            timeout: 30000
        };
        
        if (payload && method === 'POST') {
            config.data = payload;
        }
        
        const response = await axios(config);
        res.json(response.data);
        
    } catch (error) {
        console.error('Proxy error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Proxy request failed'
        });
    }
});

// Course overview/details
missionjeetRouter.post("/api/course/overview", async (req, res) => {
    try {
        const { course_id, parent_id = '0' } = req.body;
        
        if (!course_id) {
            return res.status(400).json({ success: false, error: 'course_id is required' });
        }
        
        const cacheKey = `overview_${course_id}`;
        const cached = getCached(cacheKey);
        if (cached) return res.json(cached);
        
        const data = await proxyFetch(`${NT_API_BASE}/course-details`, 'POST', {
            course_id: String(course_id),
            parent_id: String(parent_id)
        });
        
        if (data && data.success && data.data) {
            const overview = data.data.find(d => d.type === 'overview');
            if (overview && overview.data) {
                const details = overview.data.find(l => l.layout_type === 'details');
                if (details && details.layout_data && details.layout_data[0]) {
                    const info = details.layout_data[0];
                    const formatted = {
                        success: true,
                        data: {
                            id: info.id || course_id,
                            title: info.title,
                            thumbnail: info.thumbnail || 'https://i.ibb.co/dJbZq97B/2671188-1-logo.jpg',
                            price: info.offer_price || 0,
                            mrp: info.mrp || 0,
                            description: info.description || '',
                            instructor: info.instructor || '',
                            language: info.language || '',
                            duration: info.duration || '',
                            startDate: info.start_date || '',
                            totalLectures: info.total_lectures || 0
                        }
                    };
                    setCache(cacheKey, formatted);
                    return res.json(formatted);
                }
            }
        }
        
        res.json(data || { success: false, error: 'No data found' });
        
    } catch (error) {
        console.error('Course overview error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch course overview' });
    }
});

// Get all course content
missionjeetRouter.post("/api/course/content", async (req, res) => {
    try {
        const {
            course_id,
            folder_id = '0',
            limit = '1000',
            page = '1',
            keyword = ''
        } = req.body;
        
        if (!course_id) {
            return res.status(400).json({ success: false, error: 'course_id is required' });
        }
        
        const data = await proxyFetch(`${NT_API_BASE}/all-content`, 'POST', {
            course_id: String(course_id),
            folder_id: String(folder_id),
            is_free: '',
            keyword: keyword,
            limit: String(limit),
            page: String(page),
            parent_course_id: '0'
        });
        
        if (data && data.data) {
            let items = [];
            if (Array.isArray(data.data)) {
                items = data.data;
            } else if (Array.isArray(data.data.list)) {
                items = data.data.list;
            }
            
            data.data = items.map(item => ({
                id: item.data?.id || item.entity_id || item.id,
                title: item.title || item.data?.title || 'Untitled',
                type: (item.type || '').toLowerCase(),
                thumbnail: item.thumbnail || item.data?.thumbnail || 'https://i.ibb.co/dJbZq97B/2671188-1-logo.jpg',
                duration: item.duration || item.data?.duration || 0,
                videoType: parseInt(item.video_type || item.data?.video_type || 0),
                fileType: parseInt(item.file_type || item.data?.file_type || 0),
                fileUrl: item.data?.file_url || '',
                downloadUrls: item.data?.download_urls || '',
                isLive: parseInt(item.is_live || item.data?.is_live || 0) === 1,
                liveStatus: parseInt(item.live_status || item.data?.live_status || 0),
                liveFrom: parseInt(item.live_from || item.data?.live_from || 0),
                createdAt: item.created_at || item.data?.created_at || '',
                mqttCredentials: item.data?.mqtt_live_cred || null
            }));
        }
        
        res.json(data);
        
    } catch (error) {
        console.error('Content fetch error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch content' });
    }
});

// Get content details
missionjeetRouter.get("/api/content-details", async (req, res) => {
    try {
        const { content_id, course_id } = req.query;
        
        if (!content_id || !course_id) {
            return res.status(400).json({ 
                success: false, 
                error: 'content_id and course_id are required' 
            });
        }
        
        try {
            const data = await proxyFetch(`${NT_API_BASE}/content-details`, 'POST', {
                content_id: String(content_id),
                course_id: String(course_id)
            });
            
            if (data && data.success) {
                return res.json(data);
            }
        } catch (e) {
            console.log('Primary content details failed, trying fallback...');
        }
        
        const response = await axios.get(`${PDF_BACKEND}/content-details`, {
            params: { content_id, course_id },
            headers: NT_HEADERS
        });
        
        res.json(response.data);
        
    } catch (error) {
        console.error('Content details error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch content details' });
    }
});

// Search courses
missionjeetRouter.post("/api/course/search", async (req, res) => {
    try {
        const { keyword } = req.body;
        
        if (!keyword) {
            return res.status(400).json({ success: false, error: 'keyword is required' });
        }
        
        const data = await proxyFetch(`${NT_API_BASE}/search`, 'POST', {
            keyword,
            limit: '50',
            page: '1'
        });
        
        res.json(data);
        
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ success: false, error: 'Search failed' });
    }
});

// Live classes
missionjeetRouter.post("/api/course/live-classes", async (req, res) => {
    try {
        const { course_id } = req.body;
        
        if (!course_id) {
            return res.status(400).json({ success: false, error: 'course_id is required' });
        }
        
        const contentData = await proxyFetch(`${NT_API_BASE}/all-content`, 'POST', {
            course_id: String(course_id),
            folder_id: '0',
            limit: '5000',
            page: '1',
            parent_course_id: '0'
        });
        
        let liveClasses = [];
        
        if (contentData && contentData.data) {
            let items = [];
            if (Array.isArray(contentData.data)) {
                items = contentData.data;
            } else if (Array.isArray(contentData.data.list)) {
                items = contentData.data.list;
            }
            
            liveClasses = items.filter(item => {
                const vType = parseInt(item.video_type || item.data?.video_type || 0);
                const isLive = parseInt(item.is_live || item.data?.is_live || 0);
                const liveStatus = parseInt(item.live_status || item.data?.live_status || 0);
                
                return vType === 3 || isLive === 1 || liveStatus === 1 || liveStatus === 2;
            }).map(item => ({
                id: item.data?.id || item.entity_id || item.id,
                title: item.title || item.data?.title || 'Live Class',
                thumbnail: item.thumbnail || item.data?.thumbnail || 'https://i.ibb.co/dJbZq97B/2671188-1-logo.jpg',
                liveFrom: parseInt(item.live_from || item.data?.live_from || 0),
                isLive: parseInt(item.is_live || item.data?.is_live || 0) === 1,
                liveStatus: parseInt(item.live_status || item.data?.live_status || 0),
                fileUrl: item.data?.file_url || '',
                downloadUrls: item.data?.download_urls || '',
                chatNode: item.data?.mqtt_live_cred?.public_chat_node || '',
                mqttCredentials: item.data?.mqtt_live_cred || null
            }));
        }
        
        res.json({
            success: true,
            data: liveClasses,
            total: liveClasses.length
        });
        
    } catch (error) {
        console.error('Live classes error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch live classes' });
    }
});

// Enroll in course
missionjeetRouter.post("/api/course/enroll", async (req, res) => {
    try {
        const { course_id } = req.body;
        
        if (!course_id) {
            return res.status(400).json({ success: false, error: 'course_id is required' });
        }
        
        const data = await proxyFetch(`${NT_API_BASE}/enroll`, 'POST', {
            course_id: String(course_id)
        });
        
        res.json(data);
        
    } catch (error) {
        console.error('Enrollment error:', error);
        res.status(500).json({ success: false, error: 'Enrollment failed' });
    }
});

// Bulk course overview
missionjeetRouter.post("/api/course/bulk-overview", async (req, res) => {
    try {
        const { course_ids } = req.body;
        
        if (!course_ids || !Array.isArray(course_ids)) {
            return res.status(400).json({ 
                success: false, 
                error: 'course_ids array is required' 
            });
        }
        
        const batchSize = 5;
        const results = [];
        
        for (let i = 0; i < course_ids.length; i += batchSize) {
            const batch = course_ids.slice(i, i + batchSize);
            
            const batchPromises = batch.map(async (id) => {
                const cacheKey = `overview_${id}`;
                const cached = getCached(cacheKey);
                if (cached) return cached.data;
                
                try {
                    const data = await proxyFetch(`${NT_API_BASE}/course-details`, 'POST', {
                        course_id: String(id),
                        parent_id: '0'
                    });
                    
                    if (data && data.success && data.data) {
                        const overview = data.data.find(d => d.type === 'overview');
                        if (overview && overview.data) {
                            const details = overview.data.find(l => l.layout_type === 'details');
                            if (details && details.layout_data && details.layout_data[0]) {
                                const info = details.layout_data[0];
                                const formatted = {
                                    id: id,
                                    title: info.title,
                                    thumbnail: info.thumbnail || 'https://i.ibb.co/dJbZq97B/2671188-1-logo.jpg',
                                    price: info.offer_price || 0,
                                    mrp: info.mrp || 0,
                                    description: info.description || ''
                                };
                                setCache(cacheKey, { data: formatted });
                                return formatted;
                            }
                        }
                    }
                    return null;
                } catch (e) {
                    return null;
                }
            });
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults.filter(r => r !== null));
        }
        
        res.json({
            success: true,
            courses: results,
            total: results.length,
            requested: course_ids.length
        });
        
    } catch (error) {
        console.error('Bulk overview error:', error);
        res.status(500).json({ success: false, error: 'Bulk overview failed' });
    }
});

// Extract media URL
missionjeetRouter.post("/api/media/extract", async (req, res) => {
    try {
        const { file_url, download_urls } = req.body;
        
        let mediaUrl = file_url || '';
        
        if (!mediaUrl && download_urls && download_urls !== '""') {
            try {
                const sources = typeof download_urls === 'string' 
                    ? JSON.parse(download_urls) 
                    : download_urls;
                
                if (Array.isArray(sources) && sources.length > 0) {
                    mediaUrl = sources[sources.length - 1].url;
                }
            } catch (e) {
                console.error('URL extraction error:', e);
            }
        }
        
        res.json({
            success: true,
            url: mediaUrl,
            type: mediaUrl.includes('m3u8') ? 'live' : 
                  mediaUrl.match(/\.(mp4|webm|mkv)/i) ? 'video' : 
                  mediaUrl.match(/\.(pdf|doc|ppt)/i) ? 'document' : 'unknown'
        });
        
    } catch (error) {
        console.error('Media extraction error:', error);
        res.status(500).json({ success: false, error: 'Media extraction failed' });
    }
});

// Clear cache
missionjeetRouter.post("/api/cache/clear", (req, res) => {
    cache.clear();
    res.json({ success: true, message: 'Cache cleared successfully' });
});

app.use("/missionjeet", missionjeetRouter);

// ==========================================
// ERROR HANDLING
// ==========================================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl
    });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message
    });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║          🚀 COMBINED API SERVER                    ║
╠══════════════════════════════════════════════════════╣
║  Status:  ✅ Running                               ║
║  Port:    ${PORT}                                  ║
║  URL:     http://localhost:${PORT}                 ║
╚══════════════════════════════════════════════════════╝

📋 VIBRANT ACADEMY (/vibrant):
  GET  /vibrant/video/:courseId/:videoId/:cls

📋 MISSIONJEET (/missionjeet):
  POST /missionjeet/api/v1/proxy
  POST /missionjeet/api/course/overview
  POST /missionjeet/api/course/content
  GET  /missionjeet/api/content-details
  POST /missionjeet/api/course/search
  POST /missionjeet/api/course/live-classes
  POST /missionjeet/api/course/enroll
  POST /missionjeet/api/course/bulk-overview
  POST /missionjeet/api/media/extract
  POST /missionjeet/api/cache/clear
  GET  /missionjeet/api/health
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down...');
    process.exit(0);
});

module.exports = app;
