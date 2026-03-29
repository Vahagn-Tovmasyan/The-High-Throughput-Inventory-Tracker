/**
 * Atomic Strategy — Concurrency Control via Redis Lua Script
 * 
 * This strategy uses a Redis Lua script to perform an atomic
 * check-and-decrement operation. Because Lua scripts execute
 * atomically within Redis (single-threaded), there is ZERO
 * possibility of a race condition.
 * 
 * How it works:
 * 1. A Lua script is loaded into Redis
 * 2. The script checks if inventory > 0
 * 3. If yes, it decrements by 1 and returns the new count
 * 4. If no, it returns -1 (out of stock)
 * 5. Steps 2-4 happen as a single atomic operation
 * 
 * This is the RECOMMENDED approach for simple counter operations
 * because it combines the check and update into one uninterruptible
 * command, eliminating the race window entirely.
 */

const cache = require("../cache");

// Lua script for atomic check-and-decrement
// This runs entirely within Redis — no race condition possible
const ATOMIC_PURCHASE_SCRIPT = `
  local current = tonumber(redis.call('GET', KEYS[1]))
  if current and current > 0 then
    local newCount = redis.call('DECR', KEYS[1])
    return newCount
  else
    return -1
  end
`;

/**
 * Attempt to purchase one item using atomic Lua script.
 * 
 * @returns {Promise<{success: boolean, remaining: number, message: string}>}
 */
async function purchase() {
  const client = cache.getClient();

  try {
    // Execute the Lua script atomically
    const result = await client.eval(
      ATOMIC_PURCHASE_SCRIPT,
      1,                    // number of KEYS
      cache.INVENTORY_KEY   // KEYS[1]
    );

    await cache.incrementStat("totalRequests");

    if (result >= 0) {
      await cache.incrementStat("successes");
      return {
        success: true,
        remaining: result,
        message: `✅ Purchase successful! ${result} items remaining.`,
      };
    } else {
      await cache.incrementStat("failures");
      return {
        success: false,
        remaining: 0,
        message: "❌ Out of stock! Item is sold out.",
      };
    }
  } catch (error) {
    await cache.incrementStat("failures");
    await cache.incrementStat("totalRequests");
    return {
      success: false,
      remaining: await cache.getInventory(),
      message: `❌ Purchase failed: ${error.message}`,
    };
  }
}

module.exports = { purchase };
