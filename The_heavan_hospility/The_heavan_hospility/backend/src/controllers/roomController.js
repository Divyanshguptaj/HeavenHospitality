const { rooms } = require('../repositories');
const sendResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const createRoom = asyncHandler(async (req, res) => {
  const room = await rooms.create(req.body);
  return sendResponse(res, 201, true, 'Room created successfully', room);
});

const getRooms = asyncHandler(async (req, res) => {
  const items = await rooms.list();
  return sendResponse(res, 200, true, 'Rooms fetched successfully', items);
});

const getRoomById = asyncHandler(async (req, res) => {
  const room = await rooms.findById(req.params.id);
  if (!room) return sendResponse(res, 404, false, 'Room not found');
  return sendResponse(res, 200, true, 'Room fetched successfully', room);
});

const updateRoom = asyncHandler(async (req, res) => {
  // vacantBeds <= totalCapacity can't be checked by the zod schema alone on
  // a partial update, since the request may only include one of the two
  // fields. Resolve both against the existing row before updating.
  if (req.body.vacantBeds !== undefined || req.body.totalCapacity !== undefined) {
    const existing = await rooms.findById(req.params.id);
    if (!existing) return sendResponse(res, 404, false, 'Room not found');

    const effectiveVacant = req.body.vacantBeds ?? existing.vacantBeds;
    const effectiveCapacity = req.body.totalCapacity ?? existing.totalCapacity;

    if (effectiveVacant > effectiveCapacity) {
      return sendResponse(res, 400, false, 'vacantBeds cannot exceed totalCapacity.');
    }
  }

  const room = await rooms.update(req.params.id, req.body);
  if (!room) return sendResponse(res, 404, false, 'Room not found');
  return sendResponse(res, 200, true, 'Room updated successfully', room);
});

const deleteRoom = asyncHandler(async (req, res) => {
  const room = await rooms.remove(req.params.id);
  if (!room) return sendResponse(res, 404, false, 'Room not found');
  return sendResponse(res, 200, true, 'Room deleted successfully');
});

module.exports = { createRoom, getRooms, getRoomById, updateRoom, deleteRoom };
