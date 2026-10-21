const dotenv = require('dotenv');

// Must run before any require() below: config/cloudinary.js (pulled in via
// galleryRoutes -> galleryController) reads process.env.CLOUDINARY_* at
// module-load time, so loading .env any later leaves it configured with
// undefined credentials regardless of what's actually in the file.
dotenv.config();

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const roomRoutes = require('./routes/roomRoutes');
const amenityRoutes = require('./routes/amenityRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const foodRoutes = require('./routes/foodRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const enquiryRoutes = require('./routes/enquiryRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const faqRoutes = require('./routes/faqRoutes');
const specialOfferRoutes = require('./routes/specialOfferRoutes');
const backupRoutes = require('./routes/backupRoutes');
const { notFound, errorMiddleware } = require('./middleware/errorMiddleware');

const app = express();

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'The Heaven Hospitality backend is running.' });
});

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/amenities', amenityRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/food', foodRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/enquiries', enquiryRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/offers', specialOfferRoutes);
app.use('/api/backup', backupRoutes);

app.use(notFound);
app.use(errorMiddleware);

module.exports = app;
