const axios = require("axios");
const { sendToESP } = require("./esp32Serivce");

const ML_BASE_URL = process.env.ML_SERVICE_URL || "http://localhost:5001";
const NORMAL_INTERVAL_MS = 20000;
const EMERGENCY_POLL_MS = 2000;

let normalIntervalId = null;
let emergencyIntervalId = null;
let emergencyActive = false;
let emergencyProceedScheduled = false;
let lastEmergencyPayload = null;

async function sendNormalTimings() {
  try {
    const response = await axios.get(`${ML_BASE_URL}/predict`);
    const timings = response.data;
    sendToESP(JSON.stringify({ mode: "normal", timings }));
  } catch (error) {
    console.error("❌ Failed to fetch normal timings:", error.message);
  }
}

function startNormalLoop() {
  if (normalIntervalId) return;
  sendNormalTimings();
  normalIntervalId = setInterval(sendNormalTimings, NORMAL_INTERVAL_MS);
}

function stopNormalLoop() {
  if (!normalIntervalId) return;
  clearInterval(normalIntervalId);
  normalIntervalId = null;
}

async function pollEmergency() {
  if (!emergencyActive || !lastEmergencyPayload) return;

  try {
    const response = await axios.post(`${ML_BASE_URL}/emergency`, lastEmergencyPayload);
    const result = response.data;

    if (result.decision === "PROCEED" && !emergencyProceedScheduled) {
      emergencyProceedScheduled = true;
      const direction = result.approach_direction || result.direction;
      sendToESP(JSON.stringify({ mode: "emergency", direction }));
    }

    if (result.queue_length === 0) {
      stopEmergencyLoop();
      startNormalLoop();
    }
  } catch (error) {
    console.error("❌ Failed to poll emergency:", error.message);
  }
}

function startEmergencyLoop(payload) {
  emergencyActive = true;
  emergencyProceedScheduled = false;
  lastEmergencyPayload = payload;

  stopNormalLoop();

  const direction = payload?.direction || payload?.approach_direction || "north";
  if (payload?.useEspLoop) {
    sendToESP(JSON.stringify({ mode: "emergency", direction }));
    return;
  }

  if (emergencyIntervalId) return;
  pollEmergency();
  emergencyIntervalId = setInterval(pollEmergency, EMERGENCY_POLL_MS);
}

function stopEmergencyLoop() {
  emergencyActive = false;
  if (emergencyIntervalId) {
    clearInterval(emergencyIntervalId);
    emergencyIntervalId = null;
  }
  emergencyProceedScheduled = false;
  if (lastEmergencyPayload?.useEspLoop) {
    sendToESP(JSON.stringify({ mode: "normal" }));
  }
}

module.exports = {
  startNormalLoop,
  stopNormalLoop,
  startEmergencyLoop,
  stopEmergencyLoop
};
