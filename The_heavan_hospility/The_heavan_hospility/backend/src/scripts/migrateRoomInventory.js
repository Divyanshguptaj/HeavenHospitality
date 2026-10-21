// One-time safety-net migration for the Room inventory refactor.
//
// The old schema stored `price` and `availability` as free-text strings.
// The new schema needs numeric `monthlyRent`, an `acType` enum, and
// `totalCapacity`/`vacantBeds` counts — none of which existed before.
//
// This script NEVER deletes data. For any room missing the new required
// fields, it:
//   - best-effort parses a number out of the old `price` string for
//     monthlyRent (falls back to 0 if nothing parseable is found)
//   - defaults acType to 'Non-AC' and totalCapacity/vacantBeds to 1
//     (the safest non-zero placeholder — an admin must review and correct
//     these; they are deliberately not guessed beyond this)
//   - leaves the old `price`/`availability` fields untouched in the
//     document (Mongoose just ignores fields outside the current schema;
//     they remain in MongoDB as a record of the original data)
//   - prints every room it touched and exactly what needs manual review
//
// Safe to re-run: rooms that already have all the new fields are skipped.

require('dotenv').config();

const dns = require('dns');
if (dns.getServers().every((server) => server === '127.0.0.1')) {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
}

const mongoose = require('mongoose');
const connectDB = require('../config/db');

const parseRentFromPriceString = (priceString) => {
  if (!priceString) return 0;
  const digitsOnly = String(priceString).replace(/[^0-9]/g, '');
  return digitsOnly ? Number(digitsOnly) : 0;
};

const migrate = async () => {
  await connectDB();

  // Query the raw collection, not the Mongoose model: the model's schema
  // would silently strip the legacy `price`/`availability` fields from any
  // document it loads, which defeats the point of reading them here.
  const collection = mongoose.connection.collection('rooms');
  const allRooms = await collection.find({}).toArray();

  const needsMigration = allRooms.filter(
    (room) => room.monthlyRent === undefined || room.acType === undefined || room.totalCapacity === undefined || room.vacantBeds === undefined,
  );

  if (needsMigration.length === 0) {
    console.log(`No migration needed. ${allRooms.length} room(s) already have the current inventory fields.`);
    return;
  }

  console.log(`Migrating ${needsMigration.length} of ${allRooms.length} room(s)...\n`);

  for (const room of needsMigration) {
    const monthlyRent = room.monthlyRent ?? parseRentFromPriceString(room.price);
    const update = {
      monthlyRent,
      acType: room.acType ?? 'Non-AC',
      totalCapacity: room.totalCapacity ?? 1,
      vacantBeds: room.vacantBeds ?? 1,
      tag: room.tag ?? '',
      availabilityStatus: room.availabilityStatus ?? 'Available',
    };

    await collection.updateOne({ _id: room._id }, { $set: update });

    console.log(`Room "${room.name}" (${room._id}):`);
    console.log(`  monthlyRent <- ${update.monthlyRent}${room.price ? ` (parsed from old price "${room.price}")` : ' (no old price found, set to 0 — NEEDS REVIEW)'}`);
    console.log(`  acType <- "${update.acType}" (default — NEEDS REVIEW)`);
    console.log(`  totalCapacity <- ${update.totalCapacity}, vacantBeds <- ${update.vacantBeds} (placeholder — NEEDS REVIEW)`);
    console.log('');
  }

  console.log('Migration complete. Review every room flagged above in the admin panel before relying on its rent/inventory numbers.');
};

migrate()
  .catch((error) => {
    console.error(`Migration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
