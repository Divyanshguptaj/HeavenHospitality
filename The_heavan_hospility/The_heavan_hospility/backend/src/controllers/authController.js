const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const generateToken = require('../utils/generateToken');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const loginAdmin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const { rows } = await pool.query('SELECT * FROM admins WHERE email = $1', [email.trim().toLowerCase()]);
  const admin = rows[0];

  if (!admin || !(await bcrypt.compare(password, admin.password))) {
    return sendResponse(res, 401, false, 'Invalid credentials');
  }

  return sendResponse(res, 200, true, 'Login successful', {
    _id: admin.id,
    name: admin.name,
    email: admin.email,
    token: generateToken(admin.id),
  });
});

const getAdminProfile = asyncHandler(async (req, res) => {
  return sendResponse(res, 200, true, 'Profile fetched successfully', {
    _id: req.admin._id,
    name: req.admin.name,
    email: req.admin.email,
  });
});

module.exports = { loginAdmin, getAdminProfile };
