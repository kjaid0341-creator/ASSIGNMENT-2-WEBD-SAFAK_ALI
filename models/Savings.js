const mongoose = require('mongoose');

const savingsSchema = new mongoose.Schema({
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  amount: { type: Number, required: true, min: 0 },
  month: { type: Number, required: true, min: 1, max: 12 }, // 1-12
  year: { type: Number, required: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String, trim: true }
}, { timestamps: true });

// Prevent duplicate savings entry for same member/month/year
savingsSchema.index({ memberId: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('Savings', savingsSchema);
