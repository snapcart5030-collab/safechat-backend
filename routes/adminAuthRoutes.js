const express = require("express");
const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");
const { generateAdminToken } = require("../utils/generateToken");
const { protectAdmin } = require("../middlewares/adminAuthMiddleware");

const router = express.Router();

// Admin login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("🔐 Login attempt:", { email, passwordProvided: !!password });
    
    const admin = await Admin.findOne({ email: email?.toLowerCase() }).select("+password");
    console.log("👤 Admin found:", admin ? "YES" : "NO");
    console.log("📧 Admin email:", admin?.email);
    
    if (!admin) {
      console.log("❌ Admin not found in database");
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const match = await bcrypt.compare(password, admin.password);
    console.log("🔑 Password match:", match ? "YES" : "NO");
    
    if (!match) {
      console.log("❌ Password does not match");
      return res.status(401).json({ message: "Invalid email or password" });
    }

    console.log("✅ Login successful!");
    const token = admin.email;
    res.json({
      token,
      admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role },
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Login failed", error: err.message });
  }
});

// Current admin
router.get("/me", protectAdmin, async (req, res) => {
  res.json({ admin: req.admin });
});

// Create an additional admin account — open / public registration
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password are required" });

    const existing = await Admin.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: "An admin with this email already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const admin = await Admin.create({ name, email, password: hashed, role: role === "superadmin" ? "superadmin" : "admin" });

    res.status(201).json({ admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role } });
  } catch (err) {
    res.status(500).json({ message: "Could not create admin", error: err.message });
  }
});

module.exports = router;
