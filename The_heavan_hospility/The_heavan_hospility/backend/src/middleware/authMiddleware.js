const jwt = require('jsonwebtoken');
const { admins } = require('../repositories');
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
    const admin = await admins.findById(decoded.id);

    if (!admin) {
      return sendResponse(res, 401, false, 'Not authorized, admin not found');
    }

    req.admin = { _id: admin._id, name: admin.name, email: admin.email };
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = protect;
