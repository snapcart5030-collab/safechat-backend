const bcrypt = require("bcryptjs");
const User = require("../models/User");

const createDefaultAdmin = async () => {
  try {
    const adminEmail = "admin@safechat.com";
    const adminPassword = "Admin@123";

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log("✅ Default admin already exists");
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Create admin
    const admin = await User.create({
      name: "SafeChat Admin",
      email: adminEmail,
      password: hashedPassword,
      picture: "https://ui-avatars.com/api/?name=Admin&background=8B1FF8&color=fff&size=128",
      role: "admin",
      adminRequest: {
        status: "approved",
        requestedAt: new Date(),
        reviewedAt: new Date(),
      },
      bio: "SafeChat Administrator",
    });

    console.log("✅ Default admin created!");
    console.log(`📧 Email: ${adminEmail}`);
    console.log(`🔑 Password: ${adminPassword}`);
  } catch (error) {
    console.error("❌ Error creating default admin:", error.message);
  }
};

module.exports = createDefaultAdmin;