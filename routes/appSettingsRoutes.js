const express = require("express");
const {
  getSettings,
  updateHeaderColor,
} = require("../controllers/appSettingsController");

const router = express.Router();

router.get("/", getSettings);
router.put("/header-color", updateHeaderColor);

module.exports = router;