const { specialOffers } = require('../repositories');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const createOffer = asyncHandler(async (req, res) => {
  const offer = await specialOffers.create(req.body);
  return sendResponse(res, 201, true, 'Special offer created successfully', offer);
});

const getOffers = asyncHandler(async (req, res) => {
  const offers = await specialOffers.list();
  return sendResponse(res, 200, true, 'Special offers fetched successfully', offers);
});

const getActiveOffer = asyncHandler(async (req, res) => {
  const [offer] = await specialOffers.query(
    `SELECT * FROM special_offers
     WHERE is_active
       AND (start_date IS NULL OR start_date <= now())
       AND (end_date IS NULL OR end_date >= now())
     ORDER BY created_at DESC
     LIMIT 1`,
  );

  return sendResponse(res, 200, true, 'Active offer fetched successfully', offer || null);
});

const getOfferById = asyncHandler(async (req, res) => {
  const offer = await specialOffers.findById(req.params.id);
  if (!offer) return sendResponse(res, 404, false, 'Special offer not found');
  return sendResponse(res, 200, true, 'Special offer fetched successfully', offer);
});

const updateOffer = asyncHandler(async (req, res) => {
  const offer = await specialOffers.update(req.params.id, req.body);
  if (!offer) return sendResponse(res, 404, false, 'Special offer not found');
  return sendResponse(res, 200, true, 'Special offer updated successfully', offer);
});

const deleteOffer = asyncHandler(async (req, res) => {
  const offer = await specialOffers.remove(req.params.id);
  if (!offer) return sendResponse(res, 404, false, 'Special offer not found');
  return sendResponse(res, 200, true, 'Special offer deleted successfully');
});

module.exports = { createOffer, getOffers, getActiveOffer, getOfferById, updateOffer, deleteOffer };
