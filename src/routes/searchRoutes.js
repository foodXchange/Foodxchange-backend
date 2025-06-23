// src/routes/searchRoutes.js - CORRECTED VERSION
const express = require('express');
const router = express.Router();
const { Client } = require('@elastic/elasticsearch');

// Initialize Elasticsearch client
const esClient = new Client({
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200'
});

// Main search endpoint
router.get('/search', async (req, res) => {
  try {
    const { 
      query, 
      category, 
      subcategory,
      minPrice,
      maxPrice,
      page = 1, 
      limit = 20 
    } = req.query;
    
    console.log('🔍 Search request:', req.query);
    
    // Build Elasticsearch query
    const must = [];
    const filter = [];
    
    // Add search query if provided - FIXED TO USE TITLE FIELD
    if (query) {
      must.push({
        multi_match: {
          query: query,
          fields: ['title^3', 'description^2', 'tags'],  // FIXED: removed 'name', kept 'title'
          type: 'best_fields',
          fuzziness: 'AUTO'
        }
      });
    }
    
    // Add filters
    if (category) {
      filter.push({ term: { category: category.toLowerCase() } });
    }
    
    if (subcategory) {
      filter.push({ term: { subcategory: subcategory.toLowerCase() } });
    }
    
    if (minPrice || maxPrice) {
      const priceRange = { range: { price: {} } };
      if (minPrice) priceRange.range.price.gte = parseFloat(minPrice);
      if (maxPrice) priceRange.range.price.lte = parseFloat(maxPrice);
      filter.push(priceRange);
    }
    
    // Always filter by active status
    filter.push({ term: { status: 'active' } });
    
    // Build the final query
    const searchBody = {
      query: {
        bool: {
          must: must.length > 0 ? must : [{ match_all: {} }],
          filter
        }
      },
      from: (page - 1) * limit,
      size: parseInt(limit),
      sort: [
        { _score: { order: 'desc' } },
        { created_at: { order: 'desc', unmapped_type: 'date' } }
      ],
      aggs: {
        categories: {
          terms: { field: 'category', size: 10 }
        },
        price_ranges: {
          range: {
            field: 'price',
            ranges: [
              { key: 'under_1', to: 1 },
              { key: '1_to_5', from: 1, to: 5 },
              { key: '5_to_10', from: 5, to: 10 },
              { key: '10_to_50', from: 10, to: 50 },
              { key: 'over_50', from: 50 }
            ]
          }
        }
      }
    };
    
    // Execute search
    const searchResult = await esClient.search({
      index: 'foodxchange_products',
      body: searchBody
    });
    
    // Format response
    const response = {
      success: true,
      data: {
        total: searchResult.hits.total.value,
        hits: searchResult.hits.hits.map(hit => ({
          _id: hit._id,
          score: hit._score,
          ...hit._source
        })),
        aggregations: {
          categories: searchResult.aggregations.categories.buckets,
          price_ranges: searchResult.aggregations.price_ranges.buckets.map(bucket => ({
            key: bucket.key,
            count: bucket.doc_count,
            label: getPriceRangeLabel(bucket.key)
          }))
        },
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(searchResult.hits.total.value / limit)
      }
    };
    
    console.log(`✅ Search completed: ${searchResult.hits.total.value} results found`);
    res.json(response);
    
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed',
      error: error.message
    });
  }
});

// Autocomplete suggestions endpoint - FIXED TO USE TITLE
router.get('/search/suggestions', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.length < 2) {
      return res.json({ success: true, suggestions: [] });
    }
    
    const searchResult = await esClient.search({
      index: 'foodxchange_products',
      size: 10,
      body: {
        query: {
          multi_match: {
            query: query,
            fields: ['title'],  // FIXED: changed from 'name' to 'title'
            type: 'bool_prefix'
          }
        },
        _source: ['title']  // FIXED: changed from 'name' to 'title'
      }
    });
    
    const suggestions = [...new Set(searchResult.hits.hits.map(hit => hit._source.title))];  // FIXED: use title
    
    res.json({
      success: true,
      suggestions
    });
    
  } catch (error) {
    console.error('❌ Suggestions error:', error);
    res.json({ success: true, suggestions: [] });
  }
});

// Helper function for price range labels
function getPriceRangeLabel(key) {
  const labels = {
    'under_1': 'Under $1',
    '1_to_5': '$1 - $5',
    '5_to_10': '$5 - $10',
    '10_to_50': '$10 - $50',
    'over_50': 'Over $50'
  };
  return labels[key] || key;
}

module.exports = router;