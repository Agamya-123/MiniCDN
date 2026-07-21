import express from 'express';
import cors from 'cors';
import axios from 'axios';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import FormData from 'form-data';
import db from '../shared/db.js';
import { generateToken, authenticateToken, requireAdmin } from '../shared/auth.js';
import { findNearestGeoEdge, findLowestLatencyEdge, calculateHaversineDistance } from './geo.js';

const PORT = process.env.ROUTER_PORT || 4000;
const ORIGIN_URL = process.env.ORIGIN_URL || 'http://localhost:4001';

const upload = multer({ storage: multer.memoryStorage() });

const app = express();
app.use(cors());
app.use(express.json());

// ----------------------------------------------------
// REAL-TIME SERVER-SENT EVENTS (SSE) ENGINE
// ----------------------------------------------------
let sseClients = [];

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'SSE Stream Connected' })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

function broadcastSSE(data) {
  sseClients.forEach(client => {
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

// ----------------------------------------------------
// WAF / IP RATE LIMITING MIDDLEWARE (Token Bucket)
// ----------------------------------------------------
const ipRateMap = new Map();
const RATE_LIMIT_MAX = 30; // Max 30 requests per minute
const WINDOW_MS = 60 * 1000;

function rateLimiterWAF(req, res, next) {
  // Exclude Auth, SSE Stream, Logs, and Dashboard status APIs from rate limiting
  if (req.path.startsWith('/api/auth') || req.path === '/api/stream' || req.path === '/api/logs' || req.path === '/api/edges') {
    return next();
  }

  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const now = Date.now();

  let record = ipRateMap.get(clientIp);
  if (!record || (now - record.startTime) > WINDOW_MS) {
    record = { count: 1, startTime: now };
  } else {
    record.count++;
  }
  ipRateMap.set(clientIp, record);

  const remaining = Math.max(0, RATE_LIMIT_MAX - record.count);
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
  res.setHeader('X-RateLimit-Remaining', remaining);

  if (record.count > RATE_LIMIT_MAX) {
    res.setHeader('Retry-After', 60);
    return res.status(429).json({
      error: 'WAF Rate Limit Exceeded (HTTP 429)',
      message: `Too many requests from IP ${clientIp}. Limit is ${RATE_LIMIT_MAX} requests per minute.`
    });
  }

  next();
}

// Apply WAF Rate Limiter globally to all API routes
app.use(rateLimiterWAF);

// ----------------------------------------------------
// AUTH ENDPOINTS
// ----------------------------------------------------
app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    const salt = bcrypt.genSaltSync(10);
    const passHash = bcrypt.hashSync(password, salt);
    
    const stmt = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
    const result = stmt.run(name, email, passHash, 'user');

    const user = { id: result.lastInsertRowid, name, email, role: 'user' };
    const token = generateToken(user);

    res.status(201).json({ user, token });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const userData = { id: user.id, name: user.name, email: user.email, role: user.role };
    const token = generateToken(userData);

    res.json({ user: userData, token });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// ----------------------------------------------------
// CDN ROUTER / FILE PROXY (Core algorithm)
// ----------------------------------------------------
app.get('/api/file/:filename', async (req, res) => {
  const { filename } = req.params;
  const { lat, lng, forceEdge, mode = 'geo', width, height, format, quality } = req.query;

  const clientLat = parseFloat(lat || '28.6139'); // Default to Delhi coordinates if unspecified
  const clientLng = parseFloat(lng || '77.2090');
  const userId = req.user ? req.user.id : null;

  const activeEdges = db.prepare("SELECT * FROM edge_servers WHERE status = 'online'").all();

  if (!activeEdges || activeEdges.length === 0) {
    return res.status(503).json({ error: 'No active edge servers available in network' });
  }

  let selectedEdge = null;
  let distanceKm = 0;
  let routingStrategy = mode;

  // 1. Forced Edge Override
  if (forceEdge) {
    selectedEdge = activeEdges.find(e => e.name.toLowerCase() === forceEdge.toLowerCase());
    if (selectedEdge) {
      routingStrategy = `forced (${selectedEdge.name})`;
      distanceKm = Math.round(calculateHaversineDistance(clientLat, clientLng, selectedEdge.latitude, selectedEdge.longitude) * 10) / 10;
    }
  }

  // 2. Latency-Based Routing
  if (!selectedEdge && mode === 'latency') {
    const latencyResult = await findLowestLatencyEdge(activeEdges);
    if (latencyResult && latencyResult.edge) {
      selectedEdge = latencyResult.edge;
      distanceKm = Math.round(calculateHaversineDistance(clientLat, clientLng, selectedEdge.latitude, selectedEdge.longitude) * 10) / 10;
    }
  }

  // 3. Haversine Geo-Distance Routing (Default)
  if (!selectedEdge) {
    const geoResult = findNearestGeoEdge(clientLat, clientLng, activeEdges);
    if (geoResult && geoResult.edge) {
      selectedEdge = geoResult.edge;
      distanceKm = geoResult.distanceKm;
      routingStrategy = 'geo';
    }
  }

  if (!selectedEdge) {
    selectedEdge = activeEdges[0]; // fallback
  }

  const startTime = Date.now();

  try {
    // Forward image transformation query parameters to Edge Server
    const queryParams = new URLSearchParams();
    if (width) queryParams.append('width', width);
    if (height) queryParams.append('height', height);
    if (format) queryParams.append('format', format);
    if (quality) queryParams.append('quality', quality);

    const targetUrl = `${selectedEdge.base_url}/edge/file/${filename}?${queryParams.toString()}`;
    const edgeResponse = await axios({
      method: 'get',
      url: targetUrl,
      responseType: 'stream'
    });

    const responseTimeMs = Date.now() - startTime;
    const cacheStatusHeader = edgeResponse.headers['x-cache-status'] || 'UNKNOWN';
    const isCacheHit = cacheStatusHeader === 'HIT' ? 1 : 0;
    const lruEvictedFile = edgeResponse.headers['x-cdn-lru-evicted'] || null;

    // Log request analytics to database
    let newLogId = null;
    try {
      const result = db.prepare(`
        INSERT INTO request_logs (user_id, filename, client_lat, client_lng, edge_server_used, cache_hit, response_time_ms, routing_mode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userId, filename, clientLat, clientLng, selectedEdge.name, isCacheHit, responseTimeMs, routingStrategy);
      newLogId = result.lastInsertRowid;
    } catch (logErr) {
      console.error('Request logging failed:', logErr);
    }

    // Set informative response headers
    res.setHeader('X-CDN-Edge-Server', selectedEdge.name);
    res.setHeader('X-CDN-Edge-Distance-KM', distanceKm);
    res.setHeader('X-CDN-Cache-Status', cacheStatusHeader);
    res.setHeader('X-CDN-Response-Time-MS', responseTimeMs);
    res.setHeader('X-CDN-Routing-Mode', routingStrategy);
    if (lruEvictedFile) res.setHeader('X-CDN-LRU-Evicted', lruEvictedFile);

    if (edgeResponse.headers['content-type']) {
      res.setHeader('Content-Type', edgeResponse.headers['content-type']);
    }

    // Broadcast real-time event via SSE to all active clients
    broadcastSSE({
      type: 'REQUEST_LOGGED',
      log: {
        id: newLogId,
        user_name: req.user ? req.user.name : 'Anonymous User',
        filename,
        client_lat: clientLat,
        client_lng: clientLng,
        edge_server_used: selectedEdge.name,
        cache_hit: isCacheHit,
        response_time_ms: responseTimeMs,
        routing_mode: routingStrategy,
        created_at: new Date().toISOString()
      }
    });

    edgeResponse.data.pipe(res);

  } catch (err) {
    console.error(`[Router] Failed to fetch file from Edge ${selectedEdge.name}:`, err.message);
    res.status(404).json({ error: `File non-existent or fetch failed from ${selectedEdge.name}` });
  }
});

// ----------------------------------------------------
// FILE MANAGEMENT PROXIES
// ----------------------------------------------------
app.get('/api/files', (req, res) => {
  try {
    const files = db.prepare(`
      SELECT f.*, u.name as uploader_name
      FROM files f
      LEFT JOIN users u ON f.uploaded_by = u.id
      ORDER BY f.created_at DESC
    `).all();
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch file catalog' });
  }
});

// Admin File Upload Proxy
app.post('/api/origin/upload', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  try {
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    const pushSync = req.query.pushSync || 'false';
    const originRes = await axios.post(`${ORIGIN_URL}/origin/upload?pushSync=${pushSync}`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': req.headers['authorization']
      }
    });

    broadcastSSE({ type: 'FILE_UPLOADED', file: originRes.data.file });
    res.status(201).json(originRes.data);
  } catch (err) {
    console.error('Proxy upload to origin failed:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.error || 'Failed to upload file to Origin Server' });
  }
});

// Delete file proxy
app.delete('/api/files/:filename', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { filename } = req.params;
    const originRes = await axios.delete(`${ORIGIN_URL}/origin/file/${filename}`, {
      headers: { 'Authorization': req.headers['authorization'] }
    });
    broadcastSSE({ type: 'FILE_DELETED', filename });
    res.json(originRes.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// ----------------------------------------------------
// NETWORK & ANALYTICS ENDPOINTS
// ----------------------------------------------------
app.get('/api/edges', async (req, res) => {
  try {
    const dbEdges = db.prepare('SELECT * FROM edge_servers').all();

    const edgePromises = dbEdges.map(async (edge) => {
      try {
        const edgeRes = await axios.get(`${edge.base_url}/edge/status`, { timeout: 1500 });
        return {
          ...edge,
          status: 'online',
          max_capacity: edgeRes.data.max_capacity,
          ttl_minutes: edgeRes.data.ttl_minutes,
          cache_count: edgeRes.data.cache_count,
          cache_entries: edgeRes.data.cache_entries
        };
      } catch (err) {
        return {
          ...edge,
          status: 'offline',
          max_capacity: 5,
          ttl_minutes: 10,
          cache_count: 0,
          cache_entries: []
        };
      }
    });

    const fullEdges = await Promise.all(edgePromises);
    res.json({ edges: fullEdges });
  } catch (err) {
    res.status(500).json({ error: 'Failed to query edge servers' });
  }
});

app.get('/api/logs', (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT l.*, u.name as user_name
      FROM request_logs l
      LEFT JOIN users u ON l.user_id = u.id
      ORDER BY l.created_at DESC
      LIMIT 100
    `).all();

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_requests,
        SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as cache_hits,
        ROUND(AVG(response_time_ms), 2) as avg_latency_ms
      FROM request_logs
    `).get();

    const hitRate = stats.total_requests > 0
      ? Math.round((stats.cache_hits / stats.total_requests) * 100)
      : 0;

    res.json({
      logs,
      summary: {
        total_requests: stats.total_requests || 0,
        cache_hits: stats.cache_hits || 0,
        hit_rate_percent: hitRate,
        avg_latency_ms: stats.avg_latency_ms || 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch request logs' });
  }
});

app.post('/api/edges/purge', authenticateToken, requireAdmin, async (req, res) => {
  const { edgeName, filename } = req.body;
  const dbEdges = db.prepare("SELECT * FROM edge_servers WHERE status = 'online'").all();

  const targetEdges = edgeName
    ? dbEdges.filter(e => e.name.toLowerCase() === edgeName.toLowerCase())
    : dbEdges;

  const purgePromises = targetEdges.map(edge =>
    axios.post(`${edge.base_url}/edge/purge`, { filename }).catch(() => {})
  );

  await Promise.all(purgePromises);
  broadcastSSE({ type: 'CACHE_PURGED', edgeName: edgeName || 'ALL' });
  res.json({ message: `Purge command dispatched to ${targetEdges.length} edge server(s)` });
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` [MiniCDN Router & API Gateway] Listening on http://localhost:${PORT}`);
  console.log(` [WAF Engine] Rate Limiting: ${RATE_LIMIT_MAX} req/min per IP`);
  console.log(` [SSE Stream] Endpoint ready at GET /api/stream`);
  console.log(`====================================================`);
});
