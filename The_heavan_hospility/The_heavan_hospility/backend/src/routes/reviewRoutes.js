const express = require('express');
const { addReview, getReviews, getAdminReviews, updateReview, deleteReview } = require('../controllers/reviewController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', addReview);
router.get('/admin', protect, getAdminReviews);
router.get('/', getReviews);
router.patch('/:id', protect, updateReview);
router.delete('/:id', protect, deleteReview);

module.exports = router;
