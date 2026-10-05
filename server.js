// server.js — Next Toppers API + PDF Sync (Single File)
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

const FIREBASE_DB = "https://pdfnt-efaa7-default-rtdb.asia-southeast1.firebasedatabase.app";
const BATCHES_API = "https://mtaiirusapi.onrender.com/api/nt/batches";
const CONTENT_API = "https://mtaiirusapi.onrender.com/api/nt/content";
const PDFURL_API = "https://nexttoppers.nextmate.site/api/course/pdfurl";

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

async function getJson(url, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      err = e;
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
  throw err;
}

async function fbGet(path) {
  const r = await fetch(`${FIREBASE_DB}/${path}.json`);
  if (!r.ok) throw new Error(`Firebase read failed: ${r.status}`);
  return r.json();
}

async function fbPatch(path, body) {
  const r = await fetch(`${FIREBASE_DB}/${path}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Firebase write failed: ${r.status} ${await r.text()}`);
}

async function fetchBatches() {
  const j = await getJson(BATCHES_API);
  const out = [];
  for (const cat of j.catalog ?? []) {
    const groups = [
      { name: cat.category_name, batches: cat.batches ?? [] },
      ...(cat.sub_categories ?? []).map((s) => ({
        name: `${cat.category_name} — ${s.sub_title}`,
        batches: s.batches ?? [],
      })),
    ];
    for (const g of groups) {
      for (const b of g.batches) {
        out.push({ id: b.id, title: b.title, category: g.name, thumbnail: b.thumbnail });
      }
    }
  }
  return out;
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

async function syncCourse(courseId, title) {
  const started = Date.now();
  // 1. Walk folder tree starting from folder 0
  const pdfs = [];
  let queue = [{ id: "0", path: "" }];
  while (queue.length) {
    const next = [];
    await pool(queue, 5, async (f) => {
      const j = await getJson(`${CONTENT_API}?course_id=${courseId}&folder_id=${f.id}`).catch(() => null);
      const list = Array.isArray(j?.data)
        ? j.data
        : Array.isArray(j?.data?.data)
          ? j.data.data
          : j?.data && typeof j.data === "object"
            ? Object.values(j.data)
            : [];
      for (const it of list) {
        if (!it || typeof it !== "object") continue;
        if (it.type === "folder") {
          next.push({ id: String(it.entity_id), path: f.path ? `${f.path} / ${it.title}` : it.title });
        } else if (it.data?.file_type === 1) {
          pdfs.push({ id: String(it.entity_id), title: it.title, path: f.path, created_at: Number(it.data.created_at) || 0 });
        }
      }
    });
    queue = next;
  }

  // 2. Fetch URLs only for new PDFs
  const existing = (await fbGet(`pdfs/${courseId}`)) ?? {};
  const fresh = pdfs.filter((p) => !existing[p.id]);
  const updates = {};
  await pool(fresh, 6, async (p) => {
    const j = await getJson(`${PDFURL_API}?content_id=${p.id}&course_id=${courseId}`).catch(() => null);
    const url = j?.file_url;
    if (url) {
      updates[p.id] = { title: p.title, folder: p.path, url, created_at: p.created_at, synced_at: Date.now() };
    }
  });
  if (Object.keys(updates).length) await fbPatch(`pdfs/${courseId}`, updates);

  const total = Object.keys(existing).length + Object.keys(updates).length;
  await fbPatch(`batches/${courseId}`, {
    ...(title ? { title } : {}),
    last_synced: Date.now(),
    pdf_count: total,
  });
  return { courseId, found: pdfs.length, added: Object.keys(updates).length, total, ms: Date.now() - started };
}

/** Picks the batch synced longest ago (for cron rotation). */
async function syncNextBatch() {
  const batches = await fetchBatches();
  const meta = (await fbGet("batches")) ?? {};
  batches.sort((a, b) => (meta[a.id]?.last_synced ?? 0) - (meta[b.id]?.last_synced ?? 0));
  const b = batches[0];
  if (!b) return { message: "no batches" };
  return syncCourse(b.id, b.title);
}

async function syncAll() {
  const batches = await fetchBatches();
  const results = [];
  for (const b of batches) {
    results.push(await syncCourse(b.id, b.title).catch((e) => ({ courseId: b.id, error: String(e) })));
  }
  return { synced: results.length, results };
}

// ─── Health Check ───────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Next Toppers API 🚀 + PDF Sync",
    version: "1.1.0",
    endpoints: {
      batches: "/api/nt/batches",
      home: "/api/nt/home",
      details: "/api/nt/details?course_id=XXX",
      content: "/api/nt/content?course_id=XXX&folder_id=0",
      video: "/api/nt/video?id=VDC_ID",
      pdfBatches: "/api/batches",
      pdfSync: "/api/sync",
      pdfSyncOne: "/api/sync?course_id=179",
      pdfSyncAll: "/api/sync?all=1",
      pdfList: "/api/pdfs?course_id=179",
      pdfOne: "/api/pdfs?course_id=179&content_id=12345",
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

// ═══════════════════════════════════════════════════════════════════════════
//  PDF SYNC ROUTES (from standalone server)
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /api/batches — list all batches with sync status ──────────────────
app.get("/api/batches", async (req, res) => {
  try {
    const [batches, meta] = await Promise.all([fetchBatches(), fbGet("batches")]);
    res.json(batches.map((b) => ({
      ...b,
      last_synced: meta?.[b.id]?.last_synced ?? null,
      pdf_count: meta?.[b.id]?.pdf_count ?? 0,
    })));
  } catch (error) {
    console.error("PDF batches error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/sync — sync batches ──────────────────────────────────────────
app.get("/api/sync", async (req, res) => {
  try {
    const id = req.query.course_id;
    if (req.query.all === "1") return res.json(await syncAll());
    if (id) {
      if (!/^\d{1,8}$/.test(id)) return res.status(400).json({ error: "bad course_id" });
      return res.json(await syncCourse(Number(id)));
    }
    return res.json(await syncNextBatch());
  } catch (error) {
    console.error("PDF sync error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/pdfs — list or get single PDF ────────────────────────────────
app.get("/api/pdfs", async (req, res) => {
  try {
    const id = req.query.course_id;
    if (!id || !/^\d{1,8}$/.test(id)) return res.status(400).json({ error: "bad course_id" });
    const contentId = req.query.content_id;

    // Single PDF: /api/pdfs?course_id=179&content_id=12345
    if (contentId) {
      if (!/^\d{1,10}$/.test(contentId)) return res.status(400).json({ error: "bad content_id" });
      const stored = await fbGet(`pdfs/${id}/${contentId}`);
      if (stored) return res.json({ id: String(contentId), stored: true, ...stored });
      // Not synced yet -> fetch URL live (without saving it)
      const j = await getJson(`${PDFURL_API}?content_id=${contentId}&course_id=${id}`).catch(() => null);
      if (!j?.file_url) return res.status(404).json({ error: "pdf not found", course_id: id, content_id: contentId });
      return res.json({
        id: String(contentId),
        stored: false,
        title: j.title ?? null,
        url: j.file_url,
      });
    }

    // Full list: /api/pdfs?course_id=179
    const r = (await fbGet(`pdfs/${id}`)) ?? {};
    return res.json(Object.entries(r)
      .map(([pid, v]) => ({ id: pid, ...v }))
      .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0)));
  } catch (error) {
    console.error("PDF list error:", error);
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
  console.log(`✅ Next Toppers API + PDF Sync running on port ${PORT}`);
});
