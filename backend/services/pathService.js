const fs = require("fs");
const path = require("path");

let pathCoordinates = [];
let currentIndex = 0;
let pickupPoint = null;
let dropoffPoint = null;

function loadGeoPath() {
  const filePath = path.join(__dirname, "../data/junction.geojson");

  const geoData = JSON.parse(
    fs.readFileSync(filePath, "utf-8")
  );

  const lineFeatures = geoData.features.filter(
    f => f.geometry.type === "LineString"
  );

  if (lineFeatures.length === 0) {
    throw new Error("No LineString found in GeoJSON");
  }

  // Combine all LineString features for complete route coverage
  pathCoordinates = [];
  lineFeatures.forEach(lineFeature => {
    const coords = lineFeature.geometry.coordinates.map(coord => ({
      lat: coord[1],
      lng: coord[0]
    }));
    pathCoordinates = pathCoordinates.concat(coords);
  });

  // Extract pickup and drop-off points from Point features
  const pointFeatures = geoData.features.filter(
    f => f.geometry.type === "Point"
  );

  if (pointFeatures.length >= 2) {
    pickupPoint = {
      lat: pointFeatures[0].geometry.coordinates[1],
      lng: pointFeatures[0].geometry.coordinates[0]
    };
    dropoffPoint = {
      lat: pointFeatures[1].geometry.coordinates[1],
      lng: pointFeatures[1].geometry.coordinates[0]
    };
  }

  currentIndex = 0;

  console.log("🗺️ Path loaded:", pathCoordinates.length, "points from", lineFeatures.length, "LineString(s)");
  console.log("📍 Pickup:", pickupPoint);
  console.log("🏥 Drop-off:", dropoffPoint);
}

function getNextPoint() {
  if (currentIndex >= pathCoordinates.length) {
    return null;
  }

  const point = pathCoordinates[currentIndex];
  currentIndex++;

  return point;
}

function resetPath() {
  currentIndex = 0;
}

function getPickupPoint() {
  return pickupPoint;
}

function getDropoffPoint() {
  return dropoffPoint;
}

function getAllPathCoordinates() {
  return pathCoordinates;
}

module.exports = {
  loadGeoPath,
  getNextPoint,
  resetPath,
  getPickupPoint,
  getDropoffPoint,
  getAllPathCoordinates
};
