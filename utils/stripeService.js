const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');

const createPaymentIntent = async (bookingId, userId, paymentMethod) => {
  try {
    const booking = await Booking.findById(bookingId).populate('class', 'price');
    
    if (!booking) {
      throw new Error('Booking not found');
    }
    
    if (booking.user.toString() !== userId) {
      throw new Error('Unauthorized access to booking');
    }
    
    const existingPayment = await Payment.findOne({ 
      booking: bookingId,
      status: 'completed'
    });
    
    if (existingPayment) {
      throw new Error('Payment already completed for this booking');
    }
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(booking.class.price * 100),
      currency: 'usd',
      metadata: {
        bookingId,
        userId,
        classTitle: booking.class.title
      }
    });
    
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


const confirmPayment = async (paymentIntentId) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      throw new Error(`Payment not successful. Status: ${paymentIntent.status}`);
    }
    
    const payment = await Payment.findOne({ transactionId: paymentIntentId });
    
    if (!payment) {
      throw new Error('Payment record not found');
    }
    
    payment.status = 'completed';
    payment.receiptUrl = paymentIntent.charges?.data[0]?.receipt_url || null;
    
    await payment.save();
    
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


const processRefund = async (paymentId, reason) => {
  try {
    const payment = await Payment.findById(paymentId);
    
    if (!payment) {
      throw new Error('Payment not found');
    }
    
    if (payment.status !== 'completed') {
      throw new Error('Only completed payments can be refunded');
    }
    
    const refund = await stripe.refunds.create({
      payment_intent: payment.transactionId,
      reason: 'requested_by_customer'
    });
    
    payment.status = 'refunded';
    payment.notes = reason || 'Refund processed';
    
    await payment.save();
    
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