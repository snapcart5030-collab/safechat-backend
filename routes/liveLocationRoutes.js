const express = require("express");

const {
  requestLocation,
  acceptLocation,
  rejectLocation,
  stopLocation,
  getActiveLocation,
} = require("../controllers/liveLocationController");

const router = express.Router();

// Send Location Request
router.post("/request", requestLocation);

// Accept Request
router.post("/accept", acceptLocation);

// Reject Request
router.post("/reject", rejectLocation);

// Stop Sharing
router.post("/stop", stopLocation);

// Get Active Live Location
router.get(
  "/active/:senderId/:receiverId",
  getActiveLocation
);

module.exports = router;