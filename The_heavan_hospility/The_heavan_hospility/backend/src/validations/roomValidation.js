const { z } = require('zod');

const SHARING_TYPES = ['Single Sharing', '2 Sharing', '3 Sharing', '4 Sharing', '5 Sharing', '6 Sharing'];
const AC_TYPES = ['AC', 'Non-AC', 'Both'];
const AVAILABILITY_STATUSES = ['Available', 'Limited', 'Full', 'On Request'];

const roomSchema = z
  .object({
    name: z.string().min(2),
    sharingType: z.enum(SHARING_TYPES),
    description: z.string().optional().default(''),
    monthlyRent: z.number().min(0, 'Monthly rent cannot be negative.'),
    acType: z.enum(AC_TYPES),
    totalCapacity: z.number().int().min(1, 'Total capacity must be at least 1.'),
    vacantBeds: z.number().int().min(0, 'Vacant beds cannot be negative.'),
    tag: z.string().optional().default(''),
    availabilityStatus: z.enum(AVAILABILITY_STATUSES).optional().default('Available'),
    amenities: z.array(z.string()).optional().default([]),
    images: z.array(z.string()).optional().default([]),
    isActive: z.boolean().optional().default(true),
  })
  .refine((data) => data.vacantBeds <= data.totalCapacity, {
    message: 'vacantBeds cannot exceed totalCapacity.',
    path: ['vacantBeds'],
  });

// No `.default()` on optional fields — see the note this file used to carry:
// a PATCH only sends changed fields, and defaults would silently reset
// everything else (this bit us for real on Room/Amenity earlier in this
// project — confirmed via live testing, not just theory).
// vacantBeds <= totalCapacity is cross-checked in the controller for
// updates, since a partial update may only include one of the two fields.
const roomUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  sharingType: z.enum(SHARING_TYPES).optional(),
  description: z.string().optional(),
  monthlyRent: z.number().min(0, 'Monthly rent cannot be negative.').optional(),
  acType: z.enum(AC_TYPES).optional(),
  totalCapacity: z.number().int().min(1, 'Total capacity must be at least 1.').optional(),
  vacantBeds: z.number().int().min(0, 'Vacant beds cannot be negative.').optional(),
  tag: z.string().optional(),
  availabilityStatus: z.enum(AVAILABILITY_STATUSES).optional(),
  amenities: z.array(z.string()).optional(),
  images: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

module.exports = { roomSchema, roomUpdateSchema, SHARING_TYPES, AC_TYPES, AVAILABILITY_STATUSES };
