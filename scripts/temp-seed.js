// test-search-complete.js
require('dotenv').config();
const searchService = require('./src/services/enhancedSearchService');

async function testCompleteSearch() {
  console.log('🧪 Testing Complete FoodXchange Search System\n');

  try {
    // 1. Add test products
    console.log('1️⃣ Adding test products...');
    
    const testProducts = [
      {
        projectId: 'wheat-001',
        title: 'Premium Organic Wheat from India',
        description: 'High-quality organic wheat, certified by USDA. Perfect for bread making.',
        category: 'grains',
        subcategory: 'wheat',
        tags: ['organic', 'premium', 'india', 'wheat', 'bread'],
        status: 'active',
        visibility: 'public',
        viewCount: 150,
        proposalCount: 5,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        projectId: 'rice-001',
        title: 'Basmati Rice Premium Quality',
        description: 'Aromatic basmati rice from Punjab, India. Long grain, aged rice.',
        category: 'grains',
        subcategory: 'rice',
        tags: ['basmati', 'premium', 'aromatic', 'rice', 'punjab'],
        status: 'active',
        visibility: 'public',
        viewCount: 200,
        proposalCount: 8,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        projectId: 'corn-001',
        title: 'Organic Corn (Maize) from USA',
        description: 'Yellow corn, organic certified, suitable for animal feed and processing.',
        category: 'grains',
        subcategory: 'corn',
        tags: ['organic', 'corn', 'maize', 'usa', 'feed'],
        status: 'active',
        visibility: 'public',
        viewCount: 75,
        proposalCount: 3,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    // Index test products
    for (const product of testProducts) {
      await searchService.indexProduct(product);
    }
    console.log('✅ Test products added');

    // 2. Test basic search
    console.log('\n2️⃣ Testing basic search...');
    const searchResults = await searchService.search({
      query: 'wheat',
      page: 1,
      limit: 10
    });
    console.log(`✅ Search for "wheat": ${searchResults.total} results found`);
    searchResults.hits.forEach(hit => {
      console.log(`   - ${hit.title} (score: ${hit.score.toFixed(2)})`);
    });

    // 3. Test category search
    console.log('\n3️⃣ Testing category search...');
    const categoryResults = await searchService.search({
      category: 'grains',
      page: 1,
      limit: 10
    });
    console.log(`✅ Search category "grains": ${categoryResults.total} results found`);

    // 4. Test suggestions
    console.log('\n4️⃣ Testing autocomplete suggestions...');
    const suggestions = await searchService.suggest('whe');
    console.log(`✅ Suggestions for "whe": ${suggestions.length} found`);
    suggestions.forEach(suggestion => {
      console.log(`   - ${suggestion.text} (${suggestion.category})`);
    });

    // 5. Test synonym search (corn = maize)
    console.log('\n5️⃣ Testing synonym search...');
    const synonymResults = await searchService.search({
      query: 'maize',
      page: 1,
      limit: 10
    });
    console.log(`✅ Search for "maize": ${synonymResults.total} results found`);
    synonymResults.hits.forEach(hit => {
      console.log(`   - ${hit.title}`);
    });

    console.log('\n🎉 All search tests completed successfully!');

  } catch (error) {
    console.error('\n❌ Search test failed:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

testCompleteSearch();
