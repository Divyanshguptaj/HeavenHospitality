const { z } = require('zod');

const booleanLike = z.union([z.boolean(), z.enum(['true', 'false'])]).transform((value) => value === true || value === 'true');

const galleryCreateSchema = z.object({
  title: z.string().trim().max(120).optional().default(''),
  category: z.string().trim().min(1, 'Category is required.').max(80).optional().default('General'),
});

const galleryUpdateSchema = z.object({
  title: z.string().trim().max(120).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  isActive: booleanLike.optional(),
});

const galleryReorderSchema = z.object({
  order: z.array(z.string().min(1)).min(1, 'order must contain at least one gallery ID.'),
});

module.exports = { galleryCreateSchema, galleryUpdateSchema, galleryReorderSchema };
