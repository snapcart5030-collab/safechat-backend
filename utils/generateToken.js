const jwt = require("jsonwebtoken");

function generateUserToken(user) {
  return jwt.sign({ id: user._id, type: "user" }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

function generateAdminToken(admin) {
  return jwt.sign({ id: admin._id, type: "admin", role: admin.role }, process.env.ADMIN_JWT_SECRET, {
    expiresIn: "7d",
  });
}

module.exports = { generateUserToken, generateAdminToken };
