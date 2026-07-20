# 🌐 MiniCDN — Distributed Content Delivery Network Simulator

MiniCDN is a simplified, multi-process Content Delivery Network (CDN) simulator built with **Node.js**, **Express**, **SQLite**, and **React**. It demonstrates core distributed systems concepts including **geographic edge routing**, **cache hit/miss performance optimization**, **JWT authentication**, and **pull/push cache synchronization**.

---

## ✨ Features

- 📍 **Geo-Distance Edge Routing (Haversine Formula)**: Calculates great-circle distances to dynamically route client requests to the nearest edge server.
- ⚡ **Edge Cache Invalidation & Acceleration**: Demonstrates a **10x speedup (80ms MISS vs 8ms HIT)** on cached payloads.
- 🔄 **Dynamic Routing Strategies**: Switch between **Haversine Geo-Distance** and **Ping Latency** routing, or test manual forced overrides.
- 🔐 **JWT Authentication & RBAC**: Admin role for master file uploads and global edge cache purges; User role for downloading and simulator testing.
- 🗺️ **Interactive Dashboard**: Real-time dark-mode UI with a Leaflet.js interactive map, client-to-edge connection arcs, and stream log analytics.

---

## 🏗️ System Architecture

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

## 🛠️ Tech Stack

- **Backend**: Node.js, Express
- **Database**: SQLite (`better-sqlite3`)
- **Frontend**: React (Vite), Leaflet.js, Lucide Icons, Axios
- **Auth**: JSON Web Tokens (JWT), bcryptjs

---

## 🚀 Quick Start & Installation

### 1. Clone the repository
```bash
git clone https://github.com/Agamya-123/MiniCDN.git
cd MiniCDN
```

### 2. Install dependencies
```bash
# Install root backend dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### 3. Start the services

**Start Origin Server (Port 4001):**
```bash
npm run start:origin
```

**Start Edge Servers (Ports 4002, 4003, 4004):**
```bash
npm run start:edge:mumbai
npm run start:edge:bangalore
npm run start:edge:lucknow
```

**Start Router / Gateway (Port 4000):**
```bash
npm run start:router
```

**Start Frontend Dashboard (Port 5173):**
```bash
cd frontend
npm run dev
```

Open your browser at **`http://localhost:5173`**.

---

## 🔑 Demo Credentials

- **Admin Account**: `admin@minicdn.com` / `admin123`
- **User Account**: `user@minicdn.com` / `user123`

---

## 🧪 Automated Testing

Run the automated end-to-end verification suite:
```bash
node scripts/test_cdn.js
```
