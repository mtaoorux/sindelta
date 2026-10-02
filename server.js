// server.js — Next Toppers API (Single File)
// Deploy on Render: Build: npm install | Start: npm start

import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"], allowedHeaders: "*" }));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ─── Constants ──────────────────────────────────────────────────────────────
const NT_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/json",
  user_id: "0",
  platform: "3",
  Version: "1",
  app_id: "1770981347",
};

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.time > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function setCache(key, value) {
  cache.set(key, { value, time: Date.now() });
}

// ─── Helpers ────────────────────────────────────────────────────────────────
async function ntFetch(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: NT_HEADERS,
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─── Health Check ───────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Next Toppers API 🚀",
    version: "1.0.0",
    endpoints: {
      batches: "/api/nt/batches",
      home: "/api/nt/home",
      details: "/api/nt/details?course_id=XXX",
      content: "/api/nt/content?course_id=XXX&folder_id=0",
      video: "/api/nt/video?id=VDC_ID",
    },
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), cache_size: cache.size });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTE 1: /api/nt/batches  — Full catalog tree
// ═══════════════════════════════════════════════════════════════════════════
app.get("/api/nt/batches", async (req, res) => {
  try {
    const cached = getCache("batches");
    if (cached) return res.json({ ...cached, cached: true });

    // Step 1: Master course list
    const masterData = await ntFetch("https://course.nexttoppers.com/course/all-course", {
      view_type: "0",
      cat_id: "0",
      cat_parent_id: "0",
      page: "1",
      limit: "200",
      is_free: "0",
      is_trending: "0",
    });

    let allMasterCourses = [];
    if (masterData.data) {
      const courseLayout = masterData.data.find((l) => l.layout_type === "course_list_layout");
      if (courseLayout?.list) allMasterCourses = courseLayout.list;
    }

    // Step 2: Fetch categories
    const homeData = await ntFetch("https://home.nexttoppers.com/home/content", {});
    const featureLayout = homeData.data?.find((l) => l.layout_type === "layout_feature");
    const categories = featureLayout?.list || [];

    const categorizedBatchIds = new Set();

    // Step 3: Map categories -> sub-categories -> batches
    const batchPromises = categories.map(async (category) => {
      const batchData = await ntFetch("https://course.nexttoppers.com/course/all-course", {
        view_type: "0",
        cat_id: category.id.toString(),
        cat_parent_id: "0",
        page: "1",
        limit: "100",
        is_free: "0",
        is_trending: "0",
      });

      let subCategories = [];
      let directCourses = [];

      if (batchData.data) {
        const catLayout = batchData.data.find((l) => l.layout_type === "category_list_layout");
        const courseLayout = batchData.data.find((l) => l.layout_type === "course_list_layout");

        if (catLayout?.list) subCategories = catLayout.list;
        if (courseLayout?.list) {
          directCourses = courseLayout.list;
          directCourses.forEach((c) => categorizedBatchIds.add(c.id));
        }
      }

      // Sub-categories
      const subCatPromises = subCategories.map(async (sub) => {
        const subBatchData = await ntFetch("https://course.nexttoppers.com/course/all-course", {
          view_type: "0",
          cat_id: sub.id.toString(),
          cat_parent_id: category.id.toString(),
          page: "1",
          limit: "100",
          is_free: "0",
          is_trending: "0",
        });

        let deepBatches = [];
        if (subBatchData.data) {
          const cLayout = subBatchData.data.find((l) => l.layout_type === "course_list_layout");
          if (cLayout?.list) {
            deepBatches = cLayout.list;
            deepBatches.forEach((c) => categorizedBatchIds.add(c.id));
          }
        }

        return {
          sub_id: sub.id,
          sub_title: sub.title,
          sub_thumbnail: sub.thumbnail,
          batches: deepBatches,
        };
      });

      const resolvedSubCats = await Promise.all(subCatPromises);

      return {
        category_id: category.id,
        category_name: category.title,
        category_icon: category.thumbnail,
        sub_categories: resolvedSubCats,
        batches: directCourses,
      };
    });

    const fullCatalogTree = await Promise.all(batchPromises);

    // Step 4: Others
    const othersBatches = allMasterCourses.filter((c) => !categorizedBatchIds.has(c.id));
    if (othersBatches.length > 0) {
      fullCatalogTree.push({
        category_id: "others",
        category_name: "Others",
        category_icon: "https://via.placeholder.com/150/202124/FFFFFF?text=Others",
        sub_categories: [],
        batches: othersBatches,
      });
    }

    const response = {
      success: true,
      message: "Next Toppers Catalog Fetched",
      total_categories: fullCatalogTree.length,
      catalog: fullCatalogTree,
    };

    setCache("batches", response);
    res.json(response);
  } catch (error) {
    console.error("Batches error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTE 2: /api/nt/home
// ═══════════════════════════════════════════════════════════════════════════
app.get("/api/nt/home", async (req, res) => {
  try {
    const cached = getCache("home");
    if (cached) return res.json({ ...cached, cached: true });

    const homeData = await ntFetch("https://home.nexttoppers.com/home/content", {});

    const response = {
      success: true,
      message: "Home content fetched",
      data: homeData.data || [],
    };

    setCache("home", response);
    res.json(response);
  } catch (error) {
    console.error("Home error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTE 3: /api/nt/details?course_id=XXX
// ═══════════════════════════════════════════════════════════════════════════
app.get("/api/nt/details", async (req, res) => {
  const { course_id, parent_id = "0" } = req.query;

  if (!course_id) {
    return res.status(400).json({ success: false, error: "course_id query parameter is required" });
  }

  try {
    const cacheKey = `details:${course_id}:${parent_id}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    const data = await ntFetch("https://course.nexttoppers.com/course/course-details", {
      course_id,
      parent_id,
    });

    const response = {
      success: true,
      message: "Course details fetched",
      data: data.data || data,
    };

    setCache(cacheKey, response);
    res.json(response);
  } catch (error) {
    console.error("Details error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTE 4: /api/nt/content?course_id=XXX&folder_id=0
// ═══════════════════════════════════════════════════════════════════════════
app.get("/api/nt/content", async (req, res) => {
  const { course_id, folder_id = "0", limit = "100", page = "1" } = req.query;

  if (!course_id) {
    return res.status(400).json({ success: false, error: "course_id query parameter is required" });
  }

  try {
    const cacheKey = `content:${course_id}:${folder_id}:${limit}:${page}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    const data = await ntFetch("https://course.nexttoppers.com/course/all-content", {
      course_id,
      folder_id,
      page,
      limit,
      keyword: "",
      parent_course_id: "0",
      is_free: "",
    });

    const response = {
      success: true,
      message: "Content fetched",
      data: data.data || data,
    };

    setCache(cacheKey, response);
    res.json(response);
  } catch (error) {
    console.error("Content error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTE 5: /api/nt/video?id=VDC_ID  — Stream resolver
// ═══════════════════════════════════════════════════════════════════════════
app.get("/api/nt/video", async (req, res) => {
  const vdcId = req.query.id || req.query.vdcId || req.query.url;

  if (!vdcId) {
    return res.status(400).json({ success: false, error: "Query parameter 'id' (vdcId) is required." });
  }

  try {
    // Step 1: Fetch media headers
    const headerRes = await fetch(
      "https://nexttoppers.com/api/media-headers?deviceType=1&userId=0",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
        },
      }
    );

    if (!headerRes.ok) {
      return res.status(500).json({ success: false, error: "Failed to fetch media headers" });
    }

    const mediaHeaders = await headerRes.json();
    const vcHeaders = { ...mediaHeaders, "Content-Type": "application/json" };

    let m3u8Url = "";
    let token = "";
    let licenseUrl = "";
    let type = "hls";

    // Step 2: Try DRM
    try {
      const drmRes = await fetch("https://api.videocrypt.com/getVideoDetailsDrm", {
        method: "POST",
        headers: vcHeaders,
        body: JSON.stringify({ name: vdcId, flag: 1 }),
      });
      const drmJson = await drmRes.json();
      m3u8Url = drmJson?.data?.link?.file_url || "";
      token = drmJson?.data?.link?.token || "";

      if (m3u8Url) {
        type = m3u8Url.includes(".mpd") ? "dash" : "hls";
        if (token) {
          licenseUrl = `https://license.videocrypt.com/validateLicense?pallyconCustomdataV2=${encodeURIComponent(
            token
          )}`;
        }
      }
    } catch (e) {
      console.warn("DRM failed, trying non-DRM...");
    }

    // Step 3: Fallback to non-DRM
    if (!m3u8Url) {
      try {
        const nonDrmRes = await fetch("https://api.videocrypt.com/getVideoDetails", {
          method: "POST",
          headers: vcHeaders,
          body: JSON.stringify({ name: vdcId }),
        });
        const nonDrmJson = await nonDrmRes.json();
        const d = nonDrmJson?.data;
        m3u8Url =
          d?.file_url_hls ||
          d?.link?.file_url_hls ||
          d?.bitrate_urls?.[0]?.url ||
          "";
        if (m3u8Url) type = "hls";
      } catch (e) {
        console.warn("Non-DRM also failed.");
      }
    }

    if (!m3u8Url) {
      return res.status(404).json({
        success: false,
        error: "Stream URL not available for this video",
        vdcId,
      });
    }

    res.json({
      success: true,
      platform: "nt",
      vdcId,
      url: m3u8Url,
      directUrl: m3u8Url,
      token,
      licenseUrl,
      type,
    });
  } catch (error) {
    console.error("Video error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── 404 Handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ─── Global Error Handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, error: err.message || "Internal server error" });
});

// ─── Start Server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Next Toppers API running on port ${PORT}`);
});
