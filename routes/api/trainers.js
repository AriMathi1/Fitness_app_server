const express = require('express');
const { check, validationResult } = require('express-validator');
const auth = require('../../middleware/auth');
const User = require('../../models/User');
const Review = require('../../models/Review');
const checkTrainerRole = require('../../middleware/trainer');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { specialty, availability, rating } = req.query;
    
    let query = { userType: 'trainer' };
    
    if (specialty) {
      query['profile.specialties'] = { $in: [specialty] };
    }
    
    if (rating) {
      query['profile.rating'] = { $gte: parseFloat(rating) };
    }
    
    let trainers = await User.find(query)
      .select('-password')
      .sort({ 'profile.rating': -1 });
    
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

router.get('/:id', async (req, res) => {
  try {
    const trainer = await User.findById(req.params.id)
      .select('-password');
    
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

router.get('/:id/reviews', async (req, res) => {
  try {
    const trainer = await User.findById(req.params.id);
    
    if (!trainer || trainer.userType !== 'trainer') {
      return res.status(404).json({ msg: 'Trainer not found' });
    }
    
    const reviews = await Review.find({ trainerId: req.params.id })
      .sort({ createdAt: -1 }); 
    
    res.json(reviews);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Trainer not found' });
    }
    res.status(500).send('Server error');
  }
});

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
    const user = await User.findById(req.user.id);
    
    if (!user || user.userType !== 'client') {
      return res.status(403).json({ msg: 'Only clients can leave reviews' });
    }
    
    const trainer = await User.findById(req.params.id);
    
    if (!trainer || trainer.userType !== 'trainer') {
      return res.status(404).json({ msg: 'Trainer not found' });
    }
    
    const { rating, comment } = req.body;
    
    const newReview = new Review({
      trainerId: req.params.id,
      clientId: req.user.id,
      clientName: user.name,
      rating,
      comment
    });
    
    await newReview.save();
    
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
    const review = await Review.findById(req.params.reviewId);
    
    if (!review) {
      return res.status(404).json({ msg: 'Review not found' });
    }
    
    if (review.trainerId.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'Unauthorized: Trainers can only respond to their own reviews' });
    }
    
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