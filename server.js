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

    // Route: GET /api/stream?id=20004-192
    if (req.method === "GET" && path === "/api/stream") {
      const id = url.searchParams.get("id");
      if (!id) return sendJSON(res, { success: false, error: 'Missing "id". Use ?id=20004-192' }, 400);
      return sendJSON(res, await getStream(id));
    }

    // Route: GET /  →  tiny index
    if (req.method === "GET" && path === "/") {
      return sendJSON(res, {
        success: true,
        name: "NT Full API",
        endpoints: [
          "GET /api/batches",
          "GET /api/details?course_id=...&type=overview|content&folder_id=0&limit=100",
          "GET /api/stream?id=...",
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

// ─── 3. Stream (extract m3u8 from eduvibe) ───────────────────────────────────
async function getStream(id) {
  const targetUrl = `https://eduvibe-nt.pages.dev/play/${id}`;
  const res = await fetch(targetUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    },
  });
  const html = await res.text();

  const m3u8Regex = /(https?:\/\/[^\s"'<>]*?\.m3u8[^\s"'<>]*)/i;
  const match = html.match(m3u8Regex);

  if (match) {
    const cleanUrl = match[1].replace(/\\\//g, "/");
    return { success: true, source: targetUrl, streamUrl: cleanUrl };
  }

  return {
    success: false,
    source: targetUrl,
    error: "m3u8 link not found in source HTML",
  };
}
