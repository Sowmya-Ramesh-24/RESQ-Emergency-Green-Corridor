const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Junction = require("../models/Junction");
const { handleJunction } = require("../services/junctionService");
const { loadGeoPath, getNextPoint, resetPath, getPickupPoint, getDropoffPoint } = require("../services/pathService");
const { sendToESP } = require("../services/esp32Serivce");
const { resetSignals, emitCurrentSignals } = require("../services/signalService");
const fs = require("fs");
const path = require("path");

// Store interval globally so we can clear it
let simulationInterval = null;
let userSimulationInterval = null;

// Store current positions for distance calculation
global.currentAmbulancePos = null;
global.currentUserPos = null;
global.userPaused = false;
global.notifiedAt1km = false;
global.ambulanceCrossed = false;
global.previousDistance = Infinity;
global.closestDistance = Infinity; // Track minimum distance for crossing detection
global.hasBeenClose = false; // Track if ambulance got within 50m

// Calculate distance between two points (in meters)
function calculateDistance(pos1, pos2) {
  if (!pos1 || !pos2) return Infinity;
  
  const R = 6371e3; // Earth's radius in meters
  const φ1 = pos1.lat * Math.PI / 180;
  const φ2 = pos2.lat * Math.PI / 180;
  const Δφ = (pos2.lat - pos1.lat) * Math.PI / 180;
  const Δλ = (pos2.lng - pos1.lng) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
}

router.post("/start", async (req, res) => {

  console.log("🚀 Starting simulation...");
  console.log("Emergency active:", global.emergencyActive);

  // Clear any existing simulation
  if (simulationInterval) {
    clearInterval(simulationInterval);
    console.log("⏹️ Cleared existing simulation");
  }

  // Load path from geojson
  try {
    loadGeoPath();
  } catch (error) {
    console.error("❌ Error loading geojson:", error.message);
    return res.status(500).json({ error: "Failed to load geojson" });
  }

  resetPath();

  // Reset global flags
  global.notifiedAt1km = false;
  global.userPaused = false;
  global.ambulanceCrossed = false;
  global.previousDistance = Infinity;

  // Reset all signals to RED and emit initial state
  await resetSignals();
  console.log("🚦 All signals initialized to RED");

  // Reset junction to phase 0
  let junction = await Junction.findOne({ name: "J1" });
  if (!junction) {
    junction = new Junction({ name: "J1", phase: 0, corridorActive: false, phaseStartTime: 0 });
    await junction.save();
    console.log("🚦 Junction J1 created");
  } else {
    junction.phase = 0;
    junction.corridorActive = false;
    junction.phaseStartTime = 0;
    await junction.save();
    console.log("🚦 Junction J1 reset to phase 0");
  }

  // Get pickup and drop-off points from geojson
  const pickupPoint = getPickupPoint();
  const dropoffPoint = getDropoffPoint();

  if (!pickupPoint || !dropoffPoint) {
    console.error("❌ Pickup or drop-off point not found in geojson");
    return res.status(400).json({ error: "Missing pickup or drop-off points in geojson" });
  }

  console.log(`📍 Route: Pickup (${pickupPoint.lat}, ${pickupPoint.lng}) → Drop-off (${dropoffPoint.lat}, ${dropoffPoint.lng})`);

  let stepCount = 0;

  simulationInterval = setInterval(async () => {

    const nextPoint = getNextPoint();
    if (!nextPoint) {
      clearInterval(simulationInterval);
      simulationInterval = null;
      console.log("✅ Simulation complete - Destination reached!");
      return;
    }

    const currentLat = nextPoint.lat;
    const currentLng = nextPoint.lng;
    stepCount++;

    // Store current ambulance position
    global.currentAmbulancePos = { lat: currentLat, lng: currentLng };

    console.log(`📍 Step ${stepCount} - Lat: ${currentLat.toFixed(6)}, Lng: ${currentLng.toFixed(6)}`);

    // Check distance to user and emit notifications
    if (global.currentUserPos && !global.ambulanceCrossed) {
      const distance = calculateDistance(global.currentAmbulancePos, global.currentUserPos);
      
      // 1km notification (once)
      if (distance <= 1000 && !global.notifiedAt1km) {
        global.notifiedAt1km = true;
        global.io.emit("ambulanceNearby", {
          distance: distance,
          message: "🚨 Ambulance is 1km away. Clear a path!"
        });
        console.log(`🚨 1km notification sent - Distance: ${distance.toFixed(0)}m`);
      }

      // Pause user when ambulance is couple of meters away (20m)
      if (distance <= 20 && !global.userPaused) {
        global.userPaused = true;
        global.io.emit("userPaused", {
          distance: distance,
          message: "🚨 CLEAR THE WAY! Ambulance passing!"
        });
        console.log(`⏸️ User paused - Ambulance within ${distance.toFixed(0)}m - CLEAR THE WAY!`);
        
        // Resume user after ambulance passes (1.5 seconds to let it fully pass)
        setTimeout(() => {
          global.userPaused = false;
          global.io.emit("userResumed", {
            message: "✅ Ambulance passed. Safe to continue."
          });
          console.log(`▶️ User resumed - Ambulance passed`);
        }, 1500);
      }

      // Track closest distance during approach
      if (distance < global.closestDistance) {
        global.closestDistance = distance;
      }
      
      // Mark when ambulance gets very close (within 50m)
      if (distance <= 50) {
        global.hasBeenClose = true;
      }

      // Detect when ambulance has crossed (only after getting within 50m & now moving away)
      if (global.notifiedAt1km && !global.ambulanceCrossed && global.hasBeenClose && distance > global.closestDistance && distance > 100) {
        global.ambulanceCrossed = true;
        global.io.emit("ambulanceCrossed", {
          message: "✅ Ambulance has safely passed. Continue safely."
        });
        console.log(`✅ Ambulance crossed user - Was closest: ${global.closestDistance.toFixed(0)}m, now: ${distance.toFixed(0)}m`);
      }

      global.previousDistance = distance;
    }

    global.io.emit("ambulanceUpdate", { lat: currentLat, lng: currentLng });

    // Send current coordinates to ESP32
    sendToESP({ lat: currentLat, lng: currentLng });

    // Call time-based junction handler
    await handleJunction(currentLat);

    const users = await User.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [currentLng, currentLat]
          },
          distanceField: "distance",
          spherical: true
        }
      }
    ]);

    for (let user of users) {
      const eta = user.distance / 0.5;

      if (eta <= 10 && !global.junctionTriggered) {

        console.log("🚦 Triggering Junction via ETA");

        global.junctionTriggered = true;

        await handleJunction(currentLat);

        global.io.emit("driverAlert", {
          userId: user.userId,
          distance: user.distance.toFixed(1),
          eta: eta.toFixed(1)
        });
      }
    }

  }, 500); // 500ms interval per path point (faster ambulance)

  // Emit the complete path to the frontend for visualization
  const { getAllPathCoordinates } = require("../services/pathService");
  global.io.emit("routePath", {
    path: getAllPathCoordinates(),
    pickup: pickupPoint,
    dropoff: dropoffPoint
  });

  res.json({ 
    message: "Simulation started", 
    route: { 
      pickup: pickupPoint, 
      dropoff: dropoffPoint,
      pathPoints: getAllPathCoordinates().length 
    } 
  });
});

router.post("/stop", (req, res) => {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
    global.notifiedAt1km = false;
    global.userPaused = false;
    global.ambulanceCrossed = false;
    global.previousDistance = Infinity;
    global.closestDistance = Infinity;
    global.hasBeenClose = false;
    console.log("⏹️ Simulation stopped");
    res.json({ message: "Simulation stopped" });
  } else {
    res.json({ message: "No simulation running" });
  }
});

// User simulation endpoints
router.post("/user/start", async (req, res) => {
  console.log("🚀 Starting user simulation...");

  // Clear any existing user simulation
  if (userSimulationInterval) {
    clearInterval(userSimulationInterval);
    console.log("⏹️ Cleared existing user simulation");
  }

  // Reset global flags
  global.notifiedAt1km = false;
  global.userPaused = false;
  global.ambulanceCrossed = false;
  global.previousDistance = Infinity;
  global.closestDistance = Infinity;
  global.hasBeenClose = false;

  // Load user path from user.geojson
  let userPathCoordinates = [];
  let userStart = null;
  let userDestination = null;

  try {
    const userGeoPath = path.join(__dirname, "../data/user.geojson");
    const userGeoData = JSON.parse(fs.readFileSync(userGeoPath, "utf-8"));

    // Find LineString for the path
    const lineFeature = userGeoData.features.find(
      f => f.geometry.type === "LineString"
    );

    if (lineFeature) {
      userPathCoordinates = lineFeature.geometry.coordinates.map(coord => ({
        lat: coord[1],
        lng: coord[0]
      }));
    }

    // Find Point features for start and destination
    const pointFeatures = userGeoData.features.filter(
      f => f.geometry.type === "Point"
    );

    if (pointFeatures.length >= 2) {
      userStart = {
        lat: pointFeatures[0].geometry.coordinates[1],
        lng: pointFeatures[0].geometry.coordinates[0]
      };
      userDestination = {
        lat: pointFeatures[1].geometry.coordinates[1],
        lng: pointFeatures[1].geometry.coordinates[0]
      };
    }

    console.log(`📍 User Route: Start (${userStart.lat}, ${userStart.lng}) → Destination (${userDestination.lat}, ${userDestination.lng})`);
    console.log(`🗺️ User path loaded: ${userPathCoordinates.length} points`);

  } catch (error) {
    console.error("❌ Error loading user.geojson:", error.message);
    return res.status(500).json({ error: "Failed to load user geojson" });
  }

  if (userPathCoordinates.length === 0) {
    return res.status(400).json({ error: "No path found in user.geojson" });
  }

  let userStepCount = 0;
  let currentUserIndex = 0;

  // Emit the complete user path to the frontend immediately
  global.io.emit("userRoutePath", {
    path: userPathCoordinates,
    start: userStart,
    destination: userDestination
  });

  // Emit initial location immediately
  if (userPathCoordinates.length > 0) {
    global.currentUserPos = { 
      lat: userPathCoordinates[0].lat, 
      lng: userPathCoordinates[0].lng 
    };
    global.io.emit("userLocationUpdate", global.currentUserPos);
    currentUserIndex = 1; // Start from second point since we already emitted first
    userStepCount = 1;
  }

  userSimulationInterval = setInterval(() => {
    // Skip movement if user is paused
    if (global.userPaused) {
      console.log(`⏸️ User movement paused (waiting for ambulance to pass)`);
      return;
    }

    if (currentUserIndex >= userPathCoordinates.length) {
      clearInterval(userSimulationInterval);
      userSimulationInterval = null;
      console.log("✅ User simulation complete - Destination reached!");
      global.io.emit("userSimulationComplete");
      return;
    }

    const currentPoint = userPathCoordinates[currentUserIndex];
    userStepCount++;

    // Store current user position
    global.currentUserPos = { 
      lat: currentPoint.lat, 
      lng: currentPoint.lng 
    };

    console.log(`👤 User Step ${userStepCount} - Lat: ${currentPoint.lat.toFixed(6)}, Lng: ${currentPoint.lng.toFixed(6)}`);

    // Emit user location update to frontend
    global.io.emit("userLocationUpdate", global.currentUserPos);

    currentUserIndex++;

  }, 1300); // 1300ms interval per path point (slightly faster user speed)

  res.json({ 
    message: "User simulation started", 
    route: { 
      start: userStart, 
      destination: userDestination,
      pathPoints: userPathCoordinates.length 
    } 
  });
});

router.post("/user/stop", (req, res) => {
  if (userSimulationInterval) {
    clearInterval(userSimulationInterval);
    userSimulationInterval = null;
    console.log("⏹️ User simulation stopped");
    res.json({ message: "User simulation stopped" });
  } else {
    res.json({ message: "No user simulation running" });
  }
});

module.exports = router;
