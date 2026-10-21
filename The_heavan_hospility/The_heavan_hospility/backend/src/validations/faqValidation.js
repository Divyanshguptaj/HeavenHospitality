const { z } = require('zod');

const faqSchema = z.object({
  question: z.string().trim().min(3, 'Question must be at least 3 characters.'),
  answer: z.string().trim().min(3, 'Answer must be at least 3 characters.'),
  // No default: the controller auto-increments `order` from the current max
  // when it's omitted. A `.default(0)` here would make `req.body.order`
  // literally 0 (not undefined), and `0 ?? autoIncrement` evaluates to 0
  // since `??` only falls through on null/undefined — silently breaking
  // the auto-increment for every FAQ after the first.
  order: z.number().optional(),
  isActive: z.boolean().optional().default(true),
});

// No `.default()` here on purpose — see roomValidation.js for why: a PATCH
// only sends changed fields, and defaults would reset omitted ones.
const faqUpdateSchema = z.object({
  question: z.string().trim().min(3).optional(),
  answer: z.string().trim().min(3).optional(),
  order: z.number().optional(),
  isActive: z.boolean().optional(),
});

module.exports = { faqSchema, faqUpdateSchema };
