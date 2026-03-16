/**
 * ML Service - Calls Python Flask ML model for traffic signal phase prediction
 * Uses only signal timings (lat, phase, time)
 */

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:5001";

async function predictNextPhase(ambulanceLat, currentPhase, phaseStartTime) {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/predict-phase`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ambulanceLat,
        currentPhase,
        phaseStartTime
      })
    });

    if (!response.ok) {
      console.error(`❌ ML Service error: ${response.status}`);
      return null;
    }

    const result = await response.json();
    console.log(`🤖 ML Prediction - Phase: ${result.nextPhase}, Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    
    return result.nextPhase;
  } catch (error) {
    console.error("❌ ML Service connection failed:", error.message);
    return null; // Fallback to rule-based logic
  }
}

async function getGreenTimes() {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });

    if (!response.ok) {
      console.error(`❌ ML Service error fetching green times: ${response.status}`);
      return null;
    }

    const greenTimes = await response.json();
    console.log(`🚦 ML Green Times:`, greenTimes);
    
    return greenTimes;
  } catch (error) {
    console.error("❌ Failed to fetch green times:", error.message);
    return null;
  }
}

async function checkMLHealth() {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/health`);
    const data = await response.json();
    console.log(`✅ ML Service Status:`, data);
    return data.model_loaded;
  } catch (error) {
    console.error("❌ ML Service not available:", error.message);
    return false;
  }
}

module.exports = { predictNextPhase, getGreenTimes, checkMLHealth };
