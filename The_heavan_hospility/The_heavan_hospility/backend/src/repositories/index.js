const { createRepository } = require('../lib/repository');

const rooms = createRepository({
  table: 'rooms',
  fields: [
    'name',
    'sharingType',
    'description',
    'monthlyRent',
    'acType',
    'totalCapacity',
    'vacantBeds',
    'tag',
    'availabilityStatus',
    'amenities',
    'images',
    'isActive',
  ],
});

const amenities = createRepository({ table: 'amenities', fields: ['name', 'icon', 'isActive'] });

const gallery = createRepository({
  table: 'gallery',
  fields: ['title', 'category', 'imageUrl', 'publicId', 'order', 'isActive'],
  columnOverrides: { order: 'sort_order' },
});

const food = createRepository({
  table: 'food_items',
  fields: ['title', 'description', 'imageUrl', 'isActive'],
});

const reviews = createRepository({
  table: 'reviews',
  fields: ['name', 'rating', 'review', 'isApproved', 'isVisible'],
});

const enquiries = createRepository({
  table: 'enquiries',
  fields: ['name', 'phone', 'email', 'roomType', 'moveInDate', 'message', 'status'],
});

const faqs = createRepository({
  table: 'faqs',
  fields: ['question', 'answer', 'order', 'isActive'],
  columnOverrides: { order: 'sort_order' },
});

const specialOffers = createRepository({
  table: 'special_offers',
  fields: ['title', 'amount', 'description', 'startDate', 'endDate', 'isActive'],
});

const settings = createRepository({
  table: 'website_settings',
  fields: ['businessName', 'phone', 'whatsapp', 'email', 'address', 'googleMapsUrl', 'socialLinks', 'heroContent', 'aboutContent'],
});

const admins = createRepository({ table: 'admins', fields: ['name', 'email', 'password'] });

module.exports = { rooms, amenities, gallery, food, reviews, enquiries, faqs, specialOffers, settings, admins };
