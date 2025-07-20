import mongoose from 'mongoose';

const globalTeardown = async () => {
  console.log('Starting global test teardown...');

  // Close mongoose connection
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    console.log('Mongoose connection closed');
  }

  // Stop MongoDB Memory Server
  const mongod = (global as any).__MONGOD__;
  if (mongod) {
    await mongod.stop();
    console.log('MongoDB Memory Server stopped');
  }

  console.log('Global test teardown completed');
};

export default globalTeardown;
