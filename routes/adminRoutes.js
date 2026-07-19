const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { requireAdmin } = require("../middlewares/adminMiddleware");
const admin = require("../controllers/adminController");

const router = express.Router();

// All admin routes require authentication and admin role
router.use(protect);
router.use(requireAdmin);

// Admin Routes
router.get("/dashboard", admin.dashboard);
router.get("/users", admin.listUsers);
router.get("/requests", admin.listRequests);
router.patch("/requests/:userId", admin.reviewRequest);
router.patch("/users/:userId/status", admin.updateUserStatus);
router.post("/announcements", admin.announce);
router.put("/settings", admin.updateSettings);

module.exports = router;