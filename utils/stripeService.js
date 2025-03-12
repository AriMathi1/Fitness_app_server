const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');

/**
 * Create a payment intent
 * @param {string} bookingId - The ID of the booking
 * @param {string} userId - The ID of the user making the payment
 * @param {string} paymentMethod - The payment method (e.g., 'card')
 * @returns {Object} - The payment intent
 */
const createPaymentIntent = async (bookingId, userId, paymentMethod) => {
  try {
    // Get booking details to determine amount
    const booking = await Booking.findById(bookingId).populate('class', 'price');
    
    if (!booking) {
      throw new Error('Booking not found');
    }
    
    // Check if booking belongs to user
    if (booking.user.toString() !== userId) {
      throw new Error('Unauthorized access to booking');
    }
    
    // Check if there's already a completed payment
    const existingPayment = await Payment.findOne({ 
      booking: bookingId,
      status: 'completed'
    });
    
    if (existingPayment) {
      throw new Error('Payment already completed for this booking');
    }
    
    // Create payment intent with Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(booking.class.price * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        bookingId,
        userId,
        classTitle: booking.class.title
      }
    });
    
    // Create local payment record
    const payment = new Payment({
      user: userId,
      booking: bookingId,
      amount: booking.class.price,
      paymentMethod,
      transactionId: paymentIntent.id,
      status: 'pending'
    });
    
    await payment.save();
    
    return {
      paymentId: payment._id,
      clientSecret: paymentIntent.client_secret,
      amount: booking.class.price
    };
  } catch (error) {
    console.error('Error creating payment intent:', error);
    throw error;
  }
};

/**
 * Confirm payment completion
 * @param {string} paymentIntentId - The Stripe payment intent ID
 * @returns {Object} - The updated payment record
 */
const confirmPayment = async (paymentIntentId) => {
  try {
    // Get payment details from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      throw new Error(`Payment not successful. Status: ${paymentIntent.status}`);
    }
    
    // Update local payment record
    const payment = await Payment.findOne({ transactionId: paymentIntentId });
    
    if (!payment) {
      throw new Error('Payment record not found');
    }
    
    payment.status = 'completed';
    payment.receiptUrl = paymentIntent.charges?.data[0]?.receipt_url || null;
    
    await payment.save();
    
    // Update booking payment status
    await Booking.findByIdAndUpdate(payment.booking, { 
      paymentStatus: 'paid',
      status: 'confirmed' 
    });

    const populatedPayment = await Payment.findById(payment._id)
      .populate('booking', 'date startTime endTime status paymentStatus')
      .populate({
        path: 'booking',
        populate: {
          path: 'class',
          select: 'title type'
        }
      });
    
    return payment;
  } catch (error) {
    console.error('Error confirming payment:', error);
    throw error;
  }
};

/**
 * Process refund for a payment
 * @param {string} paymentId - The ID of the payment to refund
 * @param {string} reason - The reason for refund
 * @returns {Object} - The refund details
 */
const processRefund = async (paymentId, reason) => {
  try {
    // Get payment details
    const payment = await Payment.findById(paymentId);
    
    if (!payment) {
      throw new Error('Payment not found');
    }
    
    if (payment.status !== 'completed') {
      throw new Error('Only completed payments can be refunded');
    }
    
    // Process refund with Stripe
    const refund = await stripe.refunds.create({
      payment_intent: payment.transactionId,
      reason: 'requested_by_customer'
    });
    
    // Update payment status
    payment.status = 'refunded';
    payment.notes = reason || 'Refund processed';
    
    await payment.save();
    
    // Update booking payment status
    await Booking.findByIdAndUpdate(payment.booking, { 
      paymentStatus: 'refunded' 
    });
    
    return {
      refundId: refund.id,
      paymentId: payment._id,
      amount: payment.amount,
      status: 'refunded'
    };
  } catch (error) {
    console.error('Error processing refund:', error);
    throw error;
  }
};

module.exports = {
  createPaymentIntent,
  confirmPayment,
  processRefund
};