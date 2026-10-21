const Room = require('../models/Room');
const Amenity = require('../models/Amenity');
const Gallery = require('../models/Gallery');
const Food = require('../models/Food');
const Review = require('../models/Review');
const Enquiry = require('../models/Enquiry');
const WebsiteSettings = require('../models/WebsiteSettings');
const Faq = require('../models/Faq');
const SpecialOffer = require('../models/SpecialOffer');
const asyncHandler = require('../utils/asyncHandler');

// Deliberately excludes the Admin collection entirely (names, emails, and
// bcrypt password hashes) — a content backup has no reason to carry
// credentials, hashed or not, and nothing here supports restoring from it
// anyway. Admin accounts are recreated via `npm run seed:admin`.
const exportBackup = asyncHandler(async (req, res) => {
  const [rooms, amenities, gallery, food, reviews, enquiries, settings, faqs, specialOffers] = await Promise.all([
    Room.find().lean(),
    Amenity.find().lean(),
    Gallery.find().lean(),
    Food.find().lean(),
    Review.find().lean(),
    Enquiry.find().lean(),
    WebsiteSettings.findOne().lean(),
    Faq.find().lean(),
    SpecialOffer.find().lean(),
  ]);

  const backup = {
    exportedAt: new Date().toISOString(),
    source: 'The Heaven Hospitality admin backup',
    version: 1,
    data: { rooms, amenities, gallery, food, reviews, enquiries, settings, faqs, specialOffers },
  };

  const filename = `heaven-hospitality-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.status(200).send(JSON.stringify(backup, null, 2));
});

module.exports = { exportBackup };
