const express = require('express');
const { check, validationResult } = require('express-validator');
const auth = require('../../middleware/auth');
const User = require('../../models/User');

const router = express.Router();


router.get('/', auth, async (req, res) => {
  try {

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


router.put('/', [
  auth,
  [
    
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
    
    let user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    
    const { 
      name, 
      email,
      availability
    } = req.body;

    
    if (name) user.name = name;
    if (email) user.email = email;
    if (availability) user.profile.availability = availability;

    
    if (user.userType === 'client') {
      updateClientProfile(user, req.body);
    } else if (user.userType === 'trainer') {
      updateTrainerProfile(user, req.body);
    }

    
    await user.save();
    
    
    res.json(user);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.status(500).send('Server error');
  }
});


function updateClientProfile(user, data) {
  const { fitnessPreferences, fitnessGoals } = data;
  
  if (fitnessPreferences) user.profile.fitnessPreferences = fitnessPreferences;
  if (fitnessGoals) user.profile.fitnessGoals = fitnessGoals;
}


function updateTrainerProfile(user, data) {
  const { 
    qualifications, 
    specialties, 
    teachingStyle, 
    bio 
  } = data;
  
  if (qualifications) user.profile.qualifications = qualifications;
  if (specialties) user.profile.specialties = specialties;
  if (teachingStyle) user.profile.teachingStyle = teachingStyle;
  if (bio) user.profile.bio = bio;
}

module.exports = router;