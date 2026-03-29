/**
 * Flash Sale Dashboard — Frontend Application
 * 
 * Handles UI interactions, API calls, and real-time updates
 * for the inventory tracker dashboard.
 */

const API = "";

// ── State ─────────────────────────────────────────────────
let currentStrategy = "atomic";
let isSimulating = false;

// ── DOM Elements ──────────────────────────────────────────
const elements = {
  inventoryCount: document.getElementById("inventory-count"),
  gaugeFill: document.getElementById("gauge-fill"),
  connectionStatus: document.getElementById("connection-status"),
  btnBuy: document.getElementById("btn-buy"),
  btnSimulate: document.getElementById("btn-simulate"),
  btnReset: document.getElementById("btn-reset"),
  btnAtomic: document.getElementById("btn-atomic"),
  btnLock: document.getElementById("btn-lock"),
  userCountSlider: document.getElementById("user-count-slider"),
  userCountDisplay: document.getElementById("user-count-display"),
  statSuccesses: document.getElementById("stat-successes"),
  statFailures: document.getElementById("stat-failures"),
  statTotal: document.getElementById("stat-total"),
  statTime: document.getElementById("stat-time"),
  resultBanner: document.getElementById("result-banner"),
  resultIcon: document.getElementById("result-icon"),
  resultText: document.getElementById("result-text"),
  logContainer: document.getElementById("log-container"),
};

// ── Gauge ─────────────────────────────────────────────────
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 85; // ~534

function updateGauge(count) {
  const percentage = count / 500;
  const offset = GAUGE_CIRCUMFERENCE * (1 - percentage);
  elements.gaugeFill.style.strokeDashoffset = offset;

  // Color coding
  elements.gaugeFill.classList.remove("success", "warning", "danger");
  if (percentage > 0.5) {
    elements.gaugeFill.classList.add("success");
  } else if (percentage > 0.2) {
    elements.gaugeFill.classList.add("warning");
  } else {
    elements.gaugeFill.classList.add("danger");
  }

  // Animate the number
  animateNumber(elements.inventoryCount, count);
}

function animateNumber(el, target) {
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;

  const diff = target - current;
  const steps = Math.min(Math.abs(diff), 20);
  const stepValue = diff / steps;
  let step = 0;

  const timer = setInterval(() => {
    step++;
    if (step >= steps) {
      el.textContent = target;
      clearInterval(timer);
    } else {
      el.textContent = Math.round(current + stepValue * step);
    }
  }, 30);
}

// ── Logging ───────────────────────────────────────────────
function log(message, type = "info") {
  const entry = document.createElement("div");
  entry.className = `log-entry log-${type}`;
  const time = new Date().toLocaleTimeString();
  entry.textContent = `[${time}] ${message}`;
  elements.logContainer.prepend(entry);

  // Keep log manageable
  while (elements.logContainer.children.length > 100) {
    elements.logContainer.removeChild(elements.logContainer.lastChild);
  }
}

// ── API Calls ─────────────────────────────────────────────
async function fetchInventory() {
  try {
    const res = await fetch(`${API}/api/inventory`);
    const data = await res.json();
    updateGauge(data.inventory);
    elements.connectionStatus.textContent = "Redis Connected";
    return data.inventory;
  } catch (err) {
    elements.connectionStatus.textContent = "Disconnected";
    log("Failed to connect to server", "fail");
    return null;
  }
}

async function fetchStats() {
  try {
    const res = await fetch(`${API}/api/stats`);
    const data = await res.json();
    elements.statSuccesses.textContent = data.successes;
    elements.statFailures.textContent = data.failures;
    elements.statTotal.textContent = data.totalRequests;
    return data;
  } catch (err) {
    // silently fail
  }
}

async function purchaseOne() {
  if (isSimulating) return;

  elements.btnBuy.disabled = true;
  try {
    const res = await fetch(`${API}/api/purchase?strategy=${currentStrategy}`, {
      method: "POST",
    });
    const data = await res.json();

    if (data.success) {
      log(`Purchase successful! ${data.remaining} remaining. [${currentStrategy}]`, "success");
      flashCard(".gauge-card", "success");
    } else {
      log(`Purchase rejected: ${data.message} [${currentStrategy}]`, "fail");
      flashCard(".gauge-card", "danger");
    }

    await fetchInventory();
    await fetchStats();
  } catch (err) {
    log(`Error: ${err.message}`, "fail");
  } finally {
    elements.btnBuy.disabled = false;
  }
}

async function runSimulation() {
  if (isSimulating) return;
  isSimulating = true;

  const concurrentUsers = parseInt(elements.userCountSlider.value);

  elements.btnSimulate.disabled = true;
  elements.btnBuy.disabled = true;
  elements.btnReset.disabled = true;
  elements.btnSimulate.innerHTML = '<span class="btn-icon loading">🔥</span> Simulating...';
  elements.resultBanner.classList.add("hidden");

  log(`🔥 Launching flash sale: ${concurrentUsers} users, ${currentStrategy} strategy`, "warn");

  try {
    const res = await fetch(`${API}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        concurrentUsers,
        strategy: currentStrategy,
      }),
    });

    const data = await res.json();

    // Update UI
    elements.statSuccesses.textContent = data.successes;
    elements.statFailures.textContent = data.failures;
    elements.statTotal.textContent = data.concurrentUsers;
    elements.statTime.textContent = data.elapsedMs;

    await fetchInventory();

    // Result banner
    elements.resultBanner.classList.remove("hidden", "pass", "fail");
    if (data.passed) {
      elements.resultBanner.classList.add("pass");
      elements.resultIcon.textContent = "✅";
      elements.resultText.textContent = `PASSED — ${data.successes} sales, 0 remaining, no overselling! (${data.elapsedMs}ms)`;
      log(`✅ PASSED: ${data.successes} sales, inventory at ${data.finalInventory}`, "success");
    } else {
      elements.resultBanner.classList.add("fail");
      elements.resultIcon.textContent = "❌";
      elements.resultText.textContent = data.oversold
        ? `FAILED — Oversold! Inventory at ${data.finalInventory}`
        : `Completed — ${data.successes} sales, inventory at ${data.finalInventory}`;
      log(`❌ Result: ${data.successes} sales, inventory ${data.finalInventory}`, "fail");
    }

    log(`Throughput: ${Math.round(data.concurrentUsers / (data.elapsedMs / 1000))} req/s`, "info");
  } catch (err) {
    log(`Simulation error: ${err.message}`, "fail");
  } finally {
    isSimulating = false;
    elements.btnSimulate.disabled = false;
    elements.btnBuy.disabled = false;
    elements.btnReset.disabled = false;
    elements.btnSimulate.innerHTML = '<span class="btn-icon">🔥</span> Launch Flash Sale';
  }
}

async function resetInventory() {
  try {
    await fetch(`${API}/api/reset`, { method: "POST" });
    await fetchInventory();
    await fetchStats();
    elements.resultBanner.classList.add("hidden");
    log("🔄 Inventory reset to 500", "info");
  } catch (err) {
    log(`Reset error: ${err.message}`, "fail");
  }
}

// ── UI Helpers ────────────────────────────────────────────
function flashCard(selector, type) {
  const card = document.querySelector(selector);
  card.classList.remove("flash-success", "flash-danger");
  // Force reflow
  void card.offsetWidth;
  card.classList.add(`flash-${type}`);
  setTimeout(() => card.classList.remove(`flash-${type}`), 600);
}

function setStrategy(strategy) {
  currentStrategy = strategy;
  elements.btnAtomic.classList.toggle("active", strategy === "atomic");
  elements.btnLock.classList.toggle("active", strategy === "lock");
  log(`Strategy switched to: ${strategy}`, "info");
}

// ── Event Listeners ──────────────────────────────────────
elements.btnBuy.addEventListener("click", purchaseOne);
elements.btnSimulate.addEventListener("click", runSimulation);
elements.btnReset.addEventListener("click", resetInventory);

elements.btnAtomic.addEventListener("click", () => setStrategy("atomic"));
elements.btnLock.addEventListener("click", () => setStrategy("lock"));

elements.userCountSlider.addEventListener("input", (e) => {
  elements.userCountDisplay.textContent = e.target.value;
});

// ── Polling ──────────────────────────────────────────────
let pollInterval;

function startPolling() {
  fetchInventory();
  fetchStats();
  pollInterval = setInterval(async () => {
    if (!isSimulating) {
      await fetchInventory();
      await fetchStats();
    }
  }, 2000);
}

// ── Init ─────────────────────────────────────────────────
startPolling();
log("Dashboard ready. Connected to Redis cache.", "info");
