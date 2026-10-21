const mongoose = require('mongoose');

const SHARING_TYPES = ['Single Sharing', '2 Sharing', '3 Sharing', '4 Sharing', '5 Sharing', '6 Sharing'];
const AC_TYPES = ['AC', 'Non-AC', 'Both'];
const AVAILABILITY_STATUSES = ['Available', 'Limited', 'Full', 'On Request'];

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sharingType: {
      type: String,
      required: true,
      enum: SHARING_TYPES,
    },
    description: {
      type: String,
      default: '',
    },
    monthlyRent: {
      type: Number,
      required: true,
      min: 0,
    },
    acType: {
      type: String,
      required: true,
      enum: AC_TYPES,
    },
    totalCapacity: {
      type: Number,
      required: true,
      min: 1,
    },
    vacantBeds: {
      type: Number,
      required: true,
      min: 0,
      // vacantBeds <= totalCapacity is enforced in the controller, not here:
      // Mongoose validator `this` context is unreliable on partial
      // findByIdAndUpdate calls (it's the query, not the document, so a
      // request that only sends vacantBeds can't see totalCapacity here).
    },
    tag: {
      type: String,
      default: '',
      trim: true,
    },
    availabilityStatus: {
      type: String,
      enum: AVAILABILITY_STATUSES,
      default: 'Available',
    },
    amenities: [{ type: String }],
    images: [{ type: String }],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

roomSchema.statics.SHARING_TYPES = SHARING_TYPES;
roomSchema.statics.AC_TYPES = AC_TYPES;
roomSchema.statics.AVAILABILITY_STATUSES = AVAILABILITY_STATUSES;

module.exports = mongoose.model('Room', roomSchema);
