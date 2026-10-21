require('dotenv').config();

const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const connectDB = require('../config/db');

const createAdmin = async () => {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD in backend/.env first.');
  }

  if (ADMIN_PASSWORD.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters long.');
  }

  await connectDB();

  const email = ADMIN_EMAIL.toLowerCase().trim();
  const existingAdmin = await Admin.findOne({ email });

  if (existingAdmin) {
    const credentialsMatch = await existingAdmin.matchPassword(ADMIN_PASSWORD);
    if (!credentialsMatch) {
      throw new Error(`An admin account already exists for ${email}, but the configured password does not match. No changes were made.`);
    }

    console.log(`Admin account already exists for ${email}. No duplicate created.`);
    return;
  }

  const admin = await Admin.create({
    name: ADMIN_NAME.trim(),
    email,
    password: ADMIN_PASSWORD,
  });

  console.log(`Admin account created for ${admin.email}.`);
};

createAdmin()
  .catch((error) => {
    console.error(`Admin setup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });