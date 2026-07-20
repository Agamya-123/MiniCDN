# MiniCDN — A Simplified Content Delivery Network (Resume Project)

## 0. One-line pitch (for resume)
"Built a distributed CDN simulator with geo-based edge routing, cache synchronization across nodes, and JWT authentication — demonstrating system design, networking, and distributed systems concepts."

---

## 1. What this project actually is (in plain words)

Imagine you have **one big storage room (Origin Server)** where the "real" files live — images, videos, documents, whatever.

Now imagine you build **3-4 small storage lockers (Edge Servers)** in different cities. Each locker can hold copies of files from the big room.

When a user asks for a file:
1. The system figures out **which locker is closest to that user**.
2. If that locker already has the file → give it to the user immediately (fast, this is called a "cache hit").
3. If that locker does NOT have the file → the locker asks the big room for it, keeps a copy for next time, and gives it to the user (slower, this is called a "cache miss").

That's a CDN. Real CDNs (Cloudflare, Akamai, AWS CloudFront) do exactly this at a massive scale. You are building a mini, simplified version — same core ideas, small scale.

On top of that you add:
- **Login system** — so only registered users can upload/download, and admins can manage files.
- **A dashboard** — to see which edge server served which request, and to manually test different edges.
- **Sync mechanism** — so when a new file is added to the Origin, edges can get updated.

---

## 2. Why this project is good for a resume

It touches concepts interviewers love to ask about:
- Distributed systems (multiple servers working together)
- Caching strategies (cache hit/miss, TTL, eviction)
- Geolocation-based routing (a real system design interview topic — "how would you design a CDN?")
- Authentication (JWT, sessions)
- Networking basics (HTTP, latency, IP geolocation)
- Basic system design diagrams you can literally show in an interview

---

## 3. System Design — The Big Picture

```
                            ┌────────────────────┐
                            │   ORIGIN SERVER     │
                            │  (Master copy of    │
                            │   all files + DB)   │
                            └─────────▲───────────┘
                                      │  (fetch on cache miss,
                                      │   or push on upload)
              ┌───────────────────────┼────────────────────────┐
              │                       │                        │
     ┌────────▼────────┐    ┌─────────▼────────┐     ┌─────────▼────────┐
     │ EDGE SERVER 1    │    │ EDGE SERVER 2    │     │ EDGE SERVER 3    │
     │ "Mumbai"         │    │ "Bangalore"       │     │ "Lucknow"        │
     │ (local cache)    │    │ (local cache)     │     │ (local cache)    │
     └────────▲─────────┘    └─────────▲────────┘     └─────────▲────────┘
              │                        │                        │
              └────────────────────────┼────────────────────────┘
                                       │
                             ┌─────────▼─────────┐
                             │   ROUTER / API      │
                             │  GATEWAY (decides    │
                             │  nearest edge)       │
                             └─────────▲───────────┘
                                       │
                             ┌─────────▼─────────┐
                             │   USER / BROWSER    │
                             └─────────────────────┘
```

**In words:**
- The **Router** is the brain. Every request from a user hits the Router first.
- The Router looks at the user's location and picks the nearest Edge Server.
- The Router forwards the request to that Edge Server.
- The Edge Server checks its own cache. If it has the file, done. If not, it goes to the Origin, fetches it, stores a copy, and returns it.

---

## 4. The Core Algorithms (explained super simply)

### 4.1 "Which server is nearest to me?" — Nearest Edge Selection

Two ways to do this, pick the simple one first:

**Method A — Straight-line distance (Haversine formula) — RECOMMENDED for this project**
- Every Edge Server has a fixed (latitude, longitude):
  - Mumbai = (19.07, 72.87)
  - Bangalore = (12.97, 77.59)
  - Lucknow = (26.85, 80.95)
- When a user connects, get their approximate (latitude, longitude) using a free IP-geolocation API (e.g., ip-api.com) or the browser's Geolocation API.
- Calculate the distance from the user to EACH edge server using the Haversine formula (a standard formula for distance between two points on a sphere/Earth).
- Pick the edge server with the **smallest distance**.

Think of it like: you drop a pin for the user and a pin for each server on a map, measure the straight-line distance to each, and pick the shortest one.

**Method B — Ping/latency based (more "real" but more complex, optional stretch goal)**
- Instead of geographic distance, actually measure response time (ping) from the user to each edge server.
- Pick the one that responds fastest.
- This is closer to what real CDNs do, but adds complexity — do this only after Method A works.

### 4.2 "Do I already have this file?" — Caching Algorithm

Each Edge Server keeps a simple lookup table (a database table or even a JSON/Redis store):
```
filename → { exists_locally: true/false, last_updated: timestamp, hit_count: number }
```

- **Cache Hit**: file exists locally and hasn't expired → serve immediately.
- **Cache Miss**: file doesn't exist locally, OR it's expired (older than a TTL, e.g., 10 minutes) → fetch fresh copy from Origin, save it locally, then serve.
- **Eviction (optional stretch goal)**: if storage is "full" (simulate with a max file count, e.g., 20 files per edge), remove the **Least Recently Used (LRU)** file to make space. This is the same idea browsers and databases use.

### 4.3 "Keeping edges up to date" — Sync Strategy

Simplest approach (RECOMMENDED): **Pull-based (lazy) sync**
- Edges don't do anything until they get a request for a file they don't have (or an outdated one).
- On a cache miss, they pull from Origin. Simple, no extra moving parts.

Optional stretch goal: **Push-based sync**
- When an admin uploads/updates a file on Origin, Origin immediately notifies all Edge Servers (e.g., via a webhook or a message queue) to refresh their copy.
- This shows you understand active vs. passive synchronization — a nice thing to mention in interviews.

---

## 5. Components To Build

| Component | What it does | Suggested Tech |
|---|---|---|
| **Origin Server** | Stores master files + file metadata + user accounts | Node.js + Express, MongoDB/PostgreSQL |
| **Edge Server(s)** | 3 identical lightweight servers, each with its own local cache/storage folder + local metadata | Node.js + Express (run 3 copies on different ports, or deploy to 3 free-tier regions like Render/Railway/Fly.io) |
| **Router / Gateway** | Receives all client requests, runs the nearest-edge algorithm, forwards request | Node.js + Express |
| **Auth Service** | Signup/Login, issues JWT tokens | Node.js + Express + JWT + bcrypt |
| **Frontend Dashboard** | Login page, file upload (admin), file download/test page, a map showing which edge served the request, manual "force this edge server" test dropdown | React + a simple map library (Leaflet.js) |
| **Database** | Users table, Files table, Edge-server registry table, Request logs table | MongoDB or PostgreSQL |

You do NOT need Docker/Kubernetes for this — running each server as a separate Node.js process on a different port (e.g., 4001, 4002, 4003) is enough to prove the concept. Deploying each to a different free-tier region (e.g., one on Render's US region, one on Singapore, one on EU) makes it even more legit but is optional.

---

## 6. Database Schema (Simple)

**users**
```
id, name, email, password_hash, role (admin/user), created_at
```

**files**
```
id, filename, origin_path, size, uploaded_by (user id), created_at, updated_at
```

**edge_servers**
```
id, name (e.g. "Mumbai"), latitude, longitude, base_url, status (online/offline)
```

**cache_entries** (one per edge, or one table with an edge_id column)
```
id, edge_id, file_id, cached_at, expires_at, hit_count
```

**request_logs** (great for your dashboard + shows off analytics thinking)
```
id, user_id, file_id, client_lat, client_long, edge_server_used, cache_hit (true/false), response_time_ms, created_at
```

---

## 7. API Endpoints (Simple List)

**Auth**
- `POST /auth/signup`
- `POST /auth/login` → returns JWT

**Router/Gateway**
- `GET /file/:filename` → (auth required) figures out nearest edge, forwards, returns file + which edge served it
- `GET /file/:filename?forceEdge=mumbai` → manual override, for testing/demo purposes

**Origin**
- `POST /origin/upload` (admin only) → upload a new file
- `GET /origin/file/:filename` → internal, called by edge servers on cache miss
- `GET /origin/files` → list all files

**Edge Server** (each edge exposes the same routes)
- `GET /edge/file/:filename` → check local cache, serve or fetch-from-origin-then-serve
- `GET /edge/status` → health check, used by Router to know if edge is online

**Dashboard/Analytics**
- `GET /logs` → recent requests, which edge served them, hit/miss, response time
- `GET /edges` → list of edge servers + their current cache contents (nice for demo)

---

## 8. Suggested Build Order (Phases) — for Antigravity to follow

**Phase 1 — Foundation**
1. Set up project folders: `/origin`, `/edge`, `/router`, `/frontend`, shared `/lib` for common code.
2. Set up database (Users, Files, EdgeServers, CacheEntries, RequestLogs tables/collections).
3. Build Auth (signup/login, JWT middleware).

**Phase 2 — Origin + Edge basics**
4. Build Origin Server: file upload, file storage (local folder is fine), file listing.
5. Build ONE Edge Server: on request, check local cache folder → if missing, call Origin, save copy, serve file.
6. Test manually: hit the edge server directly, confirm cache miss then cache hit on second request.

**Phase 3 — Multiple edges + Router**
7. Duplicate the Edge Server to run 3 instances (different ports), each pre-configured with a fixed lat/long (Mumbai, Bangalore, Lucknow) and registered in the `edge_servers` table.
8. Build the Router: accepts client lat/long (from IP-geolocation API or query param during testing), runs the Haversine distance calculation against all edges, forwards request to nearest edge, logs the result to `request_logs`.
9. Add the manual override (`forceEdge=`) so you can demo/test hitting each edge deliberately.

**Phase 4 — Frontend Dashboard**
10. Login/Signup pages.
11. Admin upload page.
12. "Download/test a file" page — shows a map (Leaflet.js) with all edge server pins and the user's detected location, highlights which edge served the last request, shows cache hit/miss + response time.
13. Logs/analytics page — table of recent requests.

**Phase 5 — Polish (optional but great for resume)**
14. Add TTL-based cache expiry + LRU eviction on edges.
15. Add push-based sync option (origin notifies edges on new upload).
16. Add a simple latency-based routing mode (Method B) as a toggle, to show both approaches.
17. Deploy edges to 3 different real regions using a free hosting tier, so distances are genuinely real.

---

## 9. How To Test It (Demo Script for Interviews)

1. Log in as admin, upload a file to Origin.
2. Log in as a normal user, request the file → show it's a cache miss the first time (slower), then request again → cache hit (faster). Show response times in the dashboard.
3. Use the `forceEdge=` override to manually pull the same file from a different edge → show that edge starts empty (miss) then caches it too.
4. Show the request logs table — proof of which edge served what, and hit/miss ratio.
5. (Optional) Show the map view with pins lighting up as requests come in.

---

## 10. Tech Stack Summary

- **Backend**: Node.js + Express (all services: origin, edge, router, auth)
- **Database**: MongoDB (fastest to set up) or PostgreSQL if you prefer SQL
- **Auth**: JWT + bcrypt
- **Frontend**: React + Leaflet.js (for the map) + Axios
- **Geolocation**: ip-api.com (free, no key needed) or browser Geolocation API
- **Hosting (optional)**: Render / Railway / Fly.io free tiers, one instance per region

---

## 11. What NOT to overbuild (keep it simple, this is a POV/resume project)

- No need for Docker/Kubernetes — plain Node processes on different ports is enough.
- No need for a real CDN's edge caching hardware/network — a folder + DB row per edge is enough.
- No need for a message queue (Kafka/RabbitMQ) for sync — a simple HTTP call from Origin to Edges is enough, unless you want to add it as a stretch goal to sound more advanced.
- No need for HTTPS/SSL complexity in dev — just document that production would need it.

---

## 12. Instructions for Antigravity (build agent)

> Build this project exactly as scoped above, in the phase order given in Section 8. Use Node.js/Express for all backend services and React for the frontend. Keep each service (`origin`, `edge`, `router`) as a separate small Express app so they can run independently on different ports, simulating physically separate servers. Use the database schema in Section 6 as-is. Implement the Haversine nearest-edge algorithm from Section 4.1 first; treat latency-based routing and cache eviction/sync-push as optional stretch phases (Phase 5) only after the core flow (Phases 1-4) works end-to-end. Prioritize a working, demoable end-to-end flow over completeness — a user should be able to log in, request a file, and see which edge served it with a hit/miss indicator, before any polish is added.
