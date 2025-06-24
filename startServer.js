// startServer.js - Starts server with checks
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const mongoose = require('mongoose');

// Load env vars
dotenv.config();

// Function to check if MongoDB is connected
const checkMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange');
    console.log('✅ MongoDB Connected');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    return false;
  }
};

// Start the server
const startServer = async () => {
  // Check MongoDB first
  const mongoConnected = await checkMongoDB();
  if (!mongoConnected) {
    console.log('\n⚠️  Please make sure MongoDB is running and try again.');
    process.exit(1);
  }

  // Import server after MongoDB is connected
  require('./server.js');
};

startServer();
