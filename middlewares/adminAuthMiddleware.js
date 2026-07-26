const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Admin = require("../models/Admin");

async function protectUser(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ message: "User not found" });
    if (user.status === "banned") return res.status(403).json({ message: "This account has been banned" });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Not authorized, invalid token" });
  }
}

async function protectAdmin(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      console.log("❌ No Bearer token found");
      return res.status(401).json({ 
        success: false,
        message: "Not authorized, no token" 
      });
    }
    
    const token = header.split(" ")[1];
    if (!token) {
      console.log("❌ Token is empty");
      return res.status(401).json({ 
        success: false,
        message: "Not authorized, token empty" 
      });
    }

    console.log("🔐 Verifying admin token...");
    
    // ✅ CORRECT: Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Token decoded:", decoded);
    
    // ✅ CORRECT: Find admin by ID from decoded token
    const admin = await Admin.findById(decoded.id);
    if (!admin) {
      console.log("❌ Admin not found for ID:", decoded.id);
      return res.status(401).json({ 
        success: false,
        message: "Admin not found" 
      });
    }

    console.log("✅ Admin found:", admin.email, "Role:", admin.role, "Status:", admin.status);

    // ✅ Check if admin is approved (superadmin is always approved)
    if (admin.role !== "superadmin" && admin.status !== "approved") {
      console.log("❌ Admin not approved:", admin.status);
      return res.status(403).json({ 
        success: false,
        message: "Your admin account is pending approval or has been rejected." 
      });
    }

    req.admin = admin;
    next();
  } catch (err) {
    console.error("❌ Admin auth error:", err.message);
    return res.status(401).json({ 
      success: false,
      message: "Not authorized, invalid token" 
    });
  }
}

module.exports = { protectUser, protectAdmin };