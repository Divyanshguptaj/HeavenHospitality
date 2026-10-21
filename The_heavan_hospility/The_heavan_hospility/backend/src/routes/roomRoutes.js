const express = require('express');
const { createRoom, getRooms, getRoomById, updateRoom, deleteRoom } = require('../controllers/roomController');
const protect = require('../middleware/authMiddleware');
const validateMiddleware = require('../middleware/validateMiddleware');
const { roomSchema, roomUpdateSchema } = require('../validations/roomValidation');

const router = express.Router();

router.post('/', protect, validateMiddleware(roomSchema), createRoom);
router.get('/', getRooms);
router.get('/:id', getRoomById);
router.patch('/:id', protect, validateMiddleware(roomUpdateSchema), updateRoom);
router.delete('/:id', protect, deleteRoom);

module.exports = router;
