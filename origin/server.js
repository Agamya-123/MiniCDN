import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import db from '../shared/db.js';
import { authenticateToken, requireAdmin } from '../shared/auth.js';
import axios from 'axios';

const PORT = process.env.ORIGIN_PORT || 4001;
const uploadsDir = path.resolve('origin/uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${baseName}_${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ storage });

const app = express();
app.use(cors());
app.use(express.json());

// Upload file to Origin (Admin only)
app.post('/origin/upload', authenticateToken, requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileData = {
    filename: req.file.filename,
    original_name: req.file.originalname,
    origin_path: req.file.path,
    size: req.file.size,
    mimetype: req.file.mimetype,
    uploaded_by: req.user.id
  };

  try {
    const stmt = db.prepare(`
      INSERT INTO files (filename, original_name, origin_path, size, mimetype, uploaded_by)
      VALUES (@filename, @original_name, @origin_path, @size, @mimetype, @uploaded_by)
    `);
    const result = stmt.run(fileData);
    const newFile = db.prepare('SELECT * FROM files WHERE id = ?').get(result.lastInsertRowid);

    // Optional push notification to online edge servers if push sync requested
    if (req.query.pushSync === 'true') {
      const activeEdges = db.prepare("SELECT * FROM edge_servers WHERE status = 'online'").all();
      activeEdges.forEach(edge => {
        axios.post(`${edge.base_url}/edge/purge`, { filename: req.file.filename }).catch(() => {});
      });
    }

    return res.status(201).json({
      message: 'File uploaded successfully to Origin Server',
      file: newFile
    });
  } catch (err) {
    console.error('Upload DB error:', err);
    return res.status(500).json({ error: 'Failed to record file in database' });
  }
});

// Serve file to Edge server (or direct download)
app.get('/origin/file/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadsDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on Origin Server' });
  }

  res.setHeader('X-Origin-Server', 'Port 4001');
  res.sendFile(filePath);
});

// List all files on Origin
app.get('/origin/files', (req, res) => {
  try {
    const files = db.prepare(`
      SELECT f.*, u.name as uploader_name
      FROM files f
      LEFT JOIN users u ON f.uploaded_by = u.id
      ORDER BY f.created_at DESC
    `).all();
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Delete file from Origin
app.delete('/origin/file/:filename', authenticateToken, requireAdmin, (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(uploadsDir, filename);

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    db.prepare('DELETE FROM files WHERE filename = ?').run(filename);
    db.prepare('DELETE FROM cache_entries WHERE filename = ?').run(filename);

    res.json({ message: 'File deleted from Origin and cache invalidation triggered' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

app.listen(PORT, () => {
  console.log(`[Origin Server] Running on http://localhost:${PORT}`);
});
