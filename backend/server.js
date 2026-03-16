const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const socketIO = require("socket.io");

const userRoutes = require("./routes/user");
const ambulanceRoutes = require("./routes/ambulance");
const emergencyRoutes = require("./routes/emergency");
const simulateRoutes = require("./routes/simulate");
const {
  startNormalLoop,
  startEmergencyLoop,
  stopEmergencyLoop
} = require("./services/adaptiveTrafficService");

const app = express();

// ✅ Allow BOTH frontends
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:5174"
  ],
  credentials: true
}));

app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

const server = http.createServer(app);

// ✅ Proper v2 socket setup
const io = socketIO(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:5174"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

global.io = io;
global.emergencyActive = false;

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("sosActivated", (data) => {
    console.log("🚨 Ambulance SOS activated at:", data);

    global.emergencyActive = true;

    const ambulanceId = data?.ambulance_id || data?.id || "AMB-1";
    const ambulanceLat = data?.ambulance_lat ?? data?.lat ?? global.currentAmbulancePos?.lat;
    const ambulanceLon = data?.ambulance_lon ?? data?.lng ?? global.currentAmbulancePos?.lng;

    if (ambulanceLat == null || ambulanceLon == null) {
      console.error("❌ Missing ambulance coordinates for emergency call");
    } else {
      startEmergencyLoop({
        ambulance_id: ambulanceId,
        ambulance_lat: ambulanceLat,
        ambulance_lon: ambulanceLon
      });
    }

    io.emit("emergencyStarted", data);
  });

  socket.on("sosCancelled", () => {
    console.log("🛑 Ambulance SOS cancelled");

    global.emergencyActive = false;
    stopEmergencyLoop();
    startNormalLoop();

    io.emit("emergencyCancelled");
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

app.use("/user", userRoutes);
app.use("/ambulance", ambulanceRoutes);
app.use("/emergency", emergencyRoutes);
app.use("/simulate", simulateRoutes);

server.listen(process.env.PORT || 5000, () => {
  console.log("Server running on port 5000");
  startNormalLoop();
});