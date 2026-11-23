// server.js
// Full Next Toppers (NT) API — single file, Node.js (>=18)
// Run: node server.js
// Env: PORT (default 3000)

import http from "node:http";

const PORT = process.env.PORT || 3000;

// ─── NT Constants ────────────────────────────────────────────────────────────
const NT_APP_ID = "1770981347"; // NT main app_id (from original batches.js/details.js)
const NT_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Content-Type": "application/json",
  "user_id": "0",
  "platform": "3",
  "Version": "1",
  "app_id": NT_APP_ID,
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";

// ─── HTTP Server ─────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    // Route: GET /api/batches
    if (req.method === "GET" && path === "/api/batches") {
      return sendJSON(res, await getBatches());
    }

    // Route: GET /api/details?course_id=...&type=overview|content&folder_id=0&limit=100
    if (req.method === "GET" && path === "/api/details") {
      const courseId = url.searchParams.get("course_id");
      if (!courseId) return sendJSON(res, { success: false, error: "course_id is required" }, 400);

      const type = url.searchParams.get("type") || "overview";
      const folderId = url.searchParams.get("folder_id") || "0";
      const limit = url.searchParams.get("limit") || "100";
      return sendJSON(res, await getDetails(courseId, type, folderId, limit));
    }

    // Route: GET /api/stream?id=...  (aliases: /api/nt, vdcId, url)
    if (
      req.method === "GET" &&
      (path === "/api/stream" || path === "/api/nt" || path === "/api/nt/")
    ) {
      const id =
        url.searchParams.get("id") ||
        url.searchParams.get("vdcId") ||
        url.searchParams.get("url");

      if (!id) {
        return sendJSON(
          res,
          {
            success: false,
            platform: "nt",
            vdcId: "",
            url: "",
            directUrl: "",
            token: "",
            type: "hls",
            error: "Query parameter 'id' (vdcId) is required.",
          },
          400
        );
      }

      try {
        return sendJSON(res, await getStream(id));
      } catch (err) {
        return sendJSON(
          res,
          {
            success: false,
            platform: "nt",
            vdcId: id,
            url: "",
            directUrl: "",
            token: "",
            type: "hls",
            error: err.message || "Failed to resolve NT stream",
          },
          500
        );
      }
    }

    // Route: GET /  →  tiny index
    if (req.method === "GET" && path === "/") {
      return sendJSON(res, {
        success: true,
        name: "NT Full API",
        endpoints: [
          "GET /api/batches",
          "GET /api/details?course_id=...&type=overview|content&folder_id=0&limit=100",
          "GET /api/stream?id=...  (aliases: /api/nt, vdcId, url)",
        ],
      });
    }

    return sendJSON(res, { success: false, error: "Not Found" }, 404);
  } catch (err) {
    return sendJSON(res, { success: false, error: err.message || "Server error" }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`NT API running on http://localhost:${PORT}`);
});

// ─── Helper ──────────────────────────────────────────────────────────────────
function sendJSON(res, data, status = 200) {
  res.writeHead(status, { ...CORS, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

// ─── 1. Batches / Catalog ────────────────────────────────────────────────────
async function getBatches() {
  // Step 1: Master list (captures uncategorized courses like CUET/ABHAY)
  const masterRes = await fetch("https://course.nexttoppers.com/course/all-course", {
    method: "POST",
    headers: NT_HEADERS,
    body: JSON.stringify({
      view_type: "0",
      cat_id: "0",
      cat_parent_id: "0",
      page: "1",
      limit: "200",
      is_free: "0",
      is_trending: "0",
    }),
  });
  const masterData = await masterRes.json();
  let allMasterCourses = [];
  if (masterData.data) {
    const layout = masterData.data.find((l) => l.layout_type === "course_list_layout");
    if (layout && layout.list) allMasterCourses = layout.list;
  }

  // Step 2: Categories from home content
  const homeRes = await fetch("https://home.nexttoppers.com/home/content", {
    method: "POST",
    headers: NT_HEADERS,
    body: JSON.stringify({}),
  });
  const homeData = await homeRes.json();
  const featureLayout = homeData.data?.find((l) => l.layout_type === "layout_feature");
  const categories = featureLayout ? featureLayout.list : [];

  const categorizedBatchIds = new Set();

  // Step 3: For each category → fetch sub-categories + direct courses
  const batchPromises = categories.map(async (category) => {
    const catRes = await fetch("https://course.nexttoppers.com/course/all-course", {
      method: "POST",
      headers: NT_HEADERS,
      body: JSON.stringify({
        view_type: "0",
        cat_id: category.id.toString(),
        cat_parent_id: "0",
        page: "1",
        limit: "100",
        is_free: "0",
        is_trending: "0",
      }),
    });
    const catData = await catRes.json();

    let subCategories = [];
    let directCourses = [];

    if (catData.data) {
      const catLayout = catData.data.find((l) => l.layout_type === "category_list_layout");
      const courseLayout = catData.data.find((l) => l.layout_type === "course_list_layout");
      if (catLayout && catLayout.list) subCategories = catLayout.list;
      if (courseLayout && courseLayout.list) {
        directCourses = courseLayout.list;
        directCourses.forEach((c) => categorizedBatchIds.add(c.id));
      }
    }

    const subPromises = subCategories.map(async (sub) => {
      const subRes = await fetch("https://course.nexttoppers.com/course/all-course", {
        method: "POST",
        headers: NT_HEADERS,
        body: JSON.stringify({
          view_type: "0",
          cat_id: sub.id.toString(),
          cat_parent_id: category.id.toString(),
          page: "1",
          limit: "100",
          is_free: "0",
          is_trending: "0",
        }),
      });
      const subData = await subRes.json();
      let deepBatches = [];
      if (subData.data) {
        const cLayout = subData.data.find((l) => l.layout_type === "course_list_layout");
        if (cLayout && cLayout.list) {
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

    const resolvedSubs = await Promise.all(subPromises);

    return {
      category_id: category.id,
      category_name: category.title,
      category_icon: category.thumbnail,
      sub_categories: resolvedSubs,
      batches: directCourses,
    };
  });

  const catalogTree = await Promise.all(batchPromises);

  // Step 4: "Others" supplement
  const others = allMasterCourses.filter((c) => !categorizedBatchIds.has(c.id));
  if (others.length > 0) {
    catalogTree.push({
      category_id: "others",
      category_name: "Others",
      category_icon: "https://via.placeholder.com/150/202124/FFFFFF?text=Others",
      sub_categories: [],
      batches: others,
    });
  }

  return {
    success: true,
    message: "Catalog fetched",
    catalog: catalogTree,
  };
}

// ─── 2. Details (overview / content) ─────────────────────────────────────────
async function getDetails(courseId, type, folderId, limit) {
  let targetUrl = "";
  let body = {};

  if (type === "overview") {
    targetUrl = "https://course.nexttoppers.com/course/course-details";
    body = { course_id: courseId, parent_id: "0" };
  } else if (type === "content") {
    targetUrl = "https://course.nexttoppers.com/course/all-content";
    body = {
      course_id: courseId,
      folder_id: folderId,
      page: "1",
      limit: limit,
      keyword: "",
      parent_course_id: "0",
      is_free: "",
    };
  } else {
    return { success: false, error: "Invalid type. Use overview or content" };
  }

  const apiRes = await fetch(targetUrl, {
    method: "POST",
    headers: NT_HEADERS,
    body: JSON.stringify(body),
  });
  return await apiRes.json();
}

// ─── 3. Stream / Lecture (Next-Toppers → Videocrypt resolver) ────────────────
async function getStream(vdcId) {
  // Step 1: fetch the dynamic media headers from Next-Toppers
  const headerRes = await fetch(
    "https://nexttoppers.com/api/media-headers?deviceType=1&userId=0",
    {
      headers: {
        "User-Agent": USER_AGENT,
      },
    }
  );

  if (!headerRes.ok) {
    throw new Error(`Failed to fetch Next-Toppers media headers (HTTP ${headerRes.status})`);
  }

  const mediaHeaders = await headerRes.json();
  const ntVcHeaders = {
    ...mediaHeaders,
    "Content-Type": "application/json",
  };

  // Step 2: resolve the DRM video details from Videocrypt
  const res = await fetch("https://api.videocrypt.com/getVideoDetailsDrm", {
    method: "POST",
    headers: ntVcHeaders,
    body: JSON.stringify({ name: vdcId, flag: 1 }),
  });

  const json = await res.json();
  const m3u8Url = json?.data?.link?.file_url || "";
  const token = json?.data?.link?.token || "";

  if (!m3u8Url) {
    return {
      success: false,
      platform: "nt",
      vdcId,
      url: "",
      directUrl: "",
      token: token || "",
      type: "hls",
      error: "Stream URL not available for this Next-Toppers video",
    };
  }

  return {
    success: true,
    platform: "nt",
    vdcId,
    url: m3u8Url,
    directUrl: m3u8Url,
    token: token || "",
    type: "hls",
  };
}
