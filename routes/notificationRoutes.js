const express = require("express");
const { protect } = require("../middlewares/authMiddleware");

const router = express.Router();
router.use(protect);

const {
  getNotifications,
   markNotificationsRead,
} = require(
  "../controllers/notificationController"
);

// Get all notifications of user
router.get(
  "/:userId",
  (req, res, next) => req.params.userId === req.user._id.toString() ? next() : res.status(403).json({ message: "Not authorized" }),
  getNotifications
);
router.post(
  "/mark-read",
  (req, res, next) => { req.body.userId = req.user._id.toString(); next(); },
  markNotificationsRead
);

module.exports = router;
