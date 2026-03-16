const express = require("express");
const router = express.Router();
const path = require("path");

// Store active emergencies
global.activeEmergencies = global.activeEmergencies || {};

router.post("/start", (req, res) => {
  global.emergencyActive = true;
  res.json({ message: "Emergency started" });
});

router.post("/stop", (req, res) => {
  global.emergencyActive = false;
  global.notifiedUsers = {};  // reset 1km notifications
  res.json({ message: "Emergency stopped" });
});

// New endpoint: User requests ambulance
router.post("/request", (req, res) => {
  try {
    const { userLat, userLng, destination } = req.body;
    
    // Generate emergency ID
    const emergencyId = `EMG-${Date.now()}`;
    
    // Store emergency
    global.activeEmergencies[emergencyId] = {
      id: emergencyId,
      userLat,
      userLng,
      destination,
      status: "searching",
      createdAt: new Date(),
    };
    
    console.log(`[Emergency] Request created: ${emergencyId} at (${userLat}, ${userLng})`);
    
    // Broadcast to ambulance drivers via Socket.io
    if (global.io) {
      global.io.emit("emergencyRequest", {
        emergencyId,
        userLat,
        userLng,
        destination,
      });
    }
    
    res.json({
      emergencyId,
      message: "Emergency request received",
      status: "searching",
    });
  } catch (error) {
    console.error("Error requesting ambulance:", error);
    res.status(500).json({ error: "Failed to request ambulance" });
  }
});

// New endpoint: Cancel emergency
router.post("/cancel/:emergencyId", (req, res) => {
  try {
    const { emergencyId } = req.params;
    
    if (global.activeEmergencies[emergencyId]) {
      delete global.activeEmergencies[emergencyId];
      console.log(`[Emergency] Cancelled: ${emergencyId}`);
      
      // Broadcast cancellation via Socket.io
      if (global.io) {
        global.io.emit("emergencyCancelled", { emergencyId });
      }
      
      res.json({ message: "Emergency cancelled" });
    } else {
      res.status(404).json({ error: "Emergency not found" });
    }
  } catch (error) {
    console.error("Error cancelling emergency:", error);
    res.status(500).json({ error: "Failed to cancel emergency" });
  }
});

// Get emergency details
router.get("/:emergencyId", (req, res) => {
  try {
    const { emergencyId } = req.params;
    const emergency = global.activeEmergencies[emergencyId];
    
    if (emergency) {
      res.json(emergency);
    } else {
      res.status(404).json({ error: "Emergency not found" });
    }
  } catch (error) {
    console.error("Error fetching emergency:", error);
    res.status(500).json({ error: "Failed to fetch emergency" });
  }
});

module.exports = router;
