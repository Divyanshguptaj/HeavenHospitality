const { gallery } = require('../repositories');
const { pool } = require('../config/db');
const { UUID_PATTERN } = require('../lib/repository');
const cloudinary = require('../config/cloudinary');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const GALLERY_ORDER = 'sort_order ASC, created_at DESC';

const uploadImage = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) return sendResponse(res, 400, false, 'No image uploaded');

  const result = await cloudinary.uploader.upload(`data:${file.mimetype};base64,${file.buffer.toString('base64')}`, {
    folder: 'the-heaven-hospitality',
  });

  const { rows } = await pool.query('SELECT max(sort_order) AS max_order FROM gallery');
  const nextOrder = rows[0].max_order === null ? 0 : rows[0].max_order + 1;

  const image = await gallery.create({
    title: req.body.title || '',
    category: req.body.category || 'General',
    imageUrl: result.secure_url,
    publicId: result.public_id,
    order: nextOrder,
  });

  return sendResponse(res, 201, true, 'Image uploaded successfully', image);
});

const getGallery = asyncHandler(async (req, res) => {
  const items = await gallery.list(GALLERY_ORDER);
  return sendResponse(res, 200, true, 'Gallery fetched successfully', items);
});

const updateGalleryItem = asyncHandler(async (req, res) => {
  const item = await gallery.update(req.params.id, req.body);
  if (!item) return sendResponse(res, 404, false, 'Gallery item not found');
  return sendResponse(res, 200, true, 'Gallery item updated successfully', item);
});

const reorderGallery = asyncHandler(async (req, res) => {
  const { order } = req.body;

  if (!Array.isArray(order) || order.length === 0) {
    return sendResponse(res, 400, false, 'order must be a non-empty array of gallery IDs');
  }

  const validIds = order.every((id) => UUID_PATTERN.test(id));
  const known = validIds ? await pool.query('SELECT id FROM gallery WHERE id = ANY($1::uuid[])', [order]) : null;
  if (!known || known.rows.length !== new Set(order).size) {
    return sendResponse(res, 400, false, 'order contains unknown gallery IDs');
  }

  await pool.query(
    'UPDATE gallery SET sort_order = ordering.position - 1, updated_at = now() FROM unnest($1::uuid[]) WITH ORDINALITY AS ordering(id, position) WHERE gallery.id = ordering.id',
    [order],
  );

  const updated = await gallery.list(GALLERY_ORDER);
  return sendResponse(res, 200, true, 'Gallery order updated successfully', updated);
});

const deleteGalleryItem = asyncHandler(async (req, res) => {
  const item = await gallery.findById(req.params.id);
  if (!item) return sendResponse(res, 404, false, 'Gallery item not found');

  if (item.publicId) {
    await cloudinary.uploader.destroy(item.publicId);
  }

  await gallery.remove(req.params.id);
  return sendResponse(res, 200, true, 'Gallery item deleted successfully');
});

module.exports = { uploadImage, getGallery, updateGalleryItem, reorderGallery, deleteGalleryItem };
