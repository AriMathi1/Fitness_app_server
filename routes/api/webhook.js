const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Payment = require('../../models/Payment');
const Booking = require('../../models/Booking');

const router = express.Router();

/**
 * @route   POST /api/webhook/stripe
 * @desc    Stripe webhook endpoint for payment events
 * @access  Public
 */
router.post('/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;
      
      try {
        // Update payment status
        const payment = await Payment.findOne({ 
          transactionId: paymentIntent.id 
        });
        
        if (payment) {
          payment.status = 'completed';
          payment.receiptUrl = paymentIntent.charges?.data[0]?.receipt_url || null;
          await payment.save();
          
          // Update booking payment status
          await Booking.findByIdAndUpdate(payment.booking, { 
            paymentStatus: 'paid' 
          });
          
          console.log(`Payment ${payment._id} marked as completed via webhook`);
        }
      } catch (error) {
        console.error('Error processing payment success webhook:', error);
      }
      break;
    }
    
    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object;
      
      try {
        // Update payment status
        const payment = await Payment.findOne({ 
          transactionId: paymentIntent.id 
        });
        
        if (payment) {
          payment.status = 'failed';
          payment.notes = paymentIntent.last_payment_error?.message || 'Payment failed';
          await payment.save();
          
          console.log(`Payment ${payment._id} marked as failed via webhook`);
        }
      } catch (error) {
        console.error('Error processing payment failure webhook:', error);
      }
      break;
    }
    
    case 'charge.refunded': {
      const charge = event.data.object;
      
      try {
        // Update payment status for this refund
        const payment = await Payment.findOne({
          transactionId: charge.payment_intent
        });
        
        if (payment) {
          payment.status = 'refunded';
          payment.notes = `Refunded via Stripe on ${new Date().toISOString()}`;
          await payment.save();
          
          // Update booking payment status
          await Booking.findByIdAndUpdate(payment.booking, { 
            paymentStatus: 'refunded' 
          });
          
          console.log(`Payment ${payment._id} marked as refunded via webhook`);
        }
      } catch (error) {
        console.error('Error processing refund webhook:', error);
      }
      break;
    }
    
    default:
      // Unexpected event type
      console.log(`Unhandled event type ${event.type}`);
  }
  
  // Return a 200 response to acknowledge receipt of the event
  res.status(200).json({received: true});
});

module.exports = router;