const Faq = require('../models/Faq');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const createFaq = asyncHandler(async (req, res) => {
  const maxOrder = await Faq.findOne().sort({ order: -1 }).select('order');
  const faq = await Faq.create({ ...req.body, order: req.body.order ?? (maxOrder?.order ?? -1) + 1 });
  return sendResponse(res, 201, true, 'FAQ created successfully', faq);
});

const getFaqs = asyncHandler(async (req, res) => {
  const faqs = await Faq.find().sort({ order: 1, createdAt: 1 });
  return sendResponse(res, 200, true, 'FAQs fetched successfully', faqs);
});

const getFaqById = asyncHandler(async (req, res) => {
  const faq = await Faq.findById(req.params.id);
  if (!faq) return sendResponse(res, 404, false, 'FAQ not found');
  return sendResponse(res, 200, true, 'FAQ fetched successfully', faq);
});

const updateFaq = asyncHandler(async (req, res) => {
  const faq = await Faq.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!faq) return sendResponse(res, 404, false, 'FAQ not found');
  return sendResponse(res, 200, true, 'FAQ updated successfully', faq);
});

const deleteFaq = asyncHandler(async (req, res) => {
  const faq = await Faq.findByIdAndDelete(req.params.id);
  if (!faq) return sendResponse(res, 404, false, 'FAQ not found');
  return sendResponse(res, 200, true, 'FAQ deleted successfully');
});

module.exports = { createFaq, getFaqs, getFaqById, updateFaq, deleteFaq };
