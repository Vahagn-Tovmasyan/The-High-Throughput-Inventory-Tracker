/**
 * Load Test — Simulates a Flash Sale
 * 
 * Fires N concurrent purchase requests against the server
 * to verify that the concurrency control works correctly.
 * 
 * Usage:
 *   npm run test:load
 *   node src/loadTest.js [concurrentUsers] [strategy]
 * 
 * Example:
 *   node src/loadTest.js 1000 atomic
 *   node src/loadTest.js 2000 lock
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function runLoadTest(concurrentUsers = 1000, strategy = "atomic") {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  🔥 FLASH SALE LOAD TEST");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Concurrent Users : ${concurrentUsers}`);
  console.log(`  Strategy         : ${strategy}`);
  console.log(`  Initial Stock    : 500`);
  console.log(`  Server           : ${BASE_URL}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // Step 1: Reset inventory
  console.log("📦 Resetting inventory to 500...");
  await fetch(`${BASE_URL}/api/reset`, { method: "POST" });

  // Step 2: Verify initial state
  const initialRes = await fetch(`${BASE_URL}/api/inventory`);
  const initial = await initialRes.json();
  console.log(`✅ Inventory confirmed: ${initial.inventory}\n`);

  // Step 3: Fire all requests simultaneously
  console.log(`🚀 Launching ${concurrentUsers} concurrent purchase requests...\n`);
  const startTime = Date.now();

  const promises = Array.from({ length: concurrentUsers }, (_, i) =>
    fetch(`${BASE_URL}/api/purchase?strategy=${strategy}`, {
      method: "POST",
    })
      .then((r) => r.json())
      .catch((err) => ({ success: false, message: err.message }))
  );

  const results = await Promise.all(promises);
  const elapsed = Date.now() - startTime;

  // Step 4: Analyze results
  const successes = results.filter((r) => r.success).length;
  const failures = results.filter((r) => !r.success).length;

  // Step 5: Check final inventory
  const finalRes = await fetch(`${BASE_URL}/api/inventory`);
  const final = await finalRes.json();

  // Step 6: Get stats
  const statsRes = await fetch(`${BASE_URL}/api/stats`);
  const stats = await statsRes.json();

  // Report
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  📊 LOAD TEST RESULTS");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Strategy           : ${strategy}`);
  console.log(`  Total Requests     : ${concurrentUsers}`);
  console.log(`  Successes          : ${successes}`);
  console.log(`  Failures (sold out): ${failures}`);
  console.log(`  Final Inventory    : ${final.inventory}`);
  console.log(`  Time Elapsed       : ${elapsed}ms`);
  console.log(`  Throughput         : ${Math.round(concurrentUsers / (elapsed / 1000))} req/s`);
  console.log("───────────────────────────────────────────────────────────");

  // Validation
  const oversold = final.inventory < 0;
  const exactSales = successes === 500;
  const zeroInventory = final.inventory === 0;

  if (oversold) {
    console.log("  ❌ FAIL: OVERSELLING DETECTED! Inventory went below 0.");
  } else if (exactSales && zeroInventory) {
    console.log("  ✅ PASS: Exactly 500 sales, inventory is 0. No race conditions!");
  } else {
    console.log(`  ⚠️  WARN: ${successes} sales made, inventory at ${final.inventory}`);
  }

  console.log("═══════════════════════════════════════════════════════════\n");

  return { successes, failures, finalInventory: final.inventory, elapsed, oversold };
}

// CLI entry point
const args = process.argv.slice(2);
const users = parseInt(args[0]) || 1000;
const strategy = args[1] || "atomic";

runLoadTest(users, strategy).then((result) => {
  process.exit(result.oversold ? 1 : 0);
});
