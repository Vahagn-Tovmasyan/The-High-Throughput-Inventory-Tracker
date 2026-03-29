/**
 * Lock Strategy — Concurrency Control via Distributed Locks (Redlock)
 * 
 * This strategy uses the Redlock algorithm to acquire a distributed
 * lock before reading and modifying the inventory. This is a more
 * general-purpose pattern suitable for multi-step transactions where
 * simple atomic operations aren't sufficient.
 * 
 * How it works:
 * 1. Acquire a distributed lock on the inventory resource
 * 2. Read the current inventory count from Redis
 * 3. If count > 0, decrement and write back
 * 4. Release the lock
 * 
 * Trade-offs vs Atomic Strategy:
 * - Slower due to lock acquisition/release overhead
 * - More flexible — can protect multi-step operations
 * - Risk of lock contention under extreme concurrency
 * - Useful when operations span multiple keys or services
 */

const Redlock = require("redlock");
const cache = require("../cache");

// Lock configuration
const LOCK_RESOURCE = "locks:flash_sale:inventory";
const LOCK_TTL = 5000; // Lock expires after 5 seconds (safety net)

let redlock = null;

/**
 * Initialize the Redlock instance.
 * Must be called after Redis connection is established.
 */
function initRedlock() {
  const client = cache.getClient();
  redlock = new Redlock([client], {
    // Retry configuration
    retryCount: 10,
    retryDelay: 200,     // ms between retries
    retryJitter: 200,    // random jitter to avoid thundering herd
    automaticExtensionThreshold: 500,
  });

  redlock.on("error", (error) => {
    // Ignore resource locked errors (expected under contention)
    if (error.name !== "ResourceLockedError") {
      console.error("🔒 Redlock error:", error.message);
    }
  });

  console.log("🔒 Redlock distributed lock initialized");
  return redlock;
}

/**
 * Attempt to purchase one item using distributed lock.
 * 
 * @returns {Promise<{success: boolean, remaining: number, message: string}>}
 */
async function purchase() {
  if (!redlock) {
    initRedlock();
  }

  let lock = null;

  try {
    // Step 1: Acquire the distributed lock
    lock = await redlock.acquire([LOCK_RESOURCE], LOCK_TTL);

    // Step 2: Read current inventory (within the lock)
    const current = await cache.getInventory();

    await cache.incrementStat("totalRequests");

    if (current > 0) {
      // Step 3: Decrement inventory
      const client = cache.getClient();
      const remaining = await client.decr(cache.INVENTORY_KEY);

      await cache.incrementStat("successes");

      // Step 4: Release the lock
      await lock.release();

      return {
        success: true,
        remaining: remaining,
        message: `✅ Purchase successful! ${remaining} items remaining.`,
      };
    } else {
      await cache.incrementStat("failures");

      // Release lock even on failure
      await lock.release();

      return {
        success: false,
        remaining: 0,
        message: "❌ Out of stock! Item is sold out.",
      };
    }
  } catch (error) {
    // Release lock if we still hold it
    if (lock) {
      try {
        await lock.release();
      } catch (_) {
        // Lock may have already expired
      }
    }

    await cache.incrementStat("failures");
    await cache.incrementStat("totalRequests");

    return {
      success: false,
      remaining: await cache.getInventory(),
      message: `❌ Purchase failed: ${error.message}`,
    };
  }
}

module.exports = { purchase, initRedlock };
