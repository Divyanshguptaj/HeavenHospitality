const Food = require('../models/Food');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const createFoodItem = asyncHandler(async (req, res) => {
  const item = await Food.create(req.body);
  return sendResponse(res, 201, true, 'Food item created successfully', item);
});

const getFoodItems = asyncHandler(async (req, res) => {
  const items = await Food.find().sort({ createdAt: -1 });
  return sendResponse(res, 200, true, 'Food items fetched successfully', items);
});

const getFoodItemById = asyncHandler(async (req, res) => {
  const item = await Food.findById(req.params.id);
  if (!item) return sendResponse(res, 404, false, 'Food item not found');
  return sendResponse(res, 200, true, 'Food item fetched successfully', item);
});

const updateFoodItem = asyncHandler(async (req, res) => {
  const item = await Food.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!item) return sendResponse(res, 404, false, 'Food item not found');
  return sendResponse(res, 200, true, 'Food item updated successfully', item);
});

const deleteFoodItem = asyncHandler(async (req, res) => {
  const item = await Food.findByIdAndDelete(req.params.id);
  if (!item) return sendResponse(res, 404, false, 'Food item not found');
  return sendResponse(res, 200, true, 'Food item deleted successfully');
});

module.exports = { createFoodItem, getFoodItems, getFoodItemById, updateFoodItem, deleteFoodItem };
