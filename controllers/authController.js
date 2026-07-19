const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ========== EMAIL/PASSWORD REGISTER ==========
exports.register = async (req, res) => {
  try {
    const { name, email, password, note } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=8B1FF8&color=fff&size=128`,
      adminRequest: {
        status: "pending",
        note: note || "Requesting admin access",
        requestedAt: new Date(),
      },
    });

    // Generate token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        role: user.role,
        adminRequest: user.adminRequest,
      },
    });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ========== EMAIL/PASSWORD LOGIN ==========
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check password
    if (!user.password) {
      return res.status(401).json({
        success: false,
        message: "Please login with Google",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if suspended
    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        message: "Account has been suspended",
      });
    }

    // Generate token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        role: user.role,
        adminRequest: user.adminRequest,
        isSuspended: user.isSuspended,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ========== GET CURRENT USER ==========
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password -googleId");
    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get Me Error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ========== GOOGLE LOGIN (Keep existing) ==========
exports.googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: "Credential Missing",
      });
    }

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub, email, name, picture } = payload;

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        googleId: sub,
        email,
        name,
        picture,
        language: "en",
        languageSelected: false,
      });
      console.log("New User Saved");
    }

    // Admin Bootstrap
    if (process.env.ADMIN_BOOTSTRAP_EMAIL && email.toLowerCase() === process.env.ADMIN_BOOTSTRAP_EMAIL.toLowerCase() && user.role !== "admin") {
      user.role = "admin";
      user.adminRequest = { status: "approved", reviewedAt: new Date() };
      await user.save();
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      success: true,
      token,
      user,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Google Login Failed",
    });
  }
};