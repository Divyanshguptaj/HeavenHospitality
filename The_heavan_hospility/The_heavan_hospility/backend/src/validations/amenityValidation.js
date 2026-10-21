const { z } = require('zod');

const amenitySchema = z.object({
  name: z.string().min(2),
  icon: z.string().optional().default(''),
  isActive: z.boolean().optional().default(true),
});

// See roomValidation.js for why update schemas avoid `.default()`:
// `.partial()` keeps defaults, which would reset omitted fields on every PATCH.
const amenityUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  icon: z.string().optional(),
  isActive: z.boolean().optional(),
});

module.exports = { amenitySchema, amenityUpdateSchema };
