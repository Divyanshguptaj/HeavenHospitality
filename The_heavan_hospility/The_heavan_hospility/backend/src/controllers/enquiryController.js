const { enquiries } = require('../repositories');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { sendEnquiryEmail } = require('../services/emailService');

const createEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await enquiries.create({ ...req.body, email: req.body.email.toLowerCase() });

  try {
    await sendEnquiryEmail(enquiry);
  } catch (emailError) {
    console.error('Enquiry email notification failed:', emailError.message);
  }

  return sendResponse(res, 201, true, 'Enquiry created successfully', enquiry);
});

const getEnquiries = asyncHandler(async (req, res) => {
  const items = await enquiries.list();
  return sendResponse(res, 200, true, 'Enquiries fetched successfully', items);
});

const getEnquiryById = asyncHandler(async (req, res) => {
  const enquiry = await enquiries.findById(req.params.id);
  if (!enquiry) return sendResponse(res, 404, false, 'Enquiry not found');
  return sendResponse(res, 200, true, 'Enquiry fetched successfully', enquiry);
});

const updateEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await enquiries.update(req.params.id, req.body);
  if (!enquiry) return sendResponse(res, 404, false, 'Enquiry not found');
  return sendResponse(res, 200, true, 'Enquiry updated successfully', enquiry);
});

const deleteEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await enquiries.remove(req.params.id);
  if (!enquiry) return sendResponse(res, 404, false, 'Enquiry not found');
  return sendResponse(res, 200, true, 'Enquiry deleted successfully');
});

module.exports = { createEnquiry, getEnquiries, getEnquiryById, updateEnquiry, deleteEnquiry };
