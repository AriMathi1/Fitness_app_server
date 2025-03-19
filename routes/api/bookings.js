const express = require('express');
const { check, validationResult } = require('express-validator');
const auth = require('../../middleware/auth');
const checkTrainerRole = require('../../middleware/trainer');
const Booking = require('../../models/Booking');
const Class = require('../../models/Class');
const router = express.Router();

router.post('/', [
  auth,
  [
    check('classId', 'Class ID is required').not().isEmpty(),
    check('date', 'Date is required').isISO8601().toDate(),
    check('startTime', 'Start time is required (HH:MM format)').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    check('endTime', 'End time is required (HH:MM format)').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { classId, date, startTime, endTime, notes } = req.body;

    const classDetails = await Class.findById(classId);
    if (!classDetails) {
      return res.status(404).json({ msg: 'Class not found' });
    }

    if (!classDetails.isActive) {
      return res.status(400).json({ msg: 'This class is not currently available for booking' });
    }

    const trainerId = classDetails.trainer;

    const newBooking = new Booking({
      user: req.user.id,
      class: classId,
      trainer: trainerId,
      date,
      startTime,
      endTime,
      notes
    });

    const booking = await newBooking.save();

    const populatedBooking = await Booking.findById(booking._id)
      .populate('class', 'title description type duration')
      .populate('trainer', 'name')
      .populate('user', 'name');

    res.status(201).json(populatedBooking);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const { status, upcoming } = req.query;
    
    let query = { user: req.user.id };
    
    if (status) {
      query.status = status;
    }
    
    if (upcoming === 'true') {
      query.date = { $gte: new Date() };
    }
    
    const bookings = await Booking.find(query)
      .populate('class', 'title type duration')
      .populate('trainer', 'name')
      .sort({ date: 1, startTime: 1 });
    
    res.json(bookings);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

router.get('/trainer', [auth, checkTrainerRole], async (req, res) => {
  try {
    const { status, upcoming } = req.query;
    
    let query = { trainer: req.user.id };
    
    if (status) {
      query.status = status;
    }
    
    if (upcoming === 'true') {
      query.date = { $gte: new Date() };
    }
    
    const bookings = await Booking.find(query)
      .populate('class', 'title type duration')
      .populate('user', 'name')
      .sort({ date: 1, startTime: 1 });
    
    res.json(bookings);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('class', 'title description type duration price')
      .populate('trainer', 'name')
      .populate('user', 'name');

    if (!booking) {
      return res.status(404).json({ msg: 'Booking not found' });
    }

    if (booking.user._id.toString() !== req.user.id && 
        booking.trainer._id.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized to access this booking' });
    }

    res.json(booking);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Booking not found' });
    }
    res.status(500).send('Server error');
  }
});

router.put('/:id', [
  auth,
  [
    check('status', 'Status is required').isIn(['cancelled'])
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    let booking = await Booking.findById(req.params.id)
      .populate('class', 'title')
      .populate('trainer', 'name')
      .populate('user', 'name');

    if (!booking) {
      return res.status(404).json({ msg: 'Booking not found' });
    }

    if (booking.user._id.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized to update this booking' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ msg: 'This booking is already cancelled' });
    }

    booking.status = 'cancelled';
    
    await booking.save();

    res.json(booking);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Booking not found' });
    }
    res.status(500).send('Server error');
  }
});


router.put('/trainer/:id', [
  auth,
  checkTrainerRole,
  [
    check('status', 'Status is required').isIn(['confirmed', 'cancelled'])
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    let booking = await Booking.findById(req.params.id)
      .populate('class', 'title')
      .populate('user', 'name');

    if (!booking) {
      return res.status(404).json({ msg: 'Booking not found' });
    }

    if (booking.trainer.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized to update this booking' });
    }

    if (booking.status !== 'pending') {
      return res.status(400).json({ 
        msg: `This booking is already ${booking.status}` 
      });
    }

    booking.status = req.body.status;
    if (req.body.notes) booking.notes = req.body.notes;

    await booking.save();

    res.json(booking);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Booking not found' });
    }
    res.status(500).send('Server error');
  }
});

module.exports = router;