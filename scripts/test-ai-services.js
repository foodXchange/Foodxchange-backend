// AI Services Test Script
const aiService = require('../src/services/ai/azureAIService');
const supplierMatchingService = require('../src/services/ai/supplierMatchingService');

async function testAIServices() {
  console.log('🧪 Testing FoodXchange AI Services');
  console.log('===================================');
  
  try {
    // Initialize AI services
    await aiService.initialize();
    console.log('✅ AI services initialized');
    
    // Test RFQ analysis
    const testRFQ = "Seeking 5000kg premium organic San Marzano tomatoes from certified Italian suppliers. Must have EU Organic certification, HACCP compliance, and DOP certification.";
    
    console.log('\n📋 Testing RFQ Analysis...');
    const rfqAnalysis = await supplierMatchingService.analyzeRFQ(testRFQ);
    
    console.log('Key Phrases:', rfqAnalysis.keyPhrases.slice(0, 5));
    console.log('Sentiment:', rfqAnalysis.sentiment.overall);
    console.log('Requirements:', Object.keys(rfqAnalysis.requirements));
    
    console.log('\n✅ AI Services Test Completed Successfully!');
    
  } catch (error) {
    console.error('❌ AI Services Test Failed:', error);
  }
}

testAIServices();
