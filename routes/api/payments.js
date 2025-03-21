const express = require('express');
const { check, validationResult } = require('express-validator');
const auth = require('../../middleware/auth');
const checkTrainerRole = require('../../middleware/trainer');
const Payment = require('../../models/Payment');
const Booking = require('../../models/Booking');
const { createPaymentIntent, confirmPayment, processRefund } = require('../../utils/stripeService');

const router = express.Router();

router.post('/create-intent', [
  auth,
  [
    check('bookingId', 'Booking ID is required').not().isEmpty(),
    check('paymentMethod', 'Payment method is required').not().isEmpty()
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { bookingId, paymentMethod } = req.body;
    
    const paymentIntent = await createPaymentIntent(
      bookingId, 
      req.user.id,
      paymentMethod
    );
    
    res.json(paymentIntent);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: err.message || 'Server error' });
  }
});

router.post('/confirm', [
  auth,
  [
    check('paymentIntentId', 'Payment intent ID is required').not().isEmpty()
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { paymentIntentId } = req.body;
    
    const payment = await confirmPayment(paymentIntentId);
    
    res.json(payment);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: err.message || 'Server error' });
  }
});

router.post('/refund', [
  auth,
  [
    check('paymentId', 'Payment ID is required').not().isEmpty()
  ]
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { paymentId, reason } = req.body;
    
    const payment = await Payment.findById(paymentId);
    
    if (!payment) {
      return res.status(404).json({ msg: 'Payment not found' });
    }
    
    if (payment.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized to process this refund' });
    }
    
    const refund = await processRefund(paymentId, reason);
    
    res.json(refund);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: err.message || 'Server error' });
  }
});

router.get('/history', auth, async (req, res) => {
  try {
    const payments = await Payment.find({ user: req.user.id })
      .populate('booking', 'date startTime endTime')
      .populate({
        path: 'booking',
        populate: {
          path: 'class',
          select: 'title type'
        }
      })
      .sort({ createdAt: -1 });
    
    res.json(payments);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('booking', 'date startTime endTime status')
      .populate({
        path: 'booking',
        populate: {
          path: 'class',
          select: 'title type'
        }
      })
      .populate({
        path: 'booking',
        populate: {
          path: 'trainer',
          select: 'name'
        }
      });
    
    if (!payment) {
      return res.status(404).json({ msg: 'Payment not found' });
    }
    
    if (payment.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized to access this payment' });
    }
    
    res.json(payment);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Payment not found' });
    }
    res.status(500).send('Server error');
  }
});

module.exports = router;