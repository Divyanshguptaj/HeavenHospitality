const app = require('./app');
const connectDB = require('./config/db');
const validateEnv = require('./config/validateEnv');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    validateEnv();
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
