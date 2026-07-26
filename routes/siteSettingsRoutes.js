const express = require("express");
const { protectAdmin } = require("../middlewares/adminAuthMiddleware");
const {
  getSettings,
  updateSettings,
} = require("../controllers/siteSettingsController");

const router = express.Router();

// GET SETTINGS - Public (no auth needed)
router.get("/", getSettings);

// UPDATE SETTINGS - Admin only
router.put("/", protectAdmin, updateSettings);

module.exports = router;