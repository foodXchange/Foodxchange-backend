const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    console.log('🔄 Attempting to connect to MongoDB Atlas...');
    console.log('📍 URI:', process.env.MONGODB_URI ? 'URI is set' : 'URI is NOT set');
    
    if (!process.env.MONGODB_URI) {
      console.log('❌ No MongoDB URI found in environment variables');
      return;
    }
    
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    console.log('⚠️  Running without MongoDB connection');
  }
};

module.exports = connectDB;