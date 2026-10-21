const { faqs } = require('../repositories');
const { pool } = require('../config/db');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const createFaq = asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT max(sort_order) AS max_order FROM faqs');
  const nextOrder = rows[0].max_order === null ? 0 : rows[0].max_order + 1;
  const faq = await faqs.create({ ...req.body, order: req.body.order ?? nextOrder });
  return sendResponse(res, 201, true, 'FAQ created successfully', faq);
});

const getFaqs = asyncHandler(async (req, res) => {
  const items = await faqs.list('sort_order ASC, created_at ASC');
  return sendResponse(res, 200, true, 'FAQs fetched successfully', items);
});

const getFaqById = asyncHandler(async (req, res) => {
  const faq = await faqs.findById(req.params.id);
  if (!faq) return sendResponse(res, 404, false, 'FAQ not found');
  return sendResponse(res, 200, true, 'FAQ fetched successfully', faq);
});

const updateFaq = asyncHandler(async (req, res) => {
  const faq = await faqs.update(req.params.id, req.body);
  if (!faq) return sendResponse(res, 404, false, 'FAQ not found');
  return sendResponse(res, 200, true, 'FAQ updated successfully', faq);
});

const deleteFaq = asyncHandler(async (req, res) => {
  const faq = await faqs.remove(req.params.id);
  if (!faq) return sendResponse(res, 404, false, 'FAQ not found');
  return sendResponse(res, 200, true, 'FAQ deleted successfully');
});

module.exports = { createFaq, getFaqs, getFaqById, updateFaq, deleteFaq };
