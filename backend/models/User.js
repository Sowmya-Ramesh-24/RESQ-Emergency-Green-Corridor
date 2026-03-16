const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  userId: String,
  location: {
    type: { type: String, enum: ["Point"] },
    coordinates: [Number]
  }
});

userSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("User", userSchema);
