# MiniCDN — Distributed Content Delivery Network Simulator

MiniCDN is a multi-process Content Delivery Network (CDN) simulator implemented in **Node.js**, **Express**, **SQLite**, and **React**. The application demonstrates core distributed systems engineering concepts, including geographic edge routing, cache hit/miss optimization, JWT-based role authentication, and pull/push cache synchronization.

---

## Technical Overview

- **Geographic Distance Routing (Haversine Formula)**: Calculates great-circle distances across spherical Earth coordinates to dynamically route incoming client requests to the nearest edge server node.
- **Latency-Based Routing Mode**: Measures real-time network response latencies across all active edge nodes to route traffic dynamically to the lowest-latency edge.
- **Edge Cache Optimization**: Implements lazy-pull edge caching with automatic origin fallback, reducing payload delivery times from 80ms on cache MISS to 8ms on cache HIT (10x performance improvement).
- **Proactive Push Synchronization**: Enables origin-driven cache invalidation to broadcast purge events to edge nodes upon master file modifications.
- **Authentication & Access Control**: Enforces Role-Based Access Control (RBAC) via JSON Web Tokens (JWT) and bcrypt password hashing.

---

## System Architecture

```
                             ┌────────────────────┐
                             │   ORIGIN SERVER    │
                             │   (Master Files)   │
                             │     Port 4001      │
                             └─────────▲──────────┘
                                       │ (Fetch on cache miss)
               ┌───────────────────────┼────────────────────────┐
               │                       │                        │
      ┌────────▼────────┐    ┌─────────▼────────┐     ┌─────────▼────────┐
      │ EDGE SERVER 1   │    │ EDGE SERVER 2    │     │ EDGE SERVER 3    │
      │ "Mumbai" (4002) │    │"Bangalore" (4003)│     │ "Lucknow" (4004) │
      └────────▲────────┘    └─────────▲────────┘     └─────────▲────────┘
               │                       │                        │
               └───────────────────────┼────────────────────────┘
                                       │
                             ┌─────────▼─────────┐
                             │   ROUTER / API    │
                             │     GATEWAY       │
                             │    Port 4000      │
                             └─────────▲─────────┘
                                       │
                             ┌─────────▼─────────┐
                             │  REACT DASHBOARD  │
                             │    Port 5173      │
                             └───────────────────┘
```

---

## Technology Stack

- **Backend Runtime**: Node.js, Express.js
- **Database Layer**: SQLite (`better-sqlite3`)
- **Frontend Framework**: React 18, Vite, Leaflet.js, Lucide Icons, Axios
- **Security & Authentication**: JSON Web Tokens (JWT), bcryptjs

---

## API Specification

### Authentication
- `POST /api/auth/signup` — Registers a new user account and returns a JWT token.
- `POST /api/auth/login` — Authenticates user credentials and returns a JWT token.
- `GET /api/auth/me` — Returns authenticated user profile details.

### Content Delivery & Routing
- `GET /api/file/:filename` — Main CDN proxy endpoint. Accepts optional query parameters:
  - `lat` (float): Client latitude coordinate.
  - `lng` (float): Client longitude coordinate.
  - `mode` (`geo` | `latency`): Routing strategy algorithm.
  - `forceEdge` (string): Manual edge server override.

### File Management & Analytics
- `POST /api/origin/upload` — Uploads master file payload to Origin Server (Admin privileges required). Accepts optional `pushSync=true` query parameter.
- `GET /api/files` — Retrieves catalog of files stored on Origin Server.
- `GET /api/edges` — Queries operational status and cached entries across all edge nodes.
- `GET /api/logs` — Retrieves request stream logs and network performance metrics.
- `POST /api/edges/purge` — Dispatches cache purge commands to edge nodes (Admin privileges required).

---

## Installation & Deployment

### Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher)

### Setup Instructions

1. Clone the repository:
   ```bash
   git clone https://github.com/Agamya-123/MiniCDN.git
   cd MiniCDN
   ```

2. Install root backend dependencies:
   ```bash
   npm install
   ```

3. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   cd ..
   ```

---

## Running Services

To run the complete network, execute each component service in separate terminal windows:

```bash
# 1. Start Origin Server (Port 4001)
npm run start:origin

# 2. Start Regional Edge Servers
npm run start:edge:mumbai     # Port 4002
npm run start:edge:bangalore  # Port 4003
npm run start:edge:lucknow    # Port 4004

# 3. Start Router Gateway (Port 4000)
npm run start:router

# 4. Start React Frontend Dashboard (Port 5173)
cd frontend
npm run dev
```

Access the interactive web dashboard at **`http://localhost:5173`**.

---

## Demo Accounts

- **Administrator**: `admin@minicdn.com` / `admin123`
- **Standard User**: `user@minicdn.com` / `user123`

---

## Automated Verification

Execute the automated integration test suite to verify end-to-end routing, cache hits/misses, and latency benchmarks:

```bash
node scripts/test_cdn.js
```

---

## License

This project is licensed under the terms of the [MIT License](LICENSE).
