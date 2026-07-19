// middlewares/adminMiddleware.js

/**
 * Middleware to check if the authenticated user has admin role
 * This middleware should be used after the 'protect' middleware
 * 
 * Usage:
 * router.use(protect);
 * router.use(requireAdmin);
 */

const requireAdmin = (req, res, next) => {
  // Check if user exists (should be set by protect middleware)
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required. Please login first.",
    });
  }

  // Check if user has admin role
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Administrator access is required. You do not have permission to access this resource.",
    });
  }

  // User is admin, proceed to next middleware/route handler
  next();
};

module.exports = { requireAdmin };