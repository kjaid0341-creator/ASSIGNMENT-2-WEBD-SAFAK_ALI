const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  interestRate: { type: Number, default: 12 }, // Annual interest rate %
  // Penalty settings for late repayment
  gracePeriodDays: { type: Number, default: 5 },    // Grace days after due date before penalty applies
  lateFeeAmount: { type: Number, default: 50 },       // Fixed late fee per overdue instalment (₹)
  penalInterestRate: { type: Number, default: 2 },    // Extra monthly penal interest % on overdue principal
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Group', groupSchema);
