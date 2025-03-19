const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  userType: {
    type: String,
    enum: ['client', 'trainer'],
    required: true
  },
  profile: {
    availability: [{
      day: {
        type: String,
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        required: true
      },
      startTime: {
        type: String,
        required: true,
        match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
      },
      endTime: {
        type: String,
        required: true,
        match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
      }
    }],
    
    fitnessPreferences: {
      type: [String],
      default: []
    },
    fitnessGoals: {
      type: [String],
      default: []
    },
    preferredTrainers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    
    qualifications: {
      type: [String],
      default: []
    },
    specialties: {
      type: [String],
      default: []
    },
    teachingStyle: {
      type: String,
      default: ''
    },
    bio: {
      type: String,
      default: ''
    },
    yearsOfExperience: {
      type: Number,
      default: 0
    },
    certifications: [{
      name: String,
      issuingOrganization: String,
      issueDate: Date,
      expirationDate: Date
    }],
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    reviewCount: {
      type: Number,
      default: 0
    }
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
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

UserSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('User', UserSchema);