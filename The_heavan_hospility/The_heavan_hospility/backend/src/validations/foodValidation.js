const { z } = require('zod');

const foodSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters.'),
  description: z.string().trim().optional().default(''),
  imageUrl: z.string().trim().optional().default(''),
  isActive: z.boolean().optional().default(true),
});

// No `.default()` — a PATCH only sends changed fields; defaults would
// silently reset everything else (established pattern across this project).
const foodUpdateSchema = z.object({
  title: z.string().trim().min(2).optional(),
  description: z.string().trim().optional(),
  imageUrl: z.string().trim().optional(),
  isActive: z.boolean().optional(),
});

module.exports = { foodSchema, foodUpdateSchema };
