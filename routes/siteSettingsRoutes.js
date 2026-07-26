const express = require("express");

const router = express.Router();

const { protect } = require("../middlewares/authMiddleware");

const {
  getSettings,
  updateSettings,
} = require("../controllers/siteSettingsController");

// GET SETTINGS
router.get("/", protect, getSettings);

// UPDATE SETTINGS
router.put("/", protect, updateSettings);

module.exports = router;