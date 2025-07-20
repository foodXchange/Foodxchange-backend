import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

const globalSetup = async () => {
  console.log('Starting global test setup...');

  // Start MongoDB Memory Server
  const mongod = await MongoMemoryServer.create();
  const mongoUri = mongod.getUri();

  // Store the server instance globally for cleanup
  (global as any).__MONGOD__ = mongod;
  process.env.MONGODB_URI = mongoUri;

  console.log(`MongoDB Memory Server started at: ${mongoUri}`);

  // Connect to the database
  await mongoose.connect(mongoUri);

  console.log('Global test setup completed');
};

export default globalSetup;
