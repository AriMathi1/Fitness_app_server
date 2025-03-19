const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  trainerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  clientName: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    required: true
  },
  trainerResponse: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

ReviewSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

ReviewSchema.index({ trainerId: 1, clientId: 1 }, { unique: true });

module.exports = mongoose.model('Review', ReviewSchema);