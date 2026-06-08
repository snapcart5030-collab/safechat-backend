const express = require("express");

const router = express.Router();

const {
  getNotifications,
   markNotificationsRead,
} = require(
  "../controllers/notificationController"
);

// Get all notifications of user
router.get(
  "/:userId",
  getNotifications
);
router.post(
  "/mark-read",
  markNotificationsRead
);

module.exports = router;