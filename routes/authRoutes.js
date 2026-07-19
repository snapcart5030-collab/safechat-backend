const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const {
  googleLogin,
  register,
  login,
  getMe,
} = require("../controllers/authController");

// Email/Password Routes
router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getMe);

// Google Login (Keep existing)
router.post("/google-login", googleLogin);

module.exports = router;