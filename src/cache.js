/**
 * Redis Cache Layer for Inventory Management
 * 
 * This module provides the distributed caching layer using Redis.
 * It stores and manages the inventory count, enabling atomic operations
 * and distributed access across multiple server instances.
 * 
 * If no external Redis server is running, it will automatically start
 * an embedded Redis server using redis-memory-server.
 */

const Redis = require("ioredis");
const { RedisMemoryServer } = require("redis-memory-server");

// Cache key constants
const INVENTORY_KEY = "flash_sale:inventory";
const STATS_KEY = "flash_sale:stats";
const INITIAL_STOCK = 500;

let redis = null;
let memoryServer = null;

/**
 * Create and connect the Redis client.
 * Tries external Redis first; falls back to embedded Redis.
 */
async function connect() {
  if (redis && redis.status === "ready") return redis;

  // First try connecting to an external Redis instance
  try {
    const externalClient = new Redis({
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: parseInt(process.env.REDIS_PORT) || 6379,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // Don't retry — we want to fail fast
      lazyConnect: true,
    });

    await externalClient.connect();
    await externalClient.ping();
    redis = externalClient;
    console.log("✅ Connected to external Redis server");
    return redis;
  } catch (err) {
    // External Redis not available — start embedded server
    console.log("⚠️  No external Redis found. Starting embedded Redis server...");
  }

  // Start embedded Redis via redis-memory-server
  memoryServer = new RedisMemoryServer();
  const host = await memoryServer.getHost();
  const port = await memoryServer.getPort();

  redis = new Redis({
    host,
    port,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      return Math.min(times * 50, 2000);
    },
  });

  redis.on("error", (err) => {
    console.error("❌ Redis connection error:", err.message);
  });

  await redis.ping();
  console.log(`✅ Embedded Redis started on ${host}:${port}`);
  return redis;
}

/**
 * Get the Redis client (must call connect() first).
 */
function getClient() {
  if (!redis) {
    throw new Error("Redis not connected. Call connect() first.");
  }
  return redis;
}

/**
 * Initialize the inventory count in the Redis cache.
 * Sets the stock to INITIAL_STOCK (500) and resets stats.
 */
async function initializeInventory(count = INITIAL_STOCK) {
  const client = getClient();
  await client.set(INVENTORY_KEY, count);
  await client.hmset(STATS_KEY, {
    successes: 0,
    failures: 0,
    totalRequests: 0,
  });
  console.log(`📦 Inventory initialized: ${count} items in cache`);
  return count;
}

/**
 * Get the current inventory count from Redis cache.
 * @returns {Promise<number>} Current stock count
 */
async function getInventory() {
  const client = getClient();
  const count = await client.get(INVENTORY_KEY);
  return parseInt(count) || 0;
}

/**
 * Reset the inventory back to initial stock.
 */
async function resetInventory() {
  return initializeInventory(INITIAL_STOCK);
}

/**
 * Increment a stat counter atomically.
 * @param {'successes'|'failures'|'totalRequests'} field
 */
async function incrementStat(field) {
  const client = getClient();
  await client.hincrby(STATS_KEY, field, 1);
}

/**
 * Get all purchase statistics.
 * @returns {Promise<Object>} Stats object with successes, failures, totalRequests
 */
async function getStats() {
  const client = getClient();
  const stats = await client.hgetall(STATS_KEY);
  return {
    successes: parseInt(stats.successes) || 0,
    failures: parseInt(stats.failures) || 0,
    totalRequests: parseInt(stats.totalRequests) || 0,
  };
}

/**
 * Gracefully close the Redis connection and embedded server.
 */
async function disconnect() {
  if (redis) {
    await redis.quit();
    console.log("🔌 Redis connection closed");
  }
  if (memoryServer) {
    await memoryServer.stop();
    console.log("🔌 Embedded Redis server stopped");
  }
}

module.exports = {
  connect,
  initializeInventory,
  getInventory,
  resetInventory,
  incrementStat,
  getStats,
  getClient,
  disconnect,
  INVENTORY_KEY,
  INITIAL_STOCK,
};
