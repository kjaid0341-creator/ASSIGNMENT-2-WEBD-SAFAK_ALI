const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, default: null },       // null for Google-only accounts
  googleId: { type: String, default: null },        // populated for Google OAuth users
  avatar: { type: String, default: null },          // Google profile picture URL
  role: { type: String, enum: ['admin', 'member'], default: 'member' },
  phone: { type: String, trim: true },
  phoneVerified: { type: Boolean, default: false },
  otp: { type: String, default: null },
  otpExpires: { type: Date, default: null },
  address: { type: String, trim: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
  isActive: { type: Boolean, default: true },
  joinDate: { type: Date, default: Date.now }
}, { timestamps: true });

// Hash password before saving (skip for Google-only accounts)
userSchema.pre('save', async function (next) {
  if (!this.password || !this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
