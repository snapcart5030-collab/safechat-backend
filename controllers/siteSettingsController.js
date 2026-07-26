const SiteSettings = require("../models/SiteSettings");

// GET SETTINGS
const getSettings = async (req, res) => {
  try {
    let settings = await SiteSettings.findOne();

    if (!settings) {
      settings = await SiteSettings.create({});
    }

    res.json({
      success: true,
      settings,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// UPDATE SETTINGS
const updateSettings = async (req, res) => {
  try {
    const {
      globalMaintenance,
      maintenanceTitle,
      maintenanceMessage,
    } = req.body;

    let settings = await SiteSettings.findOne();

    if (!settings) {
      settings = await SiteSettings.create({});
    }

    if (globalMaintenance !== undefined)
      settings.globalMaintenance = globalMaintenance;

    if (maintenanceTitle !== undefined)
      settings.maintenanceTitle = maintenanceTitle;

    if (maintenanceMessage !== undefined)
      settings.maintenanceMessage = maintenanceMessage;

    await settings.save();

    res.json({
      success: true,
      settings,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  getSettings,
  updateSettings,
};