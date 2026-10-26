require('dotenv').config();

const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const { pool } = require('../config/db');

const createAdmin = async () => {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD in backend/.env first.');
  }

  if (ADMIN_PASSWORD.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters long.');
  }

  await connectDB();

  const email = ADMIN_EMAIL.toLowerCase().trim();
  const { rows } = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
  const existingAdmin = rows[0];

  if (existingAdmin) {
    const credentialsMatch = await bcrypt.compare(ADMIN_PASSWORD, existingAdmin.password);
    if (!credentialsMatch) {
      throw new Error(`An admin account already exists for ${email}, but the configured password does not match. No changes were made.`);
    }

    console.log(`Admin account already exists for ${email}. No duplicate created.`);
    return;
  }

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await pool.query('INSERT INTO admins (name, email, password) VALUES ($1, $2, $3)', [ADMIN_NAME.trim(), email, hash]);

  console.log(`Admin account created for ${email}.`);
};

createAdmin()
  .catch((error) => {
    console.error(`Admin setup failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
