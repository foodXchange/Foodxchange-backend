// MongoDB initialization script for FoodXchange
db = db.getSiblingDB('foodxchange');

// Create application user
db.createUser({
  user: 'foodxchange',
  pwd: 'foodxchange_password',
  roles: [
    {
      role: 'readWrite',
      db: 'foodxchange'
    }
  ]
});

// Create indexes for performance
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ role: 1 });
db.users.createIndex({ accountStatus: 1 });
db.users.createIndex({ createdAt: -1 });

db.companies.createIndex({ name: 1 });
db.companies.createIndex({ verificationStatus: 1 });
db.companies.createIndex({ businessType: 1 });
db.companies.createIndex({ createdAt: -1 });

db.analyticsevents.createIndex({ eventType: 1, timestamp: -1 });
db.analyticsevents.createIndex({ userId: 1, timestamp: -1 });
db.analyticsevents.createIndex({ timestamp: 1 }, { expireAfterSeconds: 7776000 }); // 90 days TTL

print('FoodXchange database initialized successfully');