const { reviews } = require('../repositories');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const addReview = asyncHandler(async (req, res) => {
  const review = await reviews.create(req.body);
  return sendResponse(res, 201, true, 'Review submitted successfully', review);
});

const getReviews = asyncHandler(async (req, res) => {
  const items = await reviews.query('SELECT * FROM reviews WHERE is_approved AND is_visible ORDER BY created_at DESC');
  return sendResponse(res, 200, true, 'Reviews fetched successfully', items);
});

const getAdminReviews = asyncHandler(async (req, res) => {
  const items = await reviews.list();
  return sendResponse(res, 200, true, 'Reviews fetched successfully', items);
});

const updateReview = asyncHandler(async (req, res) => {
  const review = await reviews.update(req.params.id, req.body);
  if (!review) return sendResponse(res, 404, false, 'Review not found');
  return sendResponse(res, 200, true, 'Review updated successfully', review);
});

const deleteReview = asyncHandler(async (req, res) => {
  const review = await reviews.remove(req.params.id);
  if (!review) return sendResponse(res, 404, false, 'Review not found');
  return sendResponse(res, 200, true, 'Review deleted successfully');
});

module.exports = { addReview, getReviews, getAdminReviews, updateReview, deleteReview };
