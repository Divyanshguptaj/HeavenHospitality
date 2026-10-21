const Gallery = require('../models/Gallery');
const cloudinary = require('../config/cloudinary');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const uploadImage = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) return sendResponse(res, 400, false, 'No image uploaded');

  const result = await cloudinary.uploader.upload(`data:${file.mimetype};base64,${file.buffer.toString('base64')}`, {
    folder: 'the-heaven-hospitality',
  });

  const maxOrder = await Gallery.findOne().sort({ order: -1 }).select('order');

  const image = await Gallery.create({
    title: req.body.title || '',
    category: req.body.category || 'General',
    imageUrl: result.secure_url,
    publicId: result.public_id,
    order: (maxOrder?.order ?? -1) + 1,
  });

  return sendResponse(res, 201, true, 'Image uploaded successfully', image);
});

const getGallery = asyncHandler(async (req, res) => {
  const items = await Gallery.find().sort({ order: 1, createdAt: -1 });
  return sendResponse(res, 200, true, 'Gallery fetched successfully', items);
});

const updateGalleryItem = asyncHandler(async (req, res) => {
  const item = await Gallery.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!item) return sendResponse(res, 404, false, 'Gallery item not found');
  return sendResponse(res, 200, true, 'Gallery item updated successfully', item);
});

const reorderGallery = asyncHandler(async (req, res) => {
  const { order } = req.body;

  if (!Array.isArray(order) || order.length === 0) {
    return sendResponse(res, 400, false, 'order must be a non-empty array of gallery IDs');
  }

  const items = await Gallery.find({ _id: { $in: order } }).select('_id');
  if (items.length !== order.length) {
    return sendResponse(res, 400, false, 'order contains unknown gallery IDs');
  }

  await Promise.all(
    order.map((id, index) => Gallery.findByIdAndUpdate(id, { order: index })),
  );

  const updated = await Gallery.find().sort({ order: 1, createdAt: -1 });
  return sendResponse(res, 200, true, 'Gallery order updated successfully', updated);
});

const deleteGalleryItem = asyncHandler(async (req, res) => {
  const item = await Gallery.findById(req.params.id);
  if (!item) return sendResponse(res, 404, false, 'Gallery item not found');

  if (item.publicId) {
    await cloudinary.uploader.destroy(item.publicId);
  }

  await Gallery.findByIdAndDelete(req.params.id);
  return sendResponse(res, 200, true, 'Gallery item deleted successfully');
});

module.exports = { uploadImage, getGallery, updateGalleryItem, reorderGallery, deleteGalleryItem };
