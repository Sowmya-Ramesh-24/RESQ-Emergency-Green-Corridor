const mongoose = require("mongoose");

const junctionSchema = new mongoose.Schema({
  name: String,
  corridorActive: Boolean,
  phase: {
    type: Number,
    default: 0
  },
  phaseStartTime: {
    type: Number,
    default: 0
  },
  cooledDownAt: {
    type: Number,
    default: 0
  }
});

module.exports = mongoose.model("Junction", junctionSchema);

