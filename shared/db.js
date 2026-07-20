import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const dataDir = path.resolve('data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'cdn.db');
const db = new Database(dbPath);

// Enable WAL mode for high performance concurrent access across processes
db.pragma('journal_mode = WAL');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      original_name TEXT NOT NULL,
      origin_path TEXT NOT NULL,
      size INTEGER NOT NULL,
      mimetype TEXT NOT NULL,
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS edge_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      base_url TEXT NOT NULL,
      status TEXT DEFAULT 'online'
    );

    CREATE TABLE IF NOT EXISTS cache_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      edge_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      hit_count INTEGER DEFAULT 1,
      UNIQUE(edge_id, filename),
      FOREIGN KEY (edge_id) REFERENCES edge_servers(id)
    );

    CREATE TABLE IF NOT EXISTS request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      filename TEXT NOT NULL,
      client_lat REAL,
      client_lng REAL,
      edge_server_used TEXT NOT NULL,
      cache_hit INTEGER NOT NULL,
      response_time_ms REAL NOT NULL,
      routing_mode TEXT DEFAULT 'geo',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default admin user if not exists
  const adminCheck = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@minicdn.com');
  if (!adminCheck) {
    const salt = bcrypt.genSaltSync(10);
    const passHash = bcrypt.hashSync('admin123', salt);
    db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
      'System Admin',
      'admin@minicdn.com',
      passHash,
      'admin'
    );
    // Seed demo user
    const userHash = bcrypt.hashSync('user123', salt);
    db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
      'Demo User',
      'user@minicdn.com',
      userHash,
      'user'
    );
  }

  // Seed default Edge Servers if not exists
  const edges = [
    { name: 'Mumbai', latitude: 19.0760, longitude: 72.8777, base_url: 'http://localhost:4002', status: 'online' },
    { name: 'Bangalore', latitude: 12.9716, longitude: 77.5946, base_url: 'http://localhost:4003', status: 'online' },
    { name: 'Lucknow', latitude: 26.8467, longitude: 80.9462, base_url: 'http://localhost:4004', status: 'online' }
  ];

  const insertEdge = db.prepare(`
    INSERT INTO edge_servers (name, latitude, longitude, base_url, status)
    VALUES (@name, @latitude, @longitude, @base_url, @status)
    ON CONFLICT(name) DO UPDATE SET
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      base_url = excluded.base_url,
      status = excluded.status
  `);

  for (const edge of edges) {
    insertEdge.run(edge);
  }
}

// Initialize tables and seed data immediately upon module import
initDatabase();

export default db;
