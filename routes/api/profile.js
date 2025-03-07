// Place in routes/api/profile.js
const express = require('express');
const { check, validationResult } = require('express-validator');
const auth = require('../../middleware/auth');
const User = require('../../models/User');

const router = express.Router();

/**
 * @route   GET /api/profile
 * @desc    Get current user's profile
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    // Find user by ID (from auth middleware) and exclude password
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   PUT /api/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/', [
  auth,
  [
    // Basic validation for shared fields
    check('name', 'Name is required').optional().not().isEmpty(),
    check('email', 'Please include a valid email').optional().isEmail(),
    check('availability', 'Availability must be an array').optional().isArray()
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Find user
    let user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // Extract basic fields that can be updated
    const { 
      name, 
      email,
      availability
    } = req.body;

    // Update basic user fields if provided
    if (name) user.name = name;
    if (email) user.email = email;
    if (availability) user.profile.availability = availability;

    // Handle user type specific profile updates
    if (user.userType === 'client') {
      updateClientProfile(user, req.body);
    } else if (user.userType === 'trainer') {
      updateTrainerProfile(user, req.body);
    }

    // Save updated user
    await user.save();
    
    // Return updated user (without password)
    res.json(user);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.status(500).send('Server error');
  }
});

/**
 * Update client-specific profile fields
 */
function updateClientProfile(user, data) {
  const { fitnessPreferences, fitnessGoals } = data;
  
  // Update client-specific fields if provided
  if (fitnessPreferences) user.profile.fitnessPreferences = fitnessPreferences;
  if (fitnessGoals) user.profile.fitnessGoals = fitnessGoals;
}

/**
 * Update trainer-specific profile fields
 */
function updateTrainerProfile(user, data) {
  const { 
    qualifications, 
    specialties, 
    teachingStyle, 
    bio 
  } = data;
  
  // Update trainer-specific fields if provided
  if (qualifications) user.profile.qualifications = qualifications;
  if (specialties) user.profile.specialties = specialties;
  if (teachingStyle) user.profile.teachingStyle = teachingStyle;
  if (bio) user.profile.bio = bio;
}

module.exports = router;