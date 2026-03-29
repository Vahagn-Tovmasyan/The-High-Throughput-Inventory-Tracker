/**
 * Race Condition Test
 * 
 * A focused test that fires MORE requests than available stock
 * to verify that the system never oversells. This is the critical
 * test for concurrency correctness.
 * 
 * Test: 2000 concurrent requests for 500 items
 * Pass condition: final inventory === 0 (never negative)
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function runRaceTest() {
  const TOTAL_REQUESTS = 2000;
  const strategies = ["atomic", "lock"];

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  🏁 RACE CONDITION TEST");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Requests per strategy : ${TOTAL_REQUESTS}`);
  console.log(`  Available stock       : 500`);
  console.log(`  Expected result       : Exactly 500 sales, 0 remaining\n`);

  let allPassed = true;

  for (const strategy of strategies) {
    console.log(`\n─── Testing: ${strategy.toUpperCase()} strategy ───`);

    // Reset
    await fetch(`${BASE_URL}/api/reset`, { method: "POST" });

    // Fire all requests
    const startTime = Date.now();
    const promises = Array.from({ length: TOTAL_REQUESTS }, () =>
      fetch(`${BASE_URL}/api/purchase?strategy=${strategy}`, {
        method: "POST",
      })
        .then((r) => r.json())
        .catch((err) => ({ success: false, message: err.message }))
    );

    const results = await Promise.all(promises);
    const elapsed = Date.now() - startTime;

    const successes = results.filter((r) => r.success).length;
    const failures = results.filter((r) => !r.success).length;

    // Check final state
    const finalRes = await fetch(`${BASE_URL}/api/inventory`);
    const final = await finalRes.json();

    const passed = final.inventory === 0 && successes === 500;

    console.log(`  Requests   : ${TOTAL_REQUESTS}`);
    console.log(`  Successes  : ${successes}`);
    console.log(`  Failures   : ${failures}`);
    console.log(`  Final Stock: ${final.inventory}`);
    console.log(`  Time       : ${elapsed}ms`);
    console.log(`  Result     : ${passed ? "✅ PASSED" : "❌ FAILED"}`);

    if (!passed) {
      allPassed = false;
      if (final.inventory < 0) {
        console.log(`  ⚠️  CRITICAL: Oversold by ${Math.abs(final.inventory)} items!`);
      }
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(allPassed
    ? "  ✅ ALL RACE CONDITION TESTS PASSED"
    : "  ❌ SOME TESTS FAILED — Race condition detected!"
  );
  console.log("═══════════════════════════════════════════════════════════\n");

  process.exit(allPassed ? 0 : 1);
}

runRaceTest();
