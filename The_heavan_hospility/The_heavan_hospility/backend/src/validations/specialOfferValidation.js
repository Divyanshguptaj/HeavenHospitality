const { z } = require('zod');

const dateField = z
  .string()
  .nullable()
  .optional()
  .transform((value) => (value ? new Date(value) : null));

const specialOfferSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters.'),
  amount: z.string().trim().min(1, 'Amount/discount text is required.'),
  description: z.string().trim().optional().default(''),
  startDate: dateField,
  endDate: dateField,
  isActive: z.boolean().optional().default(true),
});

// No `.default()` — see roomValidation.js for why a PATCH schema must not
// re-apply create-time defaults to fields the client didn't send.
const specialOfferUpdateSchema = z.object({
  title: z.string().trim().min(2).optional(),
  amount: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  startDate: dateField,
  endDate: dateField,
  isActive: z.boolean().optional(),
});

module.exports = { specialOfferSchema, specialOfferUpdateSchema };
