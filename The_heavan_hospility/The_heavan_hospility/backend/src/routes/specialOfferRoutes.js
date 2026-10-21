const express = require('express');
const { createOffer, getOffers, getActiveOffer, getOfferById, updateOffer, deleteOffer } = require('../controllers/specialOfferController');
const protect = require('../middleware/authMiddleware');
const validateMiddleware = require('../middleware/validateMiddleware');
const { specialOfferSchema, specialOfferUpdateSchema } = require('../validations/specialOfferValidation');

const router = express.Router();

router.post('/', protect, validateMiddleware(specialOfferSchema), createOffer);
router.get('/active', getActiveOffer);
router.get('/', protect, getOffers);
router.get('/:id', protect, getOfferById);
router.patch('/:id', protect, validateMiddleware(specialOfferUpdateSchema), updateOffer);
router.delete('/:id', protect, deleteOffer);

module.exports = router;
