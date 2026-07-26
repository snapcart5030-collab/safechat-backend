const express = require("express");

const router = express.Router();

const {
  getSettings,
  updateSettings,
} = require("../controllers/siteSettingsController");

// GET SETTINGS
router.get("/", getSettings);

// UPDATE SETTINGS
router.put("/", updateSettings);

module.exports = router;