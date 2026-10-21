const express = require('express');
const { getSettings, updateSettings } = require('../controllers/settingsController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', getSettings);
router.patch('/', protect, updateSettings);

module.exports = router;
