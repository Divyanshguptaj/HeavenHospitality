const express = require('express');
const { createFaq, getFaqs, getFaqById, updateFaq, deleteFaq } = require('../controllers/faqController');
const protect = require('../middleware/authMiddleware');
const validateMiddleware = require('../middleware/validateMiddleware');
const { faqSchema, faqUpdateSchema } = require('../validations/faqValidation');

const router = express.Router();

router.post('/', protect, validateMiddleware(faqSchema), createFaq);
router.get('/', getFaqs);
router.get('/:id', getFaqById);
router.patch('/:id', protect, validateMiddleware(faqUpdateSchema), updateFaq);
router.delete('/:id', protect, deleteFaq);

module.exports = router;
