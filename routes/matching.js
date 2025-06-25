const express = require('express');
const router = express.Router();
const { MatchingProfile, MatchResult } = require('../models/matching/MatchingModel');
const authMiddleware = require('../middleware/auth');

// Get or create matching profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    let profile = await MatchingProfile.findOne({ buyer: req.user._id });
    
    if (!profile) {
      profile = new MatchingProfile({
        buyer: req.user._id,
        preferences: {},
        matchingWeights: {}
      });
      await profile.save();
    }
    
    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update matching preferences
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const profile = await MatchingProfile.findOneAndUpdate(
      { buyer: req.user._id },
      { 
        preferences: req.body.preferences,
        matchingWeights: req.body.weights,
        lastUpdated: Date.now()
      },
      { new: true, upsert: true }
    );
    
    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Run smart matching algorithm
router.post('/run', authMiddleware, async (req, res) => {
  try {
    const profile = await MatchingProfile.findOne({ buyer: req.user._id });
    if (!profile) {
      return res.status(404).json({ message: 'Matching profile not found' });
    }
    
    // Smart matching algorithm (simplified version)
    const suppliers = await User.find({ 
      role: 'supplier',
      verified: true,
      'products.category': { $in: profile.preferences.categories }
    }).populate('products');
    
    const matches = [];
    
    for (const supplier of suppliers) {
      let matchScore = 0;
      const factors = {};
      
      // Price matching
      const priceMatch = calculatePriceMatch(supplier, profile);
      matchScore += priceMatch * (profile.matchingWeights.price / 100);
      factors.priceMatch = priceMatch;
      
      // Certification matching
      const certMatch = calculateCertificationMatch(supplier, profile);
      matchScore += certMatch * (profile.matchingWeights.certifications / 100);
      factors.certificationMatch = certMatch;
      
      // Add more matching factors...
      
      if (matchScore > 60) { // Threshold for matches
        const matchResult = new MatchResult({
          buyer: req.user._id,
          supplier: supplier._id,
          matchScore: Math.round(matchScore),
          factors: factors
        });
        
        await matchResult.save();
        matches.push(matchResult);
      }
    }
    
    // Sort by match score
    matches.sort((a, b) => b.matchScore - a.matchScore);
    
    res.json({
      totalMatches: matches.length,
      matches: matches.slice(0, 20) // Top 20 matches
    });
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Helper functions
function calculatePriceMatch(supplier, profile) {
  // Implement price matching logic
  return Math.random() * 100; // Placeholder
}

function calculateCertificationMatch(supplier, profile) {
  // Implement certification matching logic
  return Math.random() * 100; // Placeholder
}

module.exports = router;
