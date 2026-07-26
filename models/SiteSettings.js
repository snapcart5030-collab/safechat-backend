const mongoose = require("mongoose");

const siteSettingsSchema = new mongoose.Schema(
  {
    globalMaintenance: {
      type: Boolean,
      default: false,
    },

    maintenanceTitle: {
      type: String,
      default: "Website Under Maintenance",
    },

    maintenanceMessage: {
      type: String,
      default:
        "We're improving SafeChat. Please check back later.",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "SiteSettings",
  siteSettingsSchema
);