const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: 5,
    },
    review: {
      type: String,
      required: true,
      trim: true,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    isVisible: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Review', reviewSchema);
