const mongoose = require('mongoose');

const enquirySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    roomType: {
      type: String,
      required: true,
      trim: true,
    },
    moveInDate: {
      type: Date,
      default: null,
    },
    message: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['New', 'Contacted', 'Follow-up', 'Converted', 'Closed'],
      default: 'New',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Enquiry', enquirySchema);
