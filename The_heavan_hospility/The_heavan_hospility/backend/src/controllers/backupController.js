const repositories = require('../repositories');
const asyncHandler = require('../utils/asyncHandler');

// Deliberately excludes the admins table (names, emails, and bcrypt password
// hashes) — a content backup has no reason to carry credentials, hashed or not,
// and nothing here supports restoring from it anyway. Admin accounts are
// recreated via `npm run seed:admin`.
const exportBackup = asyncHandler(async (req, res) => {
  const [rooms, amenities, gallery, food, reviews, enquiries, settingsList, faqs, specialOffers] = await Promise.all([
    repositories.rooms.list(),
    repositories.amenities.list(),
    repositories.gallery.list(),
    repositories.food.list(),
    repositories.reviews.list(),
    repositories.enquiries.list(),
    repositories.settings.list(),
    repositories.faqs.list(),
    repositories.specialOffers.list(),
  ]);

  const backup = {
    exportedAt: new Date().toISOString(),
    source: 'The Heaven Hospitality admin backup',
    version: 1,
    data: { rooms, amenities, gallery, food, reviews, enquiries, settings: settingsList[0] || null, faqs, specialOffers },
  };

  const filename = `heaven-hospitality-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.status(200).send(JSON.stringify(backup, null, 2));
});

module.exports = { exportBackup };
