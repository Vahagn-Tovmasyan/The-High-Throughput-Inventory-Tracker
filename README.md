# ⚡ High-Throughput Inventory Tracker

A flash-sale inventory system that handles thousands of concurrent purchase attempts for 500 limited-stock items **without overselling**, using **Redis** for distributed caching and **atomic concurrency control**.

---

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web Browser   │────▶│  Express Server  │────▶│    Redis Cache   │
│   (Dashboard)   │◀────│   (Node.js)      │◀────│  (Inventory DB)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
              ┌─────▼─────┐      ┌─────▼─────┐
              │  Atomic    │      │  Lock      │
              │  Strategy  │      │  Strategy  │
              │ (Lua DECR) │      │ (Redlock)  │
              └────────────┘      └────────────┘
```

## 🔧 Prerequisites

- **Node.js** 18+
- **Redis** server running on `localhost:6379`

### Installing Redis

**Windows (WSL):**
```bash
wsl --install
sudo apt update && sudo apt install redis-server
sudo service redis-server start
```

**Docker:**
```bash
docker run -d --name redis -p 6379:6379 redis:alpine
```

**macOS:**
```bash
brew install redis && brew services start redis
```

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start the server (make sure Redis is running first)
npm start

# Open the dashboard
# Visit http://localhost:3000
```

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/inventory` | Get current stock count |
| `POST` | `/api/purchase?strategy=atomic\|lock` | Purchase 1 item |
| `POST` | `/api/reset` | Reset stock to 500 |
| `GET` | `/api/stats` | Get purchase statistics |
| `POST` | `/api/simulate` | Run flash-sale simulation |

## 🧪 Testing

```bash
# Load test: 1000 concurrent users, atomic strategy
npm run test:load

# Race condition test: 2000 requests for 500 items
npm run test:race

# Custom load test
node src/loadTest.js 3000 lock
```

## 🔒 Concurrency Strategies

### Strategy 1: Atomic (Lua Script)
Uses a Redis Lua script to perform an atomic **check-and-decrement** in a single operation. Because Lua scripts execute atomically within Redis, there is **zero race-condition risk**.

```lua
local current = tonumber(redis.call('GET', KEYS[1]))
if current and current > 0 then
  return redis.call('DECR', KEYS[1])
else
  return -1
end
```

### Strategy 2: Distributed Lock (Redlock)
Uses the **Redlock algorithm** to acquire a distributed lock before modifying inventory. More general-purpose — suitable for multi-step transactions.

```
1. Acquire lock → 2. Read inventory → 3. Decrement → 4. Release lock
```

### Comparison

| Feature | Atomic (Lua) | Lock (Redlock) |
|---------|:------------:|:--------------:|
| Race-condition safe | ✅ | ✅ |
| Speed | ⚡ Fast | 🐢 Slower |
| Multi-step ops | ❌ | ✅ |
| Lock contention | None | Possible |
| Best for | Simple counters | Complex transactions |

## 📁 Project Structure

```
├── public/                  # Web UI Dashboard
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── src/
│   ├── cache.js             # Redis caching layer
│   ├── server.js            # Express API server
│   ├── loadTest.js          # Load testing script
│   ├── raceTest.js          # Race condition test
│   └── strategies/
│       ├── atomicStrategy.js    # Lua-based atomic ops
│       └── lockStrategy.js      # Redlock distributed locks
├── package.json
└── README.md
```
