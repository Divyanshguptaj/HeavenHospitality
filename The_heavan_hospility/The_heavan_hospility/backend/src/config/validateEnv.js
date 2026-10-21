const REQUIRED_VARS = ['JWT_SECRET', 'DATABASE_URL'];

const validateEnv = () => {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key] || !process.env[key].trim());

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. Set them in backend/.env before starting the server.`,
    );
  }

  if (process.env.JWT_SECRET.length < 16) {
    throw new Error('JWT_SECRET must be at least 16 characters long.');
  }
};

module.exports = validateEnv;
