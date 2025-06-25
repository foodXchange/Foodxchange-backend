const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

async function seedData() {
    console.log('?? Starting database seeding...\n');
    
    try {
        // Import only the models that exist
        const User = require('./models/User');
        
        // Check if User model is properly loaded
        console.log('User model loaded:', !!User);
        
        // Clear existing users
        const deletedUsers = await User.deleteMany({});
        console.log('Cleared users:', deletedUsers.deletedCount);
        
        // Create test users with plain passwords (will be hashed by the model)
        const testUsers = [
            {
                email: 'buyer@foodxchange.com',
                password: 'password123',
                role: 'buyer',
                firstName: 'John',
                lastName: 'Buyer',
                verified: true
            },
            {
                email: 'seller@foodxchange.com',
                password: 'password123',
                role: 'seller',
                firstName: 'Jane',
                lastName: 'Seller',
                verified: true
            },
            {
                email: 'admin@foodxchange.com',
                password: 'password123',
                role: 'admin',
                firstName: 'Admin',
                lastName: 'User',
                verified: true
            }
        ];
        
        // Create users one by one
        for (const userData of testUsers) {
            const user = new User(userData);
            await user.save();
            console.log(`? Created user: ${user.email}`);
        }
        
        console.log('\n?? Test users created successfully!');
        console.log('\nTest credentials:');
        console.log('  - buyer@foodxchange.com / password123');
        console.log('  - seller@foodxchange.com / password123');
        console.log('  - admin@foodxchange.com / password123');
        
    } catch (error) {
        console.error('? Error:', error.message);
    } finally {
        await mongoose.connection.close();
        console.log('\n? Database connection closed');
    }
}

seedData();
