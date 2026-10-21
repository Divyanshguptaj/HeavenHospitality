const Admin = require('../models/Admin');
const generateToken = require('../utils/generateToken');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const loginAdmin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const admin = await Admin.findOne({ email: email.trim().toLowerCase() });

  if (!admin) {
    return sendResponse(res, 401, false, 'Invalid credentials');
  }

  const isMatch = await admin.matchPassword(password);

  if (!isMatch) {
    return sendResponse(res, 401, false, 'Invalid credentials');
  }

  return sendResponse(res, 200, true, 'Login successful', {
    _id: admin._id,
    name: admin.name,
    email: admin.email,
    token: generateToken(admin._id),
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
