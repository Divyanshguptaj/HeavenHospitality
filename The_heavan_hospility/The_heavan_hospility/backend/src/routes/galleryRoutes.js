const express = require('express');
const upload = require('../middleware/uploadMiddleware');
const validateMiddleware = require('../middleware/validateMiddleware');
const { galleryCreateSchema, galleryUpdateSchema, galleryReorderSchema } = require('../validations/galleryValidation');
const { uploadImage, getGallery, updateGalleryItem, reorderGallery, deleteGalleryItem } = require('../controllers/galleryController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', protect, upload.single('image'), validateMiddleware(galleryCreateSchema), uploadImage);
router.get('/', getGallery);
router.patch('/reorder', protect, validateMiddleware(galleryReorderSchema), reorderGallery);
router.patch('/:id', protect, validateMiddleware(galleryUpdateSchema), updateGalleryItem);
router.delete('/:id', protect, deleteGalleryItem);

module.exports = router;
