const auth13 = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEwMjc1IiwidGltZXN0YW1wIjoxNzg0MjgxMTI1LCJpdl92ZXIiOjQ5LCJzZXNzaW9uIjoiZXlKMGVYQWlPaUpLVjFRaUxDSmhiR2NpT2lKSVV6STFOaUo5LmV5SnBaQ0k2SWpFd01qYzFJaXdpWlcxaGFXd2lPaUp6WVdoMUxuTjFjbmxoYm5Ob0xtTnpaVUJuYldGcGJDNWpiMjBpTENKdVlXMWxJam9pVTNWeWRTSXNJblJsYm1GdWRGUjVjR1VpT2lKMWMyVnlJaXdpZEdWdVlXNTBUbUZ0WlNJNkluWnBZbkpoYm5SaFkyRmtaVzE1YTI5MFlWOWtZaUlzSW5SbGJtRnVkRWxrSWpvaUlpd2laR2x6Y0c5ellXSnNaU0k2Wm1Gc2MyVjkuNEt3VDUxbUptSE05aFRaWE5sOXU4NTF2SWJqdlBxaE1abjVYamZQTDE5SSJ9.fDRsvfD_cHiDjU4t23NVEcF_BJKlXXZETwHwXJO7PN8";
const id13 = "10275";

const auth10 = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjY4NjQxIiwidGltZXN0YW1wIjoxNzg0Mjc1NTQ0LCJpdl92ZXIiOjMsInNlc3Npb24iOiJleUowZVhBaU9pSktWMVFpTENKaGJHY2lPaUpJVXpJMU5pSjkuZXlKcFpDSTZJalk0TmpReElpd2laVzFoYVd3aU9pSTVOalV4TlRVNU1UWTBRR2R0WVdsc0xtTnZiU0lzSW01aGJXVWlPaUpMZFhOb1lXZHlZU0JRWVd3aUxDSjBaVzVoYm5SVWVYQmxJam9pZFhObGNpSXNJblJsYm1GdWRFNWhiV1VpT2lKMmFXSnlZVzUwWVdOaFpHVnRlV3R2ZEdGZlpHSWlMQ0owWlc1aGJuUkpaQ0k2SWlJc0ltUnBjM0J2YzJGaWJHVWlPbVpoYkhObGZRLkhnVURtTFBueWhxaVVaNF9qVVgzTHVUX1FLVUI1TzR1WGNGVWV6YTBBY3MifQ.65NI2ur5DLJqcNVqff13fzCjWeaMlb16vfkNYYWvCi8";
const id10 = "68641";

function getCreds(cls) {
  if (cls === "12"  cls === 12) {
    return { id: id13, auth: auth13 };
  }
  if (cls === "11"  cls === 11) {
    return { id: id10, auth: auth10 };
  }
  // Default to class 11
  return { id: id10, auth: auth10 };
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 1. Proxy for /vib/* routes - FIXED
app.get('/vib/*', async (req, res) => {
  try {
    // Remove the "/vib" prefix from path
    const pathWithoutPrefix = req.path.replace(/^\/vib/, '');
    
    // Build full endpoint path + query string
    const endpointPath = pathWithoutPrefix + (req.originalUrl.includes('?') 
      ? req.originalUrl.slice(req.originalUrl.indexOf('?')) 
      : '');
    
    // Construct target URL
    const targetUrl =
https://vibrantacademykotaapi.akamai.net.in${endpointPath}
;
    
    console.log('📡 Proxying to:', targetUrl);
    
    // Fetch from target API with proper headers
    const response = await axios.get(targetUrl, {
      headers: getOriginHeaders(11), // Default class 11
      timeout: 15000,
      maxRedirects: 5,
    });
    
    // Set CORS headers
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, User-Id, Auth-Key, Client-Service, Device-Type, Origin, Referer');
    
    res.json(response.data);
  } catch (error) {
    console.error('❌ Proxy error:', error.message);
    console.error('❌ Error response:', error.response?.data);
    
    // Set CORS headers
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, User-Id, Auth-Key, Client-Service, Device-Type, Origin, Referer');
    
    res.status(error.response?.status  500).json({
      error: error.message,
      status: error.response?.status,
      data: error.response?.data  null
    });
  }
});
