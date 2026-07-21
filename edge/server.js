import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import sharp from 'sharp';
import db from '../shared/db.js';

const EDGE_NAME = process.env.EDGE_NAME || 'Mumbai';
const LAT = parseFloat(process.env.LAT || '19.0760');
const LNG = parseFloat(process.env.LNG || '72.8777');
const PORT = parseInt(process.env.PORT || '4002', 10);
const ORIGIN_URL = process.env.ORIGIN_URL || 'http://localhost:4001';
const MAX_CACHE_FILES = parseInt(process.env.MAX_CACHE_FILES || '5', 10);
const TTL_MINUTES = parseInt(process.env.TTL_MINUTES || '10', 10);

const cacheDir = path.resolve(`edge/cache_${EDGE_NAME.toLowerCase()}`);
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Find edge record ID in DB
let edgeDbRecord = db.prepare('SELECT * FROM edge_servers WHERE name = ?').get(EDGE_NAME);
if (!edgeDbRecord) {
  const result = db.prepare(`
    INSERT INTO edge_servers (name, latitude, longitude, base_url, status)
    VALUES (?, ?, ?, ?, 'online')
  `).run(EDGE_NAME, LAT, LNG, `http://localhost:${PORT}`);
  edgeDbRecord = { id: result.lastInsertRowid, name: EDGE_NAME, latitude: LAT, longitude: LNG };
}

const app = express();
app.use(cors());
app.use(express.json());

/**
 * Helper to process image variants on-the-fly using sharp
 */
async function processAndSendFile(filePath, queryParams, res) {
  const { width, height, format, quality } = queryParams;
  const isImage = /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(filePath);

  if (isImage && (width || height || format || quality)) {
    try {
      let transformer = sharp(filePath);
      const w = width ? parseInt(width, 10) : null;
      const h = height ? parseInt(height, 10) : null;

      if (w || h) {
        transformer = transformer.resize(w, h, { fit: 'inside', withoutEnlargement: true });
      }

      if (format) {
        const q = quality ? parseInt(quality, 10) : 80;
        if (format === 'webp') transformer = transformer.webp({ quality: q });
        else if (format === 'jpg' || format === 'jpeg') transformer = transformer.jpeg({ quality: q });
        else if (format === 'png') transformer = transformer.png({ compressionLevel: 8 });
        res.setHeader('Content-Type', `image/${format === 'jpg' ? 'jpeg' : format}`);
      }

      res.setHeader('X-CDN-Processed-On-The-Fly', 'true');
      return transformer.pipe(res);
    } catch (err) {
      console.error(`[${EDGE_NAME}] Image processing error:`, err);
    }
  }

  res.sendFile(filePath);
}

/**
 * Helper to evict Least Recently Used (LRU) file if edge cache is full
 */
function evictLRUIfFull() {
  const currentEntries = db.prepare(`
    SELECT * FROM cache_entries WHERE edge_id = ? ORDER BY last_accessed ASC
  `).all(edgeDbRecord.id);

  if (currentEntries.length >= MAX_CACHE_FILES) {
    const lruItem = currentEntries[0]; // Oldest accessed item
    const lruFilePath = path.join(cacheDir, lruItem.filename);
    
    if (fs.existsSync(lruFilePath)) {
      fs.unlinkSync(lruFilePath);
    }

    db.prepare('DELETE FROM cache_entries WHERE id = ?').run(lruItem.id);
    console.log(`[${EDGE_NAME}] ⚠️ LRU Evicted file "${lruItem.filename}" (Capacity limit: ${MAX_CACHE_FILES})`);
    return lruItem.filename;
  }
  return null;
}

// Handle file request
app.get('/edge/file/:filename', async (req, res) => {
  const { filename } = req.params;
  const cachedFilePath = path.join(cacheDir, filename);

  res.setHeader('X-CDN-Edge-Server', `${EDGE_NAME} (Port ${PORT})`);

  let cacheRecord = db.prepare('SELECT * FROM cache_entries WHERE edge_id = ? AND filename = ?').get(edgeDbRecord.id, filename);

  // Check TTL Expiration
  if (cacheRecord && fs.existsSync(cachedFilePath)) {
    const cachedTime = new Date(cacheRecord.cached_at).getTime();
    const now = Date.now();
    const ageMinutes = (now - cachedTime) / (1000 * 60);

    if (ageMinutes > TTL_MINUTES) {
      console.log(`[${EDGE_NAME}] ⏳ TTL Expired for file "${filename}" (${ageMinutes.toFixed(1)} mins old). Purging...`);
      fs.unlinkSync(cachedFilePath);
      db.prepare('DELETE FROM cache_entries WHERE id = ?').run(cacheRecord.id);
      cacheRecord = null;
    }
  }

  // CACHE HIT
  if (cacheRecord && fs.existsSync(cachedFilePath)) {
    try {
      db.prepare(`
        UPDATE cache_entries
        SET hit_count = hit_count + 1,
            last_accessed = CURRENT_TIMESTAMP
        WHERE edge_id = ? AND filename = ?
      `).run(edgeDbRecord.id, filename);

      res.setHeader('X-Cache-Status', 'HIT');
      return processAndSendFile(cachedFilePath, req.query, res);
    } catch (err) {
      console.error(`[${EDGE_NAME}] Cache hit DB error:`, err);
    }
  }

  // CACHE MISS -> Fetch from Origin
  console.log(`[${EDGE_NAME}] Cache MISS for file "${filename}". Fetching from Origin...`);
  res.setHeader('X-Cache-Status', 'MISS');

  // Perform LRU Eviction if capacity reached
  const evictedFile = evictLRUIfFull();
  if (evictedFile) {
    res.setHeader('X-CDN-LRU-Evicted', evictedFile);
  }

  try {
    const originResponse = await axios({
      method: 'get',
      url: `${ORIGIN_URL}/origin/file/${filename}`,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(cachedFilePath);
    originResponse.data.pipe(writer);

    writer.on('finish', () => {
      // Record cache entry in DB with timestamps
      try {
        db.prepare(`
          INSERT INTO cache_entries (edge_id, filename, cached_at, last_accessed, hit_count)
          VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
          ON CONFLICT(edge_id, filename) DO UPDATE SET
            cached_at = CURRENT_TIMESTAMP,
            last_accessed = CURRENT_TIMESTAMP,
            hit_count = hit_count + 1
        `).run(edgeDbRecord.id, filename);
      } catch (dbErr) {
        console.error(`[${EDGE_NAME}] Cache entry record error:`, dbErr);
      }

      // Process and serve newly cached file
      processAndSendFile(cachedFilePath, req.query, res);
    });

    writer.on('error', (err) => {
      console.error(`[${EDGE_NAME}] Error writing cache file:`, err);
      if (fs.existsSync(cachedFilePath)) fs.unlinkSync(cachedFilePath);
      res.status(500).json({ error: 'Failed to write edge cache file' });
    });

  } catch (err) {
    console.error(`[${EDGE_NAME}] Origin fetch failed:`, err.message);
    return res.status(404).json({ error: `File not found on Origin Server (${err.message})` });
  }
});

// Edge status & health check
app.get('/edge/status', (req, res) => {
  const cachedFiles = fs.readdirSync(cacheDir);
  const cacheEntries = db.prepare(`
    SELECT c.*, f.original_name, f.size, f.mimetype
    FROM cache_entries c
    LEFT JOIN files f ON c.filename = f.filename
    WHERE c.edge_id = ?
    ORDER BY c.last_accessed DESC
  `).all(edgeDbRecord.id);

  res.json({
    edge_name: EDGE_NAME,
    port: PORT,
    latitude: LAT,
    longitude: LNG,
    status: 'online',
    max_capacity: MAX_CACHE_FILES,
    ttl_minutes: TTL_MINUTES,
    cache_count: cachedFiles.length,
    cache_entries: cacheEntries
  });
});

// Cache Purge
app.post('/edge/purge', (req, res) => {
  const { filename } = req.body;
  if (filename) {
    const filePath = path.join(cacheDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    db.prepare('DELETE FROM cache_entries WHERE edge_id = ? AND filename = ?').run(edgeDbRecord.id, filename);
    return res.json({ message: `Purged ${filename} from ${EDGE_NAME} cache` });
  } else {
    const files = fs.readdirSync(cacheDir);
    files.forEach(f => fs.unlinkSync(path.join(cacheDir, f)));
    db.prepare('DELETE FROM cache_entries WHERE edge_id = ?').run(edgeDbRecord.id);
    return res.json({ message: `Purged all cached files from ${EDGE_NAME}` });
  }
});

app.listen(PORT, () => {
  console.log(`[Edge Server - ${EDGE_NAME}] Running on http://localhost:${PORT} (Capacity: ${MAX_CACHE_FILES} files, TTL: ${TTL_MINUTES}m)`);
});
