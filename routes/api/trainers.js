// Place in routes/api/trainers.js
const express = require('express');
const { check, validationResult } = require('express-validator');
const auth = require('../../middleware/auth');
const User = require('../../models/User');
const Review = require('../../models/Review');
const checkTrainerRole = require('../../middleware/trainer');

const router = express.Router();

/**
 * @route   GET /api/trainers
 * @desc    Get all trainers with optional filtering
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    // Extract query parameters for filtering
    const { specialty, availability, rating } = req.query;
    
    // Base query to find all trainers
    let query = { userType: 'trainer' };
    
    // Add filters if provided
    if (specialty) {
      query['profile.specialties'] = { $in: [specialty] };
    }
    
    if (rating) {
      query['profile.rating'] = { $gte: parseFloat(rating) };
    }
    
    // Find trainers matching the query, excluding password
    let trainers = await User.find(query)
      .select('-password')
      .sort({ 'profile.rating': -1 }); // Sort by rating descending
    
    // If availability filter is provided, filter in memory
    // (Complex time-based filtering might be better handled in-memory)
    if (availability) {
      const [day, startTime] = availability.split(',');
      trainers = trainers.filter(trainer => 
        trainer.profile.availability.some(slot => 
          slot.day === day && slot.startTime <= startTime && slot.endTime > startTime
        )
      );
    }
    
    res.json(trainers);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   GET /api/trainers/:id
 * @desc    Get trainer profile by ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    // Find trainer by ID
    const trainer = await User.findById(req.params.id)
      .select('-password');
    
    // Check if trainer exists and is of type 'trainer'
    if (!trainer || trainer.userType !== 'trainer') {
      return res.status(404).json({ msg: 'Trainer not found' });
    }
    
    res.json(trainer);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Trainer not found' });
    }
    res.status(500).send('Server error');
  }
});

/**
 * @route   GET /api/trainers/:id/reviews
 * @desc    Get reviews for a trainer
 * @access  Public
 */
router.get('/:id/reviews', async (req, res) => {
  try {
    // Find trainer by ID to verify they exist
    const trainer = await User.findById(req.params.id);
    
    if (!trainer || trainer.userType !== 'trainer') {
      return res.status(404).json({ msg: 'Trainer not found' });
    }
    
    // Get reviews for this trainer
    const reviews = await Review.find({ trainerId: req.params.id })
      .sort({ createdAt: -1 }); // Most recent first
    
    res.json(reviews);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Trainer not found' });
    }
    res.status(500).send('Server error');
  }
});

/**
 * @route   POST /api/trainers/:id/reviews
 * @desc    Add review for a trainer
 * @access  Private (only clients can review)
 */
router.post('/:id/reviews', [
  auth,
  [
    check('rating', 'Rating is required and must be between 1-5')
      .isInt({ min: 1, max: 5 }),
    check('comment', 'Comment is required').not().isEmpty()
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Get current user to verify they're a client
    const user = await User.findById(req.user.id);
    
    if (!user || user.userType !== 'client') {
      return res.status(403).json({ msg: 'Only clients can leave reviews' });
    }
    
    // Find trainer
    const trainer = await User.findById(req.params.id);
    
    if (!trainer || trainer.userType !== 'trainer') {
      return res.status(404).json({ msg: 'Trainer not found' });
    }
    
    // Create new review
    const { rating, comment } = req.body;
    
    const newReview = new Review({
      trainerId: req.params.id,
      clientId: req.user.id,
      clientName: user.name,
      rating,
      comment
    });
    
    await newReview.save();
    
    // Update trainer's average rating
    const allReviews = await Review.find({ trainerId: req.params.id });
    const averageRating = allReviews.reduce((acc, review) => acc + review.rating, 0) / allReviews.length;
    
    trainer.profile.rating = averageRating;
    trainer.profile.reviewCount = allReviews.length;
    
    await trainer.save();
    
    res.json(newReview);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Trainer not found' });
    }
    res.status(500).send('Server error');
  }
});

/**
 * @route   PUT /api/trainers/reviews/:reviewId/respond
 * @desc    Trainer responds to a review
 * @access  Private (trainer only)
 */
router.put('/reviews/:reviewId/respond', [
  auth,
  checkTrainerRole,
  [
    check('response', 'Response is required').not().isEmpty()
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Find the review
    const review = await Review.findById(req.params.reviewId);
    
    if (!review) {
      return res.status(404).json({ msg: 'Review not found' });
    }
    
    // Verify the trainer is responding to their own review
    if (review.trainerId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Unauthorized: Trainers can only respond to their own reviews' });
    }
    
    // Update the review with the trainer's response
    review.trainerResponse = req.body.response;
    await review.save();
    
    res.json(review);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Review not found' });
    }
    res.status(500).send('Server error');
  }
});

module.exports = router;