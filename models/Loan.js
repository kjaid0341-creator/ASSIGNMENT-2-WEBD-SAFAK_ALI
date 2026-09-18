const mongoose = require('mongoose');

const instalmentSchema = new mongoose.Schema({
  instalmentNumber: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  principal: { type: Number, required: true },
  interest: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  paidDate: { type: Date },
  status: { type: String, enum: ['pending', 'paid', 'overdue', 'partial'], default: 'pending' },
  lateFee: { type: Number, default: 0 },             // Fixed late fee assessed
  penalInterest: { type: Number, default: 0 },       // Extra interest assessed due to delay
  waivedPenalty: { type: Boolean, default: false },   // Whether penalty was waived by admin
  penaltyPaid: { type: Number, default: 0 }          // Penalty actually collected
});

const loanSchema = new mongoose.Schema({
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  amount: { type: Number, required: true, min: 1 },
  purpose: { type: String, required: true, trim: true },
  tenure: { type: Number, required: true, min: 1 }, // in months
  interestRate: { type: Number, required: true }, // Annual %
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'active', 'closed'],
    default: 'pending'
  },
  // Computed fields
  totalInterest: { type: Number, default: 0 },
  totalRepayable: { type: Number, default: 0 },
  instalmentAmount: { type: Number, default: 0 },
  principalOutstanding: { type: Number, default: 0 },
  totalRepaid: { type: Number, default: 0 },
  totalPenalties: { type: Number, default: 0 },       // Total penalties accrued
  totalPenaltiesPaid: { type: Number, default: 0 },   // Total penalties collected
  // Tracking
  appliedAt: { type: Date, default: Date.now },
  approvedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt: { type: Date },
  rejectionReason: { type: String },
  closedAt: { type: Date },
  // Schedule
  instalmentSchedule: [instalmentSchema],
  notes: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Loan', loanSchema);
