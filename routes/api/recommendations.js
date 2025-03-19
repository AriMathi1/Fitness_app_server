const express = require('express');
const auth = require('../../middleware/auth');
const Class = require('../../models/Class');
const User = require('../../models/User');

const router = express.Router();

router.get('/classes', auth, async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 5;
    
    const user = await User.findById(req.user.id);
    
    const query = { isActive: true };
    
    if (user.userType === 'client' && 
        user.profile && 
        user.profile.fitnessPreferences && 
        user.profile.fitnessPreferences.length > 0) {
      
      query.type = { $in: user.profile.fitnessPreferences };
    }
    
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