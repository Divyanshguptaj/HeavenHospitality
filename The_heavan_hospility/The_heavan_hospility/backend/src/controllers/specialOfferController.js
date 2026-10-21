const SpecialOffer = require('../models/SpecialOffer');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const createOffer = asyncHandler(async (req, res) => {
  const offer = await SpecialOffer.create(req.body);
  return sendResponse(res, 201, true, 'Special offer created successfully', offer);
});

const getOffers = asyncHandler(async (req, res) => {
  const offers = await SpecialOffer.find().sort({ createdAt: -1 });
  return sendResponse(res, 200, true, 'Special offers fetched successfully', offers);
});

const getActiveOffer = asyncHandler(async (req, res) => {
  const now = new Date();
  const offer = await SpecialOffer.findOne({
    isActive: true,
    $and: [
      { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
    ],
  }).sort({ createdAt: -1 });

  return sendResponse(res, 200, true, 'Active offer fetched successfully', offer || null);
});

const getOfferById = asyncHandler(async (req, res) => {
  const offer = await SpecialOffer.findById(req.params.id);
  if (!offer) return sendResponse(res, 404, false, 'Special offer not found');
  return sendResponse(res, 200, true, 'Special offer fetched successfully', offer);
});

const updateOffer = asyncHandler(async (req, res) => {
  const offer = await SpecialOffer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!offer) return sendResponse(res, 404, false, 'Special offer not found');
  return sendResponse(res, 200, true, 'Special offer updated successfully', offer);
});

const deleteOffer = asyncHandler(async (req, res) => {
  const offer = await SpecialOffer.findByIdAndDelete(req.params.id);
  if (!offer) return sendResponse(res, 404, false, 'Special offer not found');
  return sendResponse(res, 200, true, 'Special offer deleted successfully');
});

module.exports = { createOffer, getOffers, getActiveOffer, getOfferById, updateOffer, deleteOffer };
