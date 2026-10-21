const express = require('express');
const { loginAdmin, getAdminProfile } = require('../controllers/authController');
const protect = require('../middleware/authMiddleware');
const validateMiddleware = require('../middleware/validateMiddleware');
const { loginSchema } = require('../validations/authValidation');

const router = express.Router();

router.post('/login', validateMiddleware(loginSchema), loginAdmin);
router.get('/profile', protect, getAdminProfile);

module.exports = router;
