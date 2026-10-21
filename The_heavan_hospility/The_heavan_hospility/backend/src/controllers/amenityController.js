const { amenities } = require('../repositories');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const createAmenity = asyncHandler(async (req, res) => {
  const amenity = await amenities.create(req.body);
  return sendResponse(res, 201, true, 'Amenity created successfully', amenity);
});

const getAmenities = asyncHandler(async (req, res) => {
  const items = await amenities.list();
  return sendResponse(res, 200, true, 'Amenities fetched successfully', items);
});

const getAmenityById = asyncHandler(async (req, res) => {
  const amenity = await amenities.findById(req.params.id);
  if (!amenity) return sendResponse(res, 404, false, 'Amenity not found');
  return sendResponse(res, 200, true, 'Amenity fetched successfully', amenity);
});

const updateAmenity = asyncHandler(async (req, res) => {
  const amenity = await amenities.update(req.params.id, req.body);
  if (!amenity) return sendResponse(res, 404, false, 'Amenity not found');
  return sendResponse(res, 200, true, 'Amenity updated successfully', amenity);
});

const deleteAmenity = asyncHandler(async (req, res) => {
  const amenity = await amenities.remove(req.params.id);
  if (!amenity) return sendResponse(res, 404, false, 'Amenity not found');
  return sendResponse(res, 200, true, 'Amenity deleted successfully');
});

module.exports = { createAmenity, getAmenities, getAmenityById, updateAmenity, deleteAmenity };
