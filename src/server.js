/**
 * Express Server — High-Throughput Inventory Tracker API
 * 
 * Provides REST endpoints for the flash-sale inventory system.
 * Serves both the API and the web UI dashboard.
 */

const express = require("express");
const cors = require("cors");
const path = require("path");
const cache = require("./cache");
const atomicStrategy = require("./strategies/atomicStrategy");
const lockStrategy = require("./strategies/lockStrategy");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// Request logger
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
  }
  next();
});

// ── API Routes ─────────────────────────────────────────────

/**
 * GET /api/inventory
 * Returns the current inventory count from Redis cache.
 */
app.get("/api/inventory", async (req, res) => {
  try {
    const count = await cache.getInventory();
    res.json({ inventory: count });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch inventory", details: error.message });
  }
});

/**
 * POST /api/purchase
 * Attempts to purchase one item.
 * Query params:
 *   - strategy: 'atomic' (default) | 'lock'
 */
app.post("/api/purchase", async (req, res) => {
  const strategy = req.query.strategy || "atomic";

  try {
    let result;

    if (strategy === "lock") {
      result = await lockStrategy.purchase();
    } else {
      result = await atomicStrategy.purchase();
    }

    const status = result.success ? 200 : 409;
    res.status(status).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`,
    });
  }
});

/**
 * POST /api/reset
 * Resets the inventory back to 500 items.
 */
app.post("/api/reset", async (req, res) => {
  try {
    const count = await cache.resetInventory();
    res.json({ message: `Inventory reset to ${count}`, inventory: count });
  } catch (error) {
    res.status(500).json({ error: "Failed to reset inventory", details: error.message });
  }
});

/**
 * GET /api/stats
 * Returns purchase statistics.
 */
app.get("/api/stats", async (req, res) => {
  try {
    const stats = await cache.getStats();
    const inventory = await cache.getInventory();
    res.json({ ...stats, currentInventory: inventory });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats", details: error.message });
  }
});

/**
 * POST /api/simulate
 * Runs a flash-sale simulation server-side.
 * Body: { concurrentUsers: number, strategy: 'atomic' | 'lock' }
 */
app.post("/api/simulate", async (req, res) => {
  const { concurrentUsers = 1000, strategy = "atomic" } = req.body;

  try {
    // Reset inventory first
    await cache.resetInventory();

    const startTime = Date.now();
    const strategyModule = strategy === "lock" ? lockStrategy : atomicStrategy;

    // Fire all requests concurrently
    const promises = Array.from({ length: concurrentUsers }, () =>
      strategyModule.purchase()
    );

    const results = await Promise.all(promises);
    const elapsed = Date.now() - startTime;

    const successes = results.filter((r) => r.success).length;
    const failures = results.filter((r) => !r.success).length;
    const finalInventory = await cache.getInventory();

    const report = {
      strategy,
      concurrentUsers,
      successes,
      failures,
      finalInventory,
      elapsedMs: elapsed,
      oversold: finalInventory < 0,
      passed: successes === cache.INITIAL_STOCK && finalInventory === 0,
    };

    console.log("\n📊 Simulation Report:", JSON.stringify(report, null, 2));

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: "Simulation failed", details: error.message });
  }
});

// ── Server Start ───────────────────────────────────────────

async function start() {
  try {
    // Connect to Redis (auto-starts embedded server if needed)
    await cache.connect();

    // Initialize inventory in Redis
    await cache.initializeInventory();

    app.listen(PORT, () => {
      console.log(`\n🚀 Inventory Tracker running at http://localhost:${PORT}`);
      console.log(`📡 API endpoints:`);
      console.log(`   GET  /api/inventory  — Check stock`);
      console.log(`   POST /api/purchase   — Buy item (?strategy=atomic|lock)`);
      console.log(`   POST /api/reset      — Reset to 500`);
      console.log(`   GET  /api/stats      — View statistics`);
      console.log(`   POST /api/simulate   — Run flash-sale simulation\n`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down...");
  await cache.disconnect();
  process.exit(0);
});

start();

module.exports = app;
