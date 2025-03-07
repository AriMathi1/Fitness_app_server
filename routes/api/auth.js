// Required packages
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { check, validationResult } = require('express-validator');
const User = require('../../models/User');
const crypto = require('crypto');
const auth = require('../../middleware/auth');
const sendEmail = require('../../utils/sendEmail');

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register user (client or trainer)
// @access  Public
router.post(
  '/register',
  [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password must be at least 8 characters').isLength({ min: 8 }),
    check('name', 'Name is required').not().isEmpty(),
    check('userType', 'User type is required').isIn(['client', 'trainer'])
  ],
  async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, userType, fitnessPreferences, fitnessGoals, availability } = req.body;

    try {
      // Check if user already exists
      let user = await User.findOne({ email });
      if (user) {
        return res.status(400).json({ errors: [{ msg: 'User already exists' }] });
      }

      // Create user object based on userType
      user = new User({
        name,
        email,
        password,
        userType,
        profile: {
          // Shared profile fields
          availability: availability || [],
          
          // Client-specific fields
          ...(userType === 'client' && {
            fitnessPreferences: fitnessPreferences || [],
            fitnessGoals: fitnessGoals || []
          }),
          
          // Trainer-specific fields
          ...(userType === 'trainer' && {
            qualifications: [],
            specialties: [],
            teachingStyle: '',
            bio: ''
          })
        }
      });

      // Encrypt password
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);

      // Save user to database
      await user.save();

      // Generate JWT
      const payload = {
        user: {
          id: user.id,
          userType: user.userType
        }
      };

      jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: '7d' }, 
        (err, token) => {
          if (err) throw err;
          res.json({ token });
        }
      );

    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post(
  '/login',
  [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password is required').exists()
  ],
  async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // Check if user exists
      let user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ errors: [{ msg: 'Invalid credentials' }] });
      }

      // Verify password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ errors: [{ msg: 'Invalid credentials' }] });
      }

      // Generate JWT
      const payload = {
        user: {
          id: user.id,
          userType: user.userType
        }
      };

      jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: '7d' },
        (err, token) => {
          if (err) throw err;
          res.json({ 
            token,
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              userType: user.userType
            }
          });
        }
      );

    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post(
  '/forgot-password',
  [
    check('email', 'Please include a valid email').isEmail()
  ],
  async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    try {
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({ msg: 'User not found' });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(20).toString('hex');

      // Set token expiration (1 hour)
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpire = Date.now() + 3600000;

      await user.save();

      // Create reset URL
      const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;

      // Email content
      const message = `You are receiving this email because you (or someone else) has requested a password reset. Please click on the following link to reset your password: \n\n ${resetUrl}`;

      await sendEmail({
        email: user.email,
        subject: 'Password Reset',
        message
      });

      res.json({ msg: 'Password reset email sent' });

    } catch (err) {
      console.error(err.message);
      try {
        const userToUpdate = await User.findOne({ email });
        if (userToUpdate) {
          userToUpdate.resetPasswordToken = undefined;
          userToUpdate.resetPasswordExpire = undefined;
          await userToUpdate.save();
        }
      } catch (cleanupErr) {
        console.error('Error during cleanup:', cleanupErr.message);
      }
      res.status(500).send('Server error');
    }
  }
);

// @route   POST /api/auth/reset-password/:resetToken
// @desc    Reset password
// @access  Public
router.post(
  '/reset-password/:resetToken',
  [
    check('password', 'Password must be at least 8 characters').isLength({ min: 8 })
  ],
  async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Get token from params
    const resetToken = req.params.resetToken;
    const { password } = req.body;

    try {
      // Find user with valid token
      const user = await User.findOne({
        resetPasswordToken: resetToken,
        resetPasswordExpire: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({ msg: 'Invalid or expired token' });
      }

      // Update password
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;

      await user.save();

      res.json({ msg: 'Password updated successfully' });

    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;