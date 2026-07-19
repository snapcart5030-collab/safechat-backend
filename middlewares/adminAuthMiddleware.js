const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const protectAdmin = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if it's an admin token
      if (!decoded.role || decoded.role !== "admin") {
        return res.status(401).json({
          success: false,
          message: "Not authorized as admin",
        });
      }

      const admin = await Admin.findById(decoded.id).select("-password");

      if (!admin) {
        return res.status(401).json({
          success: false,
          message: "Admin not found",
        });
      }

      if (admin.isSuspended) {
        return res.status(403).json({
          success: false,
          message: "Admin account has been suspended",
        });
      }

      req.admin = admin;
      next();
    } catch (error) {
      console.error("Admin Auth Middleware Error:", error);
      return res.status(401).json({
        success: false,
        message: "Not authorized, token failed",
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, no token",
    });
  }
};

module.exports = { protectAdmin };