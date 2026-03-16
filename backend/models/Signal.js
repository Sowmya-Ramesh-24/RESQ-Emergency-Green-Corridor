const mongoose = require("mongoose");

const signalSchema = new mongoose.Schema({
  name: String,
  state: {
    type: String,
    enum: ["RED", "GREEN"],
    default: "RED"
  }
});

module.exports = mongoose.model("Signal", signalSchema);
