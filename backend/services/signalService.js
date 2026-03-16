const Signal = require("../models/Signal");
const { sendToESP } = require("../services/esp32Serivce");

/*
  SIGNAL NAMES:

  south
  north
  east
  west
*/

// Emit signal state to frontend (optional)
async function emitCurrentSignals() {
  if (!global.io) return;

  const signals = await Signal.find();
  const payload = {};

  signals.forEach(sig => {
    payload[sig.name] = sig.state;
  });

  global.io.emit("signal-update", payload);

  console.log("📡 Emitted signal state:", payload);
}


// ---------------- PHASE 1 ----------------
// south GREEN, east + west + north RED

async function activatePhase1() {
  await Signal.updateOne({ name: "south" }, { state: "GREEN" });
  await Signal.updateOne({ name: "north" }, { state: "RED" });
  await Signal.updateOne({ name: "east" }, { state: "RED" });
  await Signal.updateOne({ name: "west" }, { state: "RED" });

  console.log("✅ Phase 1 DB updated");

  await sendToESP("PHASE1");
  await emitCurrentSignals();
}


// ---------------- PHASE 2 ----------------
// south + north GREEN, east + west RED

async function activatePhase2() {
  await Signal.updateOne({ name: "south" }, { state: "GREEN" });
  await Signal.updateOne({ name: "north" }, { state: "GREEN" });
  await Signal.updateOne({ name: "east" }, { state: "RED" });
  await Signal.updateOne({ name: "west" }, { state: "RED" });

  console.log("✅ Phase 2 DB updated");

  await sendToESP("PHASE2");
  await emitCurrentSignals();
}


// ---------------- PHASE 3 ----------------
// north GREEN, south + east + west RED

async function activatePhase3() {
  await Signal.updateOne({ name: "south" }, { state: "RED" });
  await Signal.updateOne({ name: "north" }, { state: "GREEN" });
  await Signal.updateOne({ name: "east" }, { state: "RED" });
  await Signal.updateOne({ name: "west" }, { state: "RED" });

  console.log("✅ Phase 3 DB updated");

  await sendToESP("PHASE3");
  await emitCurrentSignals();
}


// ---------------- PHASE 4 ----------------
// east + west GREEN, south + north RED

async function activatePhase4() {
  await Signal.updateOne({ name: "south" }, { state: "RED" });
  await Signal.updateOne({ name: "north" }, { state: "RED" });
  await Signal.updateOne({ name: "east" }, { state: "GREEN" });
  await Signal.updateOne({ name: "west" }, { state: "GREEN" });

  console.log("✅ Phase 4 DB updated");

  await sendToESP("PHASE4");
  await emitCurrentSignals();
}


// ---------------- RESET ----------------
// Everything RED

async function resetSignals() {

  await Signal.updateMany({}, { state: "RED" });

  console.log("✅ All signals reset");

  await sendToESP("PHASE0");
  await emitCurrentSignals();
}


module.exports = {
  activatePhase1,
  activatePhase2,
  activatePhase3,
  activatePhase4,
  resetSignals,
  emitCurrentSignals
};
