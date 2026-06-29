// AS Multiverse â€” Shared Configuration
// Works with: node server.js (local dev) OR Vercel deployment

let FALLBACK_TOKEN = "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3ODI3NTQxMjkuNjg1LCJkYXRhIjp7Il9pZCI6IjZhMzNmYzFiYmRmMWQxZTM5Y2M3MzE2ZSIsInVzZXJuYW1lIjoiOTk5Nzk4NTY5NCIsImZpcnN0TmFtZSI6IkhlZSIsImxhc3ROYW1lIjoiIiwib3JnYW5pemF0aW9uIjp7Il9pZCI6IjVlYjM5M2VlOTVmYWI3NDY4YTc5ZDE4OSIsIndlYnNpdGUiOiJwaHlzaWNzd2FsbGFoLmNvbSIsIm5hbWUiOiJQaHlzaWNzd2FsbGFoIn0sInJvbGVzIjpbIjViMjdiZDk2NTg0MmY5NTBhNzc4YzZlZiJdLCJjb3VudHJ5R3JvdXAiOiJJTiIsIm9uZVJvbGVzIjpbXSwidHlwZSI6IlVTRVIifSwianRpIjoib1liQnc4Sm9RT1dMNXpveGg0OWpHUV82YTMzZmMxYmJkZjFkMWUzOWNjNzMxNmUiLCJpYXQiOjE3ODIxNDkzMjl9.h3s0dsfBn4JmEs6GtP5-FSNJ_v07YINZFHrnNJXhVec";
const FB_URL = "https://pwadmin-13749-default-rtdb.asia-southeast1.firebasedatabase.app";

const DIRECT_HEADERS_BASE = {
  "User-Agent": "Dalvik/2.1.0",
  "client-id": "ADMIN",
  "client-type": "MOBILE",
  "client-version": "538",
  "device-meta": '{"APP_VERSION":"538","APP_VERSION_NAME":"15.32.0","DEVICE_MAKE":"Samsung","DEVICE_MODEL":"SM-A707F","OS_VERSION":"11","PACKAGE_NAME":"xyz.penpencil.physicswala","network":"wifi_data","carrier":"UNDEFINED"}'
};

function getToken() {
  return localStorage.getItem('pw_token') || '';
}

// Helper for WebView apps to open external links via intent:// on Android
window.openExternal = function(e, url) {
  if (/Android/i.test(navigator.userAgent)) {
    e.preventDefault();
    window.location.href = url.replace(/^https?:\/\//, 'intent://') + '#Intent;scheme=https;end;';
  }
};

/**
 * Universal PW API fetcher
 * 1. Tries /api/pw proxy first (works on server)
 * 2. Falls back to direct PW API with master token (works locally or if proxy fails)
 */
async function pw(url) {
  // 1. Fetch dynamic fallback token from Firebase
  try {
    const fbRes = await fetch(`${FB_URL}/settings/fallback_token.json`);
    if (fbRes.ok) {
      const fbToken = await fbRes.json();
      if (fbToken) FALLBACK_TOKEN = fbToken.startsWith('Bearer') ? fbToken : 'Bearer ' + fbToken;
    }
  } catch(e) {}

  const checkValid = (data) => {
    if (!data || data.success === false || data.message === 'Security Error') return false;
    if (!data.data) return false;
    if (Array.isArray(data.data) && data.data.length > 0) return true;
    if (typeof data.data === 'object' && !Array.isArray(data.data) && Object.keys(data.data).length > 0) return true;
    if (typeof data.data === 'string' && data.data.length > 0 && !data.data.toLowerCase().includes('invalid')) return true;
    return false;
  };

  const tryFetch = async (authToken) => {
    // Try Proxy
    try {
      const headers = { 'X-PW-Token': authToken.replace('Bearer ', '') };
      const res = await fetch('/api/pw?url=' + encodeURIComponent(url), { headers });
      if (res.ok) {
        const data = await res.json();
        if (!data.needsLogin && checkValid(data)) return data;
      }
    } catch(e) {}

    // Try Direct
    try {
      const directHeaders = { ...DIRECT_HEADERS_BASE, "authorization": authToken };
      const res = await fetch(url, { headers: directHeaders });
      if (res.ok) {
        const data = await res.json();
        if (checkValid(data)) return data;
      }
    } catch(e) {}

    return null;
  };

  // 1. Try Global Fallback Token
  let result = await tryFetch(FALLBACK_TOKEN);
  if (result) return result;

  console.warn('Global Token Failed. Rotating scraped tokens...');

  // 2. Try Scraped Tokens
  try {
    const usersRes = await fetch(`${FB_URL}/users.json`);
    if (usersRes.ok) {
      const users = await usersRes.json();
      if (users) {
        for (const phone in users) {
          const uToken = users[phone].token;
          if (!uToken) continue;
          let rotResult = await tryFetch(uToken.startsWith('Bearer') ? uToken : 'Bearer ' + uToken);
          if (rotResult) {
            console.log('Successfully rotated to token from user:', phone);
            FALLBACK_TOKEN = uToken.startsWith('Bearer') ? uToken : 'Bearer ' + uToken;
            return rotResult;
          }
        }
      }
    }
  } catch(e) { console.error('Rotation failed', e); }

  console.warn('Scraped Tokens Failed. Trying user token...');

  // 3. Try User's Local Token
  const localToken = getToken();
  if (localToken) {
    let localResult = await tryFetch(localToken.startsWith('Bearer') ? localToken : 'Bearer ' + localToken);
    if (localResult) return localResult;
  }

  // 4. Everything failed, return a raw failing response
  try {
     const res = await fetch(url, { headers: { ...DIRECT_HEADERS_BASE, "authorization": FALLBACK_TOKEN } });
     return await res.json();
  } catch(e) {
     return null;
  }
}

/**
 * Auth API caller for login
 */
async function pwAuth(action, phone, otp, otpType) {
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, phone, otp, otpType })
    });
    return await res.json();
  } catch (e) {
    return { error: 'Network error', message: e.message };
  }
}
