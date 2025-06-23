const router = require('express').Router();
const auth = require('../middleware/auth');
const User = require('../models/User');

// Get current user profile
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('-password')
      .populate('company');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update user profile
router.patch('/me', auth, async (req, res) => {
  try {
    const updates = Object.keys(req.body);
    const allowedUpdates = ['name', 'phone', 'preferences'];
    const isValidOperation = updates.every(update => allowedUpdates.includes(update));
    
    if (!isValidOperation) {
      return res.status(400).json({ message: 'Invalid updates' });
    }
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    updates.forEach(update => user[update] = req.body[update]);
    await user.save();
    
    res.json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get all users (admin only)
router.get('/', auth, async (req, res) => {
  try {
    // TODO: Add admin check
    const users = await User.find()
      .select('-password')
      .populate('company');
    
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
