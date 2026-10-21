const Enquiry = require('../models/Enquiry');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { sendEnquiryEmail } = require('../services/emailService');

const createEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await Enquiry.create(req.body);

  try {
    await sendEnquiryEmail(enquiry);
  } catch (emailError) {
    console.error('Enquiry email notification failed:', emailError.message);
  }

  return sendResponse(res, 201, true, 'Enquiry created successfully', enquiry);
});

const getEnquiries = asyncHandler(async (req, res) => {
  const enquiries = await Enquiry.find().sort({ createdAt: -1 });
  return sendResponse(res, 200, true, 'Enquiries fetched successfully', enquiries);
});

const getEnquiryById = asyncHandler(async (req, res) => {
  const enquiry = await Enquiry.findById(req.params.id);
  if (!enquiry) return sendResponse(res, 404, false, 'Enquiry not found');
  return sendResponse(res, 200, true, 'Enquiry fetched successfully', enquiry);
});

const updateEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await Enquiry.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!enquiry) return sendResponse(res, 404, false, 'Enquiry not found');
  return sendResponse(res, 200, true, 'Enquiry updated successfully', enquiry);
});

const deleteEnquiry = asyncHandler(async (req, res) => {
  const enquiry = await Enquiry.findByIdAndDelete(req.params.id);
  if (!enquiry) return sendResponse(res, 404, false, 'Enquiry not found');
  return sendResponse(res, 200, true, 'Enquiry deleted successfully');
});

module.exports = { createEnquiry, getEnquiries, getEnquiryById, updateEnquiry, deleteEnquiry };
