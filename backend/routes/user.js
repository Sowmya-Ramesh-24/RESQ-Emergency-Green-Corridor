const express = require("express");
const router = express.Router();
const User = require("../models/User");
const fs = require("fs");
const path = require("path");

router.post("/location", async (req, res) => {

  const { userId, lat, lng } = req.body;

  await User.findOneAndUpdate(
    { userId },
    {
      userId,
      location: {
        type: "Point",
        coordinates: [lng, lat]
      }
    },
    { upsert: true }
  );

  res.json({ message: "User location updated" });
});

router.get("/path", (req, res) => {
  try {
    const geojsonPath = path.join(__dirname, "../data/user.geojson");
    const geojsonData = JSON.parse(fs.readFileSync(geojsonPath, "utf8"));
    res.json(geojsonData);
  } catch (error) {
    console.error("Error reading user.geojson:", error);
    res.status(500).json({ error: "Failed to load path data" });
  }
});

module.exports = router;
