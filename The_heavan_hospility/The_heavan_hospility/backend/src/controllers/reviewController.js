const Review = require('../models/Review');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const addReview = asyncHandler(async (req, res) => {
  const review = await Review.create(req.body);
  return sendResponse(res, 201, true, 'Review submitted successfully', review);
});

const getReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ isApproved: true, isVisible: true }).sort({ createdAt: -1 });
  return sendResponse(res, 200, true, 'Reviews fetched successfully', reviews);
});

const getAdminReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find().sort({ createdAt: -1 });
  return sendResponse(res, 200, true, 'Reviews fetched successfully', reviews);
});

const updateReview = asyncHandler(async (req, res) => {
  const review = await Review.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!review) return sendResponse(res, 404, false, 'Review not found');
  return sendResponse(res, 200, true, 'Review updated successfully', review);
});

const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findByIdAndDelete(req.params.id);
  if (!review) return sendResponse(res, 404, false, 'Review not found');
  return sendResponse(res, 200, true, 'Review deleted successfully');
});

module.exports = { addReview, getReviews, getAdminReviews, updateReview, deleteReview };
