const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const { requireAdmin } = require("../middlewares/adminMiddleware");
const admin = require("../controllers/adminController");

const router = express.Router();
router.use(protect);
router.get("/access", admin.getMyAccess);
router.post("/access/request", admin.requestAccess);
router.use(requireAdmin);
router.get("/dashboard", admin.dashboard);
router.get("/users", admin.listUsers);
router.get("/requests", admin.listRequests);
router.patch("/requests/:userId", admin.reviewRequest);
router.put("/settings", admin.updateSettings);
module.exports = router;
