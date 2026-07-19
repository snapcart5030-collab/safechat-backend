const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

// ========== ADMIN REGISTER ==========
exports.adminRegister = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    // Check if admin exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: "Admin already exists with this email",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin
    const admin = await Admin.create({
      name,
      email,
      password: hashedPassword,
      picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=8B1FF8&color=fff&size=128`,
    });

    // Generate token
    const token = jwt.sign(
      { id: admin._id, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      success: true,
      token,
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        picture: admin.picture,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Admin Register Error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ========== ADMIN LOGIN ==========
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find admin
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if suspended
    if (admin.isSuspended) {
      return res.status(403).json({
        success: false,
        message: "Admin account has been suspended",
      });
    }

    // Update last login
    admin.lastLogin = new Date();
    await admin.save();

    // Generate token
    const token = jwt.sign(
      { id: admin._id, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        picture: admin.picture,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Admin Login Error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ========== GET CURRENT ADMIN ==========
exports.getCurrentAdmin = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin._id).select("-password");
    res.json({
      success: true,
      admin,
    });
  } catch (error) {
    console.error("Get Admin Error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ========== UPDATE ADMIN PROFILE ==========
exports.updateAdminProfile = async (req, res) => {
  try {
    const { name, picture } = req.body;
    const adminId = req.admin._id;

    const updateData = {};
    if (name) updateData.name = name;
    if (picture) updateData.picture = picture;

    const admin = await Admin.findByIdAndUpdate(
      adminId,
      updateData,
      { new: true }
    ).select("-password");

    res.json({
      success: true,
      admin,
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("Update Admin Error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};