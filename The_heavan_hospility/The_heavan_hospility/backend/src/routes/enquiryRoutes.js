const express = require('express');
const { createEnquiry, getEnquiries, getEnquiryById, updateEnquiry, deleteEnquiry } = require('../controllers/enquiryController');
const protect = require('../middleware/authMiddleware');
const validateMiddleware = require('../middleware/validateMiddleware');
const { enquirySchema } = require('../validations/enquiryValidation');

const router = express.Router();

router.post('/', validateMiddleware(enquirySchema), createEnquiry);
router.get('/', protect, getEnquiries);
router.get('/:id', protect, getEnquiryById);
router.patch('/:id', protect, updateEnquiry);
router.delete('/:id', protect, deleteEnquiry);

module.exports = router;
