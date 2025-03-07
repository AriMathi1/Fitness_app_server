const express = require('express');
const auth = require('../../middleware/auth');
const Class = require('../../models/Class');
const User = require('../../models/User');

const router = express.Router();

/**
 * @route   GET /api/recommendations/classes
 * @desc    Get personalized class recommendations
 * @access  Private
 */
router.get('/classes', auth, async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 5;
    
    // Get the user's profile to find preferences
    const user = await User.findById(req.user.id);
    
    // Base query for active classes
    const query = { isActive: true };
    
    // If user is a client and has fitness preferences, use them
    if (user.userType === 'client' && 
        user.profile && 
        user.profile.fitnessPreferences && 
        user.profile.fitnessPreferences.length > 0) {
      
      query.type = { $in: user.profile.fitnessPreferences };
    }
    
    // Get recommendations based on preferences (or all classes if no preferences)
    const recommendations = await Class.find(query)
      .populate('trainer', 'name profile.rating')
      .sort({ 'createdAt': -1 })
      .limit(limit);
    
    res.json(recommendations);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;