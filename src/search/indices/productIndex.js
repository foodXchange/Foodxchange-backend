// src/search/indices/productIndex.js

const productMapping = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 1,
    analysis: {
      analyzer: {
        food_analyzer: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'food_synonyms']
        }
      },
      filter: {
        food_synonyms: {
          type: 'synonym',
          synonyms: [
            'corn,maize,sweetcorn',
            'wheat,grain,cereal',
            'rice,paddy',
            'milk,dairy,lactose',
            'meat,protein,flesh',
            'organic,natural,bio',
            'sugar,sweetener,sucrose',
            'oil,fat,grease'
          ]
        }
      }
    }
  },
  mappings: {
    properties: {
      projectId: { type: 'keyword' },
      title: { 
        type: 'text', 
        analyzer: 'food_analyzer',
        fields: { keyword: { type: 'keyword' } }
      },
      description: { type: 'text', analyzer: 'food_analyzer' },
      category: { type: 'keyword' },
      subcategory: { type: 'keyword' },
      tags: { type: 'keyword' },
      certifications: { type: 'keyword' },
      status: { type: 'keyword' },
      visibility: { type: 'keyword' },
      viewCount: { type: 'integer' },
      proposalCount: { type: 'integer' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' }
    }
  }
};

const createProductIndex = async (esClient, indexName = 'foodxchange_products') => {
  try {
    const exists = await esClient.indices.exists({ index: indexName });
    
    if (exists) {
      console.log(`Index ${indexName} already exists`);
      return false;
    }
    
    await esClient.indices.create({
      index: indexName,
      body: productMapping
    });
    
    console.log(`✅ Index ${indexName} created successfully`);
    return true;
  } catch (error) {
    console.error(`Error creating index ${indexName}:`, error);
    throw error;
  }
};

module.exports = {
  productMapping,
  createProductIndex
};
