const WebsiteSettings = require('../models/WebsiteSettings');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getSettings = asyncHandler(async (req, res) => {
  let settings = await WebsiteSettings.findOne();

  if (!settings) {
    settings = await WebsiteSettings.create({});
  }

  return sendResponse(res, 200, true, 'Settings fetched successfully', settings);
});

const updateSettings = asyncHandler(async (req, res) => {
  let settings = await WebsiteSettings.findOne();

  if (!settings) {
    settings = await WebsiteSettings.create(req.body);
    return sendResponse(res, 201, true, 'Settings created successfully', settings);
  }

  settings = await WebsiteSettings.findByIdAndUpdate(settings._id, req.body, { new: true, runValidators: true });
  return sendResponse(res, 200, true, 'Settings updated successfully', settings);
});

module.exports = { getSettings, updateSettings };
