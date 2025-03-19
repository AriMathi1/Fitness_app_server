const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { check, validationResult } = require('express-validator');
const User = require('../../models/User');
const crypto = require('crypto');
const auth = require('../../middleware/auth');
const sendEmail = require('../../utils/sendEmail');

const router = express.Router();

router.post(
  '/register',
  [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password must be at least 8 characters').isLength({ min: 8 }),
    check('name', 'Name is required').not().isEmpty(),
    check('userType', 'User type is required').isIn(['client', 'trainer'])
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, userType, fitnessPreferences, fitnessGoals, availability } = req.body;

    try {
      let user = await User.findOne({ email });
      if (user) {
        return res.status(400).json({ errors: [{ msg: 'User already exists' }] });
      }

      user = new User({
        name,
        email,
        password,
        userType,
        profile: {
          availability: availability || [],
          
          ...(userType === 'client' && {
            fitnessPreferences: fitnessPreferences || [],
            fitnessGoals: fitnessGoals || []
          }),
          
          ...(userType === 'trainer' && {
            qualifications: [],
            specialties: [],
            teachingStyle: '',
            bio: ''
          })
        }
      });

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);

      await user.save();

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

router.post(
  '/login',
  [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password is required').exists()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      let user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ errors: [{ msg: 'Invalid credentials' }] });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ errors: [{ msg: 'Invalid credentials' }] });
      }

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

      const resetToken = crypto.randomBytes(20).toString('hex');

      user.resetPasswordToken = resetToken;
      user.resetPasswordExpire = Date.now() + 3600000;

      await user.save();
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

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

router.post(
  '/reset-password/:resetToken',
  [
    check('password', 'Password must be at least 8 characters').isLength({ min: 8 })
  ],
  async (req, res) => {
    console.log('Reset token received:', req.params.resetToken);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const resetToken = req.params.resetToken;
    const { password } = req.body;

    try {
      const user = await User.findOne({
        resetPasswordToken: resetToken,
        resetPasswordExpire: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({ msg: 'Invalid or expired token' });
      }
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