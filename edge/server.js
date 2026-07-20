import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import db from '../shared/db.js';

const EDGE_NAME = process.env.EDGE_NAME || 'Mumbai';
const LAT = parseFloat(process.env.LAT || '19.0760');
const LNG = parseFloat(process.env.LNG || '72.8777');
const PORT = parseInt(process.env.PORT || '4002', 10);
const ORIGIN_URL = process.env.ORIGIN_URL || 'http://localhost:4001';

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

// Handle file request
app.get('/edge/file/:filename', async (req, res) => {
  const { filename } = req.params;
  const cachedFilePath = path.join(cacheDir, filename);

  res.setHeader('X-CDN-Edge-Server', `${EDGE_NAME} (Port ${PORT})`);

  // CACHE HIT
  if (fs.existsSync(cachedFilePath)) {
    try {
      db.prepare(`
        UPDATE cache_entries
        SET hit_count = hit_count + 1
        WHERE edge_id = ? AND filename = ?
      `).run(edgeDbRecord.id, filename);

      res.setHeader('X-Cache-Status', 'HIT');
      return res.sendFile(cachedFilePath);
    } catch (err) {
      console.error(`[${EDGE_NAME}] Cache hit DB error:`, err);
    }
  }

  // CACHE MISS -> Fetch from Origin
  console.log(`[${EDGE_NAME}] Cache MISS for file "${filename}". Fetching from Origin...`);
  res.setHeader('X-Cache-Status', 'MISS');

  try {
    const originResponse = await axios({
      method: 'get',
      url: `${ORIGIN_URL}/origin/file/${filename}`,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(cachedFilePath);
    originResponse.data.pipe(writer);

    writer.on('finish', () => {
      // Record cache entry in DB
      try {
        db.prepare(`
          INSERT INTO cache_entries (edge_id, filename, cached_at, hit_count)
          VALUES (?, ?, CURRENT_TIMESTAMP, 1)
          ON CONFLICT(edge_id, filename) DO UPDATE SET
            cached_at = CURRENT_TIMESTAMP,
            hit_count = hit_count + 1
        `).run(edgeDbRecord.id, filename);
      } catch (dbErr) {
        console.error(`[${EDGE_NAME}] Cache entry record error:`, dbErr);
      }

      // Serve newly cached file to client
      res.sendFile(cachedFilePath);
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
  `).all(edgeDbRecord.id);

  res.json({
    edge_name: EDGE_NAME,
    port: PORT,
    latitude: LAT,
    longitude: LNG,
    status: 'online',
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
    // Purge all
    const files = fs.readdirSync(cacheDir);
    files.forEach(f => fs.unlinkSync(path.join(cacheDir, f)));
    db.prepare('DELETE FROM cache_entries WHERE edge_id = ?').run(edgeDbRecord.id);
    return res.json({ message: `Purged all cached files from ${EDGE_NAME}` });
  }
});

app.listen(PORT, () => {
  console.log(`[Edge Server - ${EDGE_NAME}] Running on http://localhost:${PORT} (Lat: ${LAT}, Lng: ${LNG})`);
});
