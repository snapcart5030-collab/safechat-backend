const express = require("express");
const router = express.Router();
const { protectAdmin } = require("../middlewares/adminAuthMiddleware");
const {
  adminRegister,
  adminLogin,
  getCurrentAdmin,
  updateAdminProfile,
} = require("../controllers/adminAuthController");

// Public Routes
router.post("/register", adminRegister);
router.post("/login", adminLogin);

// Protected Routes
router.get("/me", protectAdmin, getCurrentAdmin);
router.put("/profile", protectAdmin, updateAdminProfile);

module.exports = router;