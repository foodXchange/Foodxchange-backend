// Test AI Services
import { initializeAIServices } from './services/ai';

async function testAIServices() {
    console.log('🧪 Testing FoodXchange AI Services...\n');
    
    try {
        // Initialize services
        const ai = await initializeAIServices();
        
        // Test 1: Supplier Matching
        console.log('📍 Test 1: Supplier Matching');
        const rfqData = {
            title: 'Organic Olive Oil',
            description: 'Looking for high-quality organic olive oil supplier',
            category: 'oils',
            certifications: ['Organic', 'ISO22000'],
            deliveryLocation: 'Tel Aviv, Israel'
        };
        
        const matchResult = await ai.supplierMatching.matchSuppliers(rfqData);
        console.log('Result:', matchResult.success ? '✅ Success' : '❌ Failed');
        
        // Test 2: Product Analysis
        console.log('\n📍 Test 2: Product Analysis');
        const productData = {
            name: 'Premium Extra Virgin Olive Oil',
            description: 'Cold-pressed organic olive oil from Spain',
            category: 'oils',
            price: 25.99,
            certifications: ['Organic', 'EU-Bio']
        };
        
        const analysisResult = await ai.productAnalysis.analyzeProduct(productData);
        console.log('Result:', analysisResult.success ? '✅ Success' : '❌ Failed');
        
        // Test 3: Document Processing (mock)
        console.log('\n📍 Test 3: Document Processing');
        console.log('Result: ⚠️  Skipped (requires document path)');
        
        console.log('\n✅ AI Services tests completed!');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    testAIServices()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { testAIServices };
