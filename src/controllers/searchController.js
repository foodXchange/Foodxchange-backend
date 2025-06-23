// src/controllers/searchController.js
const searchService = require('../services/enhancedSearchService');
const { validationResult } = require('express-validator');

class SearchController {
  async search(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const searchParams = {
        ...req.query,
        userId: req.user?.id
      };

      console.log('🔍 Search request:', searchParams);

      const results = await searchService.search(searchParams);

      res.json({
        success: true,
        data: results,
        query: searchParams.query || '',
        filters: {
          category: searchParams.category,
          subcategory: searchParams.subcategory
        }
      });

    } catch (error) {
      console.error('Search controller error:', error);
      res.status(500).json({
        success: false,
        message: 'Search failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  async suggest(req, res) {
    try {
      const { q, limit = 10 } = req.query;
      
      if (!q || q.length < 2) {
        return res.json({
          success: true,
          data: []
        });
      }

      const suggestions = await searchService.suggest(q, parseInt(limit));
      
      res.json({
        success: true,
        data: suggestions,
        query: q
      });

    } catch (error) {
      console.error('Suggestions error:', error);
      res.status(500).json({
        success: false,
        message: 'Suggestions failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  async indexProduct(req, res) {
    try {
      const productData = req.body;
      
      const result = await searchService.indexProduct(productData);
      
      res.json({
        success: true,
        data: result,
        message: 'Product indexed successfully'
      });

    } catch (error) {
      console.error('Index product error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to index product',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
}

module.exports = new SearchController();
