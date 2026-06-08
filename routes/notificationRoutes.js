const express = require("express");

const router = express.Router();

const {
  getNotifications,
} = require(
  "../controllers/notificationController"
);

// Get all notifications of user
router.get(
  "/:userId",
  getNotifications
);

module.exports = router;