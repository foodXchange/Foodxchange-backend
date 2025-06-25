const { MongoClient } = require('mongodb');

async function checkDatabase() {
    const client = new MongoClient('mongodb://localhost:27017');
    try {
        await client.connect();
        const db = client.db('foodxchange');
        
        console.log('\n?? FoodXchange Database Status:\n');
        
        const collections = await db.listCollections().toArray();
        for (const col of collections) {
            const count = await db.collection(col.name).countDocuments();
            console.log(`   ${col.name}: ${count} documents`);
        }
        
        // Show sample data
        console.log('\n?? Sample Products:');
        const products = await db.collection('products').find({}).limit(3).toArray();
        products.forEach(p => console.log(`   - ${p.name} ($${p.price})`));
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.close();
    }
}

checkDatabase();
