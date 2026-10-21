const { settings: settingsRepository } = require('../repositories');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const getSettings = asyncHandler(async (req, res) => {
  const [existing] = await settingsRepository.query('SELECT * FROM website_settings ORDER BY created_at LIMIT 1');
  const settings = existing || (await settingsRepository.create({}));

  return sendResponse(res, 200, true, 'Settings fetched successfully', settings);
});

const updateSettings = asyncHandler(async (req, res) => {
  const [existing] = await settingsRepository.query('SELECT * FROM website_settings ORDER BY created_at LIMIT 1');

  if (!existing) {
    const created = await settingsRepository.create(req.body);
    return sendResponse(res, 201, true, 'Settings created successfully', created);
  }

  const settings = await settingsRepository.update(existing._id, req.body);
  return sendResponse(res, 200, true, 'Settings updated successfully', settings);
});

module.exports = { getSettings, updateSettings };
