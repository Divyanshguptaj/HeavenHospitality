const mongoose = require('mongoose');

const websiteSettingsSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      default: 'The Heaven Hospitality',
    },
    phone: {
      type: String,
      default: '',
    },
    whatsapp: {
      type: String,
      default: '',
    },
    email: {
      type: String,
      default: '',
    },
    address: {
      type: String,
      default: '',
    },
    googleMapsUrl: {
      type: String,
      default: '',
    },
    socialLinks: {
      type: Object,
      default: {
        instagram: '',
        facebook: '',
        linkedin: '',
      },
    },
    heroContent: {
      type: Object,
      default: {
        eyebrow: 'Premium Boys PG',
        title: 'Your Comfortable Home Away From Home',
        description: '',
      },
    },
    aboutContent: {
      type: Object,
      default: {
        heading: '',
        body: '',
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WebsiteSettings', websiteSettingsSchema);
