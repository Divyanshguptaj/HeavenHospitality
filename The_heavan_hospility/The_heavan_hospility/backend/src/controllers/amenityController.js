const Amenity = require('../models/Amenity');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const createAmenity = asyncHandler(async (req, res) => {
  const amenity = await Amenity.create(req.body);
  return sendResponse(res, 201, true, 'Amenity created successfully', amenity);
});

const getAmenities = asyncHandler(async (req, res) => {
  const amenities = await Amenity.find().sort({ createdAt: -1 });
  return sendResponse(res, 200, true, 'Amenities fetched successfully', amenities);
});

const getAmenityById = asyncHandler(async (req, res) => {
  const amenity = await Amenity.findById(req.params.id);
  if (!amenity) return sendResponse(res, 404, false, 'Amenity not found');
  return sendResponse(res, 200, true, 'Amenity fetched successfully', amenity);
});

const updateAmenity = asyncHandler(async (req, res) => {
  const amenity = await Amenity.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!amenity) return sendResponse(res, 404, false, 'Amenity not found');
  return sendResponse(res, 200, true, 'Amenity updated successfully', amenity);
});

const deleteAmenity = asyncHandler(async (req, res) => {
  const amenity = await Amenity.findByIdAndDelete(req.params.id);
  if (!amenity) return sendResponse(res, 404, false, 'Amenity not found');
  return sendResponse(res, 200, true, 'Amenity deleted successfully');
});

module.exports = { createAmenity, getAmenities, getAmenityById, updateAmenity, deleteAmenity };
