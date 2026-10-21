const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const sendResponse = require('../utils/apiResponse');

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendResponse(res, 401, false, 'Not authorized, no token');
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return sendResponse(res, 401, false, 'Not authorized, invalid or expired token');
  }

  try {
    const admin = await Admin.findById(decoded.id).select('-password');

    if (!admin) {
      return sendResponse(res, 401, false, 'Not authorized, admin not found');
    }

    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = protect;
