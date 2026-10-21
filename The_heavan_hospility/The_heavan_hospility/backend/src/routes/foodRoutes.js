const express = require('express');
const { createFoodItem, getFoodItems, getFoodItemById, updateFoodItem, deleteFoodItem } = require('../controllers/foodController');
const protect = require('../middleware/authMiddleware');
const validateMiddleware = require('../middleware/validateMiddleware');
const { foodSchema, foodUpdateSchema } = require('../validations/foodValidation');

const router = express.Router();

router.post('/', protect, validateMiddleware(foodSchema), createFoodItem);
router.get('/', getFoodItems);
router.get('/:id', getFoodItemById);
router.patch('/:id', protect, validateMiddleware(foodUpdateSchema), updateFoodItem);
router.delete('/:id', protect, deleteFoodItem);

module.exports = router;
