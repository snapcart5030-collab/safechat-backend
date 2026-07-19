// create-admin.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('./models/Admin');

const createAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const email = process.env.DEFAULT_ADMIN_EMAIL || 'admin@safechat.app';
    const password = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123';

    // Check if admin exists
    const existing = await Admin.findOne({ email });
    if (existing) {
      console.log('✅ Admin already exists:', existing.email);
      process.exit(0);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin
    const admin = await Admin.create({
      name: 'Super Admin',
      email: email,
      password: hashedPassword,
      role: 'superadmin',
    });

    console.log('✅ Admin created successfully!');
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Password: ${password}`);
    console.log(`🆔 Admin ID: ${admin._id}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    process.exit(1);
  }
};

createAdmin();