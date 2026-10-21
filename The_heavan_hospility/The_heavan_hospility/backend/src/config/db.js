const dns = require('dns');
const mongoose = require('mongoose');

// Some Windows/VPN setups leave Node's resolver pointed at an unreachable
// 127.0.0.1, which breaks mongodb+srv:// SRV lookups even though the OS
// resolver works fine. Fall back to public resolvers for SRV connections.
if (dns.getServers().every((server) => server === '127.0.0.1')) {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/the_heaven_hospitality', {
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    throw error;
  }
};

module.exports = connectDB;
