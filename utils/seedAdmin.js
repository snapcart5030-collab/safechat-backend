const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");

async function seedDefaultAdmin() {
  const email = process.env.DEFAULT_ADMIN_EMAIL || "admin@safechat.app";
  const password = process.env.DEFAULT_ADMIN_PASSWORD || "Admin@123";

  console.log("🔍 Checking for existing admin...");
  const existing = await Admin.findOne({});
  if (existing) {
    console.log("✅ Admin already exists:", existing.email);
    return;
  }

  console.log("🆕 Creating default admin...");
  const hashed = await bcrypt.hash(password, 10);
  await Admin.create({ name: "Admin", email, password: hashed, role: "superadmin" });

  console.log(`✅ Default admin created -> ${email} / ${password} (change this after first login)`);
}

module.exports = seedDefaultAdmin;