const { food } = require('../repositories');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const createFoodItem = asyncHandler(async (req, res) => {
  const item = await food.create(req.body);
  return sendResponse(res, 201, true, 'Food item created successfully', item);
});

const getFoodItems = asyncHandler(async (req, res) => {
  const items = await food.list();
  return sendResponse(res, 200, true, 'Food items fetched successfully', items);
});

const getFoodItemById = asyncHandler(async (req, res) => {
  const item = await food.findById(req.params.id);
  if (!item) return sendResponse(res, 404, false, 'Food item not found');
  return sendResponse(res, 200, true, 'Food item fetched successfully', item);
});

const updateFoodItem = asyncHandler(async (req, res) => {
  const item = await food.update(req.params.id, req.body);
  if (!item) return sendResponse(res, 404, false, 'Food item not found');
  return sendResponse(res, 200, true, 'Food item updated successfully', item);
});

const deleteFoodItem = asyncHandler(async (req, res) => {
  const item = await food.remove(req.params.id);
  if (!item) return sendResponse(res, 404, false, 'Food item not found');
  return sendResponse(res, 200, true, 'Food item deleted successfully');
});

module.exports = { createFoodItem, getFoodItems, getFoodItemById, updateFoodItem, deleteFoodItem };
