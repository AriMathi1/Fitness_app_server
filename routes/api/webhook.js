const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Payment = require('../../models/Payment');
const Booking = require('../../models/Booking');

const router = express.Router();

const stripeWebhookHandler = async (req, res) => {
  const signature = req.headers['stripe-signature'];
  
  let event;
  
  try {
    console.log('Processing webhook with signature:', signature?.substring(0, 20) + '...');
    
    event = stripe.webhooks.constructEvent(
      req.body, 
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    console.log('Webhook verified successfully:', event.type);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;
      console.log('Processing payment_intent.succeeded:', paymentIntent.id);
      
      try {
        const payment = await Payment.findOne({ 
          transactionId: paymentIntent.id 
        });
        
        if (payment) {
          payment.status = 'completed';
          payment.receiptUrl = paymentIntent.charges?.data[0]?.receipt_url || null;
          await payment.save();
          
          await Booking.findByIdAndUpdate(payment.booking, { 
            paymentStatus: 'paid' 
          });
          
          console.log(`Payment ${payment._id} marked as completed via webhook`);
        } else {
          console.log(`Payment record not found for intent: ${paymentIntent.id}`);
        }
      } catch (error) {
        console.error('Error processing payment success webhook:', error);
      }
      break;
    }
    
    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object;
      console.log('Processing payment_intent.payment_failed:', paymentIntent.id);
      
      try {
        const payment = await Payment.findOne({ 
          transactionId: paymentIntent.id 
        });
        
        if (payment) {
          payment.status = 'failed';
          payment.notes = paymentIntent.last_payment_error?.message || 'Payment failed';
          await payment.save();
          
          console.log(`Payment ${payment._id} marked as failed via webhook`);
        } else {
          console.log(`Payment record not found for failed intent: ${paymentIntent.id}`);
        }
      } catch (error) {
        console.error('Error processing payment failure webhook:', error);
      }
      break;
    }
    
    case 'charge.refunded': {
      const charge = event.data.object;
      console.log('Processing charge.refunded for payment intent:', charge.payment_intent);
      
      try {
        const payment = await Payment.findOne({
          transactionId: charge.payment_intent
        });
        
        if (payment) {
          payment.status = 'refunded';
          payment.notes = `Refunded via Stripe on ${new Date().toISOString()}`;
          await payment.save();
          
          await Booking.findByIdAndUpdate(payment.booking, { 
            paymentStatus: 'refunded' 
          });
          
          console.log(`Payment ${payment._id} marked as refunded via webhook`);
        } else {
          console.log(`Payment record not found for refund of intent: ${charge.payment_intent}`);
        }
      } catch (error) {
        console.error('Error processing refund webhook:', error);
      }
      break;
    }
    
    default:
      console.log(`Unhandled event type ${event.type}`);
  }
  
  res.status(200).json({received: true});
};

router.post('/stripe', express.raw({type: 'application/json'}), stripeWebhookHandler);

module.exports = router;
module.exports.stripe = stripeWebhookHandler;