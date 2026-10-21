const { z } = require('zod');

const enquirySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.'),
  phone: z.string().trim().min(7, 'Enter a valid phone number.'),
  email: z.string().trim().email('Enter a valid email address.'),
  roomType: z.string().trim().min(1, 'Room type is required.'),
  moveInDate: z
    .string()
    .nullable()
    .optional()
    .transform((value) => (value ? new Date(value) : null)),
  message: z.string().trim().min(1, 'Message is required.'),
});

module.exports = { enquirySchema };
