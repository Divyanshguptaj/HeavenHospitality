const express = require('express');
const { exportBackup } = require('../controllers/backupController');
const protect = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', protect, exportBackup);

module.exports = router;
