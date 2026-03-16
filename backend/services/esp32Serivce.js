const { SerialPort } = require("serialport");

const port = new SerialPort({
  path: process.env.ESP32_PORT || "COM9",
  baudRate: 115200
});

port.on("open", () => {
  console.log("✅ ESP32 Serial Connected");
});

port.on("error", (err) => {
  console.error("❌ Serial Error:", err.message);
});

function sendToESP(command) {
  const message = command + "\n";
  port.write(message);
  console.log("📤 Sent to ESP:", message);
}

module.exports = { sendToESP };
