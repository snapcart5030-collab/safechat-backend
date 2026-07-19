const bcrypt = require("bcryptjs");
const Admin = require("../models/Admin");

const createDefaultAdmin = async () => {
  try {
    const adminEmail = "admin@safechat.com";
    const adminPassword = "Admin@123";

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log("✅ Default admin already exists");
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Create admin
    const admin = await Admin.create({
      name: "SafeChat Admin",
      email: adminEmail,
      password: hashedPassword,
      picture: "https://ui-avatars.com/api/?name=Admin&background=8B1FF8&color=fff&size=128",
      role: "admin",
    });

    console.log("✅ Default admin created!");
    console.log(`📧 Email: ${adminEmail}`);
    console.log(`🔑 Password: ${adminPassword}`);
  } catch (error) {
    console.error("❌ Error creating default admin:", error.message);
  }
};

module.exports = createDefaultAdmin;