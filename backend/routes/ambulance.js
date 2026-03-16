const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { handleJunction } = require("../services/junctionService");
const {
  activatePhase1,
  activatePhase2,
  activatePhase3,
  resetSignals
} = require("../services/signalService");
const {
  startNormalLoop,
  stopNormalLoop
} = require("../services/adaptiveTrafficService");

const SIGNALS = {
  signal_1: { lat: 12.888731712227013, lon: 77.64011689150817 },
  signal_2: { lat: 12.862462929201314, lon: 77.6654166943652 }
};

const TRIGGER_DISTANCE_M = 200;
const PASS_DISTANCE_M = 20;
const BOTH_GREEN_HOLD_MS = 2000;

const corridorStateByAmbulance = {};
const pendingPhaseTimers = {};

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(dLambda / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const ONE_KM = 1000; // meters
global.notifiedUsers = global.notifiedUsers || {};

router.post("/location", async (req, res) => {
  const { lat, lng, speed } = req.body;

  // Broadcast live ambulance location
  global.io.emit("ambulanceUpdate", { lat, lng });

  if (!global.emergencyActive) {
    return res.json({ message: "Monitoring inactive" });
  }

  const users = await User.aggregate([
    {
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [lng, lat],
        },
        distanceField: "distance",
        spherical: true,
      },
    },
  ]);

  for (let user of users) {
    const eta = speed > 0 ? user.distance / speed : 9999;

    // Emit distance updates (optional)
    global.io.emit("distanceUpdate", {
      userId: user.userId,
      distance: user.distance,
      eta: eta.toFixed(1),
    });

    // 🚑 1km Trigger
    if (user.distance <= ONE_KM && !global.notifiedUsers[user.userId]) {
      global.io.emit("ambulanceNearby", {
        userId: user.userId,
        distance: user.distance,
        message: "🚨 Ambulance is 1km away. Clear a path!",
      });

      global.notifiedUsers[user.userId] = true;
    }

    // Junction control (ETA-based)
    if (eta <= 10) {
      await handleJunction(lat, eta);
    }
  }

  res.json({ message: "Processed" });
});

router.post("/update", async (req, res) => {
  const { ambulance_id, ambulance_lat, ambulance_lon } = req.body;

  if (!global.emergencyActive) {
    return res.json({ status: "inactive" });
  }

  if (!ambulance_id || ambulance_lat == null || ambulance_lon == null) {
    return res.status(400).json({ error: "ambulance_id, ambulance_lat, ambulance_lon required" });
  }

  try {
    const state = corridorStateByAmbulance[ambulance_id] || {
      stage: "idle",
      lastDist1: Infinity,
      lastDist2: Infinity,
      seen1: false,
      seen2: false
    };

    const dist1 = haversineMeters(
      ambulance_lat,
      ambulance_lon,
      SIGNALS.signal_1.lat,
      SIGNALS.signal_1.lon
    );

    const dist2 = haversineMeters(
      ambulance_lat,
      ambulance_lon,
      SIGNALS.signal_2.lat,
      SIGNALS.signal_2.lon
    );

    if (state.stage === "idle" && dist1 <= TRIGGER_DISTANCE_M) {
      stopNormalLoop();
      await activatePhase1();
      state.stage = "approaching1";
    }

    if (state.stage === "approaching1") {
      if (dist1 <= PASS_DISTANCE_M) {
        state.seen1 = true;
      }

      if (state.seen1 && dist1 > state.lastDist1) {
        await activatePhase2();

        if (pendingPhaseTimers[ambulance_id]) {
          clearTimeout(pendingPhaseTimers[ambulance_id]);
        }

        pendingPhaseTimers[ambulance_id] = setTimeout(async () => {
          await activatePhase3();
          state.stage = "approaching2";
          pendingPhaseTimers[ambulance_id] = null;
        }, BOTH_GREEN_HOLD_MS);
      }
    }

    if (state.stage === "approaching2") {
      if (dist2 <= PASS_DISTANCE_M) {
        state.seen2 = true;
      }

      if (state.seen2 && dist2 > state.lastDist2) {
        await resetSignals();
        startNormalLoop();
        delete corridorStateByAmbulance[ambulance_id];
        return res.json({ status: "completed" });
      }
    }

    state.lastDist1 = dist1;
    state.lastDist2 = dist2;
    corridorStateByAmbulance[ambulance_id] = state;

    return res.json({
      status: "tracking",
      stage: state.stage,
      distance_to_signal_1: Math.round(dist1),
      distance_to_signal_2: Math.round(dist2)
    });
  } catch (error) {
    console.error("❌ Failed to process emergency update:", error.message);
    res.status(500).json({ error: "Failed to process emergency update" });
  }
});

module.exports = router;