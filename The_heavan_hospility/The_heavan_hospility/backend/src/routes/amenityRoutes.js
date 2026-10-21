const express = require('express');
const { createAmenity, getAmenities, getAmenityById, updateAmenity, deleteAmenity } = require('../controllers/amenityController');
const protect = require('../middleware/authMiddleware');
const validateMiddleware = require('../middleware/validateMiddleware');
const { amenitySchema, amenityUpdateSchema } = require('../validations/amenityValidation');

const router = express.Router();

router.post('/', protect, validateMiddleware(amenitySchema), createAmenity);
router.get('/', getAmenities);
router.get('/:id', getAmenityById);
router.patch('/:id', protect, validateMiddleware(amenityUpdateSchema), updateAmenity);
router.delete('/:id', protect, deleteAmenity);

module.exports = router;
