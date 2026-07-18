const mongoose = require("mongoose");

const appSettingsSchema = new mongoose.Schema(
  {
    headerColor: {
      type: String,
      default: "#8B1FF8",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AppSettings", appSettingsSchema);