const Junction = require("../models/Junction");
const {
  activatePhase1,
  activatePhase2,
  activatePhase3,
  resetSignals
} = require("./signalService");
const { predictNextPhase, getGreenTimes } = require("./mlService");
const { sendToESP } = require("./esp32Serivce");

const MIN_PHASE_DURATION = 6000; // 6 seconds per phase (increased for longer green light)

async function handleJunction(lat) {

  const junction = await Junction.findOne({ name: "J1" });
  if (!junction) return;

  const now = Date.now();

  // Cooldown period: don't trigger phases again for 2 seconds after reset
  const cooldownUntil = junction.cooledDownAt || 0;
  if (now < cooldownUntil) {
    return; // Still in cooldown period
  }

  // Fetch ML timing predictions and send to ESP32
  const greenTimes = await getGreenTimes();
  if (greenTimes) {
    const timingData = `TIMING:${JSON.stringify(greenTimes)}`;
    await sendToESP(timingData);
  }

  // Debug logging
  console.log(`🚦 handleJunction called - Lat: ${lat.toFixed(6)}, Current Phase: ${junction.phase}`);

  // PHASE 1 - Trigger ONLY when lat first crosses 12.878 (and phase is 0)
  if (junction.phase === 0 && lat < 12.878) {

    console.log("✅ PHASE 1 ACTIVATED - South signal GREEN (lat < 12.878)");

    junction.phase = 1;
    junction.phaseStartTime = now;
    junction.corridorActive = true;
    junction.cooledDownAt = 0; // Clear cooldown
    await junction.save();

    await activatePhase1();
  }

  // PHASE 2 - Only trigger when in phase 1, lat < 12.874, AND 6 seconds have passed
  if (
    junction.phase === 1 &&
    lat < 12.874
  ) {
    const timeSincePhase1 = now - junction.phaseStartTime;
    
    if (timeSincePhase1 >= MIN_PHASE_DURATION) {
      // Check ML prediction to confirm phase transition
      console.log(`🤖 Requesting ML prediction for Phase 1→2 transition`);
      const mlPhase = await predictNextPhase(lat, junction.phase, junction.phaseStartTime);
      
      // Send ML prediction to ESP32
      if (mlPhase !== null) {
        await sendToESP(`PHASE${mlPhase}`);
      }
      
      if (mlPhase === 2) {
        console.log(`✅ ML confirmed Phase 2 transition`);
      } else if (mlPhase === null) {
        console.log(`⚠️ ML unavailable, using rule-based transition to Phase 2`);
      } else {
        console.log(`⚠️ ML suggested Phase ${mlPhase}, but rule-based logic expects Phase 2. Proceeding with Phase 2.`);
      }
      
      if (mlPhase === 2 || mlPhase === null) { // Use ML if available, fallback to rule-based
        console.log("✅ PHASE 2 ACTIVATED - South + North GREEN (lat < 12.874)");

        junction.phase = 2;
        junction.phaseStartTime = now;
        await junction.save();

        await activatePhase2();
      }
    }
  }

  // PHASE 3 - Only trigger when in phase 2, lat < 12.870, AND 6 seconds have passed
  if (
    junction.phase === 2 &&
    lat < 12.870
  ) {
    const timeSincePhase2 = now - junction.phaseStartTime;
    
    if (timeSincePhase2 >= MIN_PHASE_DURATION) {
      // Check ML prediction to confirm phase transition
      console.log(`🤖 Requesting ML prediction for Phase 2→3 transition`);
      const mlPhase = await predictNextPhase(lat, junction.phase, junction.phaseStartTime);
      
      // Send ML prediction to ESP32
      if (mlPhase !== null) {
        await sendToESP(`PHASE${mlPhase}`);
      }
      
      if (mlPhase === 3) {
        console.log(`✅ ML confirmed Phase 3 transition`);
      } else if (mlPhase === null) {
        console.log(`⚠️ ML unavailable, using rule-based transition to Phase 3`);
      } else {
        console.log(`⚠️ ML suggested Phase ${mlPhase}, but rule-based logic expects Phase 3. Proceeding with Phase 3.`);
      }
      
      if (mlPhase === 3 || mlPhase === null) { // Use ML if available, fallback to rule-based
        console.log("✅ PHASE 3 ACTIVATED - North GREEN, South RED (lat < 12.870)");

        junction.phase = 3;
        junction.phaseStartTime = now;
        await junction.save();

        await activatePhase3();

        // RESET AFTER 10s - Extended time for ambulance to cross North signal
        setTimeout(async () => {
          console.log("🚦 RESET - All signals RED (after extended North crossing time)");
          await resetSignals();

          junction.phase = 0;
          junction.corridorActive = false;
          junction.cooledDownAt = Date.now() + 2000; // Add 2 second cooldown before next cycle
          await junction.save();
        }, 10000);
      }
    }
  }
}

module.exports = { handleJunction };
