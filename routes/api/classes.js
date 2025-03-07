const express = require('express');
const { check, validationResult } = require('express-validator');
const auth = require('../../middleware/auth');
const checkTrainerRole = require('../../middleware/trainer');
const Class = require('../../models/Class');
const User = require('../../models/User');

const router = express.Router();

/**
 * @route   GET /api/classes
 * @desc    Get all classes with filtering options
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const { type, location, trainerId } = req.query;

    // Build filter object
    let filter = { isActive: true }; // Only show active classes by default

    // Add filters if provided
    if (type) filter.type = type;
    if (location) filter.location = location;
    if (trainerId) filter.trainer = trainerId;

    // Get classes matching the filter
    const classes = await Class.find(filter)
      .populate('trainer', 'name profile.rating')
      .sort({ createdAt: -1 });

    res.json(classes);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   GET /api/classes/:id
 * @desc    Get class by ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const classItem = await Class.findById(req.params.id)
      .populate('trainer', 'name profile.rating');

    if (!classItem) {
      return res.status(404).json({ msg: 'Class not found' });
    }

    res.json(classItem);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Class not found' });
    }
    res.status(500).send('Server error');
  }
});

/**
 * @route   POST /api/classes
 * @desc    Create a class
 * @access  Private (trainers only)
 */
router.post('/', [
  auth,
  checkTrainerRole,
  [
    check('title', 'Title is required').not().isEmpty(),
    check('description', 'Description is required').not().isEmpty(),
    check('type', 'Class type is required').not().isEmpty(),
    check('duration', 'Duration is required and must be a number').isNumeric(),
    check('price', 'Price is required and must be a number').isNumeric(),
    check('schedule', 'Schedule is required').isArray().not().isEmpty(),
    check('schedule.*.day', 'Each schedule must have a valid day').isIn([
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
    ]),
    check('schedule.*.startTime', 'Each schedule must have a valid start time (HH:MM format)')
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    check('schedule.*.endTime', 'Each schedule must have a valid end time (HH:MM format)')
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Create new class
    const newClass = new Class({
      trainer: req.user.id,
      title: req.body.title,
      description: req.body.description,
      type: req.body.type,
      duration: req.body.duration,
      price: req.body.price,
      schedule: req.body.schedule,
      location: req.body.location || 'Virtual'
    });

    // Save class
    const classItem = await newClass.save();
    res.json(classItem);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   PUT /api/classes/:id
 * @desc    Update a class
 * @access  Private (trainer only - and only their own classes)
 */
router.put('/:id', [
  auth,
  checkTrainerRole,
  [
    check('title', 'Title is required').optional().not().isEmpty(),
    check('description', 'Description is required').optional().not().isEmpty(),
    check('type', 'Class type is required').optional().not().isEmpty(),
    check('duration', 'Duration must be a number').optional().isNumeric(),
    check('price', 'Price must be a number').optional().isNumeric(),
    check('schedule', 'Schedule must be an array').optional().isArray(),
    check('schedule.*.day', 'Each schedule must have a valid day').optional().isIn([
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
    ]),
    check('schedule.*.startTime', 'Each schedule must have a valid start time (HH:MM format)')
      .optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    check('schedule.*.endTime', 'Each schedule must have a valid end time (HH:MM format)')
      .optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Find class
    let classItem = await Class.findById(req.params.id);

    // Check if class exists
    if (!classItem) {
      return res.status(404).json({ msg: 'Class not found' });
    }

    // Check if the trainer owns this class
    if (classItem.trainer.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized to update this class' });
    }

    // Fields to update
    const updateFields = {};
    
    // Only update fields that are sent in the request
    const allowedFields = [
      'title', 'description', 'type', 'duration', 
      'price', 'schedule', 'location', 'isActive'
    ];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateFields[field] = req.body[field];
      }
    });

    // Update class
    classItem = await Class.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true }
    ).populate('trainer', 'name profile.rating');

    res.json(classItem);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Class not found' });
    }
    res.status(500).send('Server error');
  }
});

/**
 * @route   DELETE /api/classes/:id
 * @desc    Delete a class
 * @access  Private (trainer only - and only their own classes)
 */
router.delete('/:id', [auth, checkTrainerRole], async (req, res) => {
  try {
    // Find class
    const classItem = await Class.findById(req.params.id);

    // Check if class exists
    if (!classItem) {
      return res.status(404).json({ msg: 'Class not found' });
    }

    // Check if the trainer owns this class
    if (classItem.trainer.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized to delete this class' });
    }

    await classItem.deleteOne({ _id: req.params.id });
    res.json({ msg: 'Class removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Class not found' });
    }
    res.status(500).send('Server error');
  }
});

/**
 * @route   GET /api/classes/trainer/:trainerId
 * @desc    Get all classes by a specific trainer
 * @access  Public
 */
router.get('/trainer/:trainerId', async (req, res) => {
  try {
    const classes = await Class.find({ 
      trainer: req.params.trainerId,
      isActive: true 
    }).populate('trainer', 'name profile.rating');

    res.json(classes);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Trainer not found' });
    }
    res.status(500).send('Server error');
  }
});


module.exports = router;