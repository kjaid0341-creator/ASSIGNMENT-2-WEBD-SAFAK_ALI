const express = require('express');
const router = express.Router();
const { isLoggedIn, isAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Group = require('../models/Group');
const Savings = require('../models/Savings');
const Loan = require('../models/Loan');
const moment = require('moment');

// Helper: Generate simple-interest instalment schedule
function generateInstalmentSchedule(principal, annualRate, tenureMonths, startDate) {
  const monthlyRate = annualRate / 12 / 100;
  const totalInterest = principal * (annualRate / 100) * (tenureMonths / 12);
  const totalRepayable = principal + totalInterest;
  const instalmentPrincipal = principal / tenureMonths;
  const instalmentInterest = totalInterest / tenureMonths;
  const instalmentTotal = totalRepayable / tenureMonths;

  const schedule = [];
  for (let i = 1; i <= tenureMonths; i++) {
    const dueDate = moment(startDate).add(i, 'months').toDate();
    schedule.push({
      instalmentNumber: i,
      dueDate,
      principal: parseFloat(instalmentPrincipal.toFixed(2)),
      interest: parseFloat(instalmentInterest.toFixed(2)),
      totalAmount: parseFloat(instalmentTotal.toFixed(2)),
      paidAmount: 0,
      status: 'pending'
    });
  }
  return { schedule, totalInterest, totalRepayable, instalmentAmount: instalmentTotal };
}

// ─── DASHBOARD ──────────────────────────────────────────────────────────────

// GET /admin/dashboard
router.get('/dashboard', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const adminId = req.session.userId;
    const groups = await Group.find({ adminId }).populate('members');
    
    let totalSavings = 0;
    let totalLoansIssued = 0;
    let totalRecovered = 0;
    let activeLoans = 0;
    let pendingLoans = 0;
    const defaulters = [];

    for (const group of groups) {
      const savings = await Savings.find({ groupId: group._id });
      totalSavings += savings.reduce((sum, s) => sum + s.amount, 0);

      const loans = await Loan.find({ groupId: group._id }).populate('memberId', 'name email');
      for (const loan of loans) {
        if (loan.status === 'active' || loan.status === 'closed') {
          totalLoansIssued += loan.amount;
          totalRecovered += loan.totalRepaid;
        }
        if (loan.status === 'active') activeLoans++;
        if (loan.status === 'pending') pendingLoans++;

        // Check for defaulters (overdue instalments in active loans)
        if (loan.status === 'active') {
          const overdueCount = loan.instalmentSchedule.filter(
            inst => inst.status === 'overdue' || 
            (inst.status === 'pending' && new Date(inst.dueDate) < new Date())
          ).length;
          if (overdueCount > 0) {
            defaulters.push({
              member: loan.memberId,
              loanId: loan._id,
              overdueCount,
              outstanding: loan.principalOutstanding
            });
          }
        }
      }
    }

    const totalMembers = await User.countDocuments({ role: 'member' });

    res.render('admin/dashboard', {
      title: 'Admin Dashboard — SHG Tracker',
      groups,
      stats: {
        totalSavings: totalSavings.toFixed(2),
        totalLoansIssued: totalLoansIssued.toFixed(2),
        totalRecovered: totalRecovered.toFixed(2),
        outstanding: (totalLoansIssued - totalRecovered).toFixed(2),
        activeLoans,
        pendingLoans,
        totalMembers,
        totalGroups: groups.length
      },
      defaulters
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error loading dashboard.');
    res.redirect('/');
  }
});

// ─── GROUPS ─────────────────────────────────────────────────────────────────

// GET /admin/groups
router.get('/groups', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const groups = await Group.find({ adminId: req.session.userId }).populate('members', 'name email phone');
    res.render('admin/groups', { title: 'Manage Groups — SHG Tracker', groups });
  } catch (err) {
    req.flash('error', 'Error loading groups.');
    res.redirect('/admin/dashboard');
  }
});

// POST /admin/groups/create
router.post('/groups/create', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const { name, description, interestRate, gracePeriodDays, lateFeeAmount, penalInterestRate } = req.body;
    if (!name) { req.flash('error', 'Group name is required.'); return res.redirect('/admin/groups'); }
    const group = new Group({
      name,
      description,
      adminId: req.session.userId,
      interestRate: interestRate || 12,
      gracePeriodDays: gracePeriodDays ? parseInt(gracePeriodDays) : 5,
      lateFeeAmount: lateFeeAmount !== undefined && lateFeeAmount !== '' ? parseFloat(lateFeeAmount) : 50,
      penalInterestRate: penalInterestRate !== undefined && penalInterestRate !== '' ? parseFloat(penalInterestRate) : 2
    });
    await group.save();
    req.flash('success', `Group "${name}" created successfully!`);
    res.redirect('/admin/groups');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error creating group.');
    res.redirect('/admin/groups');
  }
});

// POST /admin/groups/:id/delete
router.post('/groups/:id/delete', isLoggedIn, isAdmin, async (req, res) => {
  try {
    await Group.findByIdAndDelete(req.params.id);
    req.flash('success', 'Group deleted.');
    res.redirect('/admin/groups');
  } catch (err) {
    req.flash('error', 'Error deleting group.');
    res.redirect('/admin/groups');
  }
});

// ─── MEMBERS ────────────────────────────────────────────────────────────────

// GET /admin/members
router.get('/members', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const groups = await Group.find({ adminId: req.session.userId });
    const groupIds = groups.map(g => g._id);
    const members = await User.find({ role: 'member' }).populate('groupId', 'name');
    res.render('admin/members', { title: 'Manage Members — SHG Tracker', members, groups });
  } catch (err) {
    req.flash('error', 'Error loading members.');
    res.redirect('/admin/dashboard');
  }
});

// POST /admin/members/assign
router.post('/members/assign', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const { memberId, groupId } = req.body;
    const member = await User.findById(memberId);
    if (!member) { req.flash('error', 'Member not found.'); return res.redirect('/admin/members'); }

    // Remove from old group if any
    if (member.groupId) {
      await Group.findByIdAndUpdate(member.groupId, { $pull: { members: memberId } });
    }

    member.groupId = groupId || null;
    await member.save();

    if (groupId) {
      await Group.findByIdAndUpdate(groupId, { $addToSet: { members: memberId } });
    }

    req.flash('success', 'Member assigned to group successfully.');
    res.redirect('/admin/members');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error assigning member.');
    res.redirect('/admin/members');
  }
});

// POST /admin/members/:id/toggle
router.post('/members/:id/toggle', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const member = await User.findById(req.params.id);
    if (member) { member.isActive = !member.isActive; await member.save(); }
    req.flash('success', 'Member status updated.');
    res.redirect('/admin/members');
  } catch (err) {
    req.flash('error', 'Error updating member.');
    res.redirect('/admin/members');
  }
});

// ─── SAVINGS ────────────────────────────────────────────────────────────────

// GET /admin/savings
router.get('/savings', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const groups = await Group.find({ adminId: req.session.userId }).populate('members', 'name email');
    const { groupId, month, year } = req.query;
    
    let filter = {};
    if (groupId) filter.groupId = groupId;
    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);

    const savings = await Savings.find(filter)
      .populate('memberId', 'name email')
      .populate('groupId', 'name')
      .sort({ year: -1, month: -1, createdAt: -1 });

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    res.render('admin/savings', {
      title: 'Savings Management — SHG Tracker',
      groups, savings, months, currentMonth, currentYear,
      selectedGroup: groupId || '', selectedMonth: month || '', selectedYear: year || ''
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error loading savings.');
    res.redirect('/admin/dashboard');
  }
});

// POST /admin/savings/record
router.post('/savings/record', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const { memberId, groupId, amount, month, year, notes } = req.body;
    if (!memberId || !groupId || !amount || !month || !year) {
      req.flash('error', 'All fields are required.');
      return res.redirect('/admin/savings');
    }
    
    // Check if already recorded
    const existing = await Savings.findOne({ memberId, month: parseInt(month), year: parseInt(year) });
    if (existing) {
      req.flash('error', 'Savings for this member/month/year already recorded. Delete the existing one first.');
      return res.redirect('/admin/savings');
    }

    const savings = new Savings({
      memberId, groupId,
      amount: parseFloat(amount),
      month: parseInt(month),
      year: parseInt(year),
      recordedBy: req.session.userId,
      notes
    });
    await savings.save();
    req.flash('success', 'Savings recorded successfully!');
    res.redirect('/admin/savings');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error recording savings: ' + err.message);
    res.redirect('/admin/savings');
  }
});

// POST /admin/savings/:id/delete
router.post('/savings/:id/delete', isLoggedIn, isAdmin, async (req, res) => {
  try {
    await Savings.findByIdAndDelete(req.params.id);
    req.flash('success', 'Savings entry deleted.');
    res.redirect('/admin/savings');
  } catch (err) {
    req.flash('error', 'Error deleting entry.');
    res.redirect('/admin/savings');
  }
});

// ─── LOANS ──────────────────────────────────────────────────────────────────

// GET /admin/loans
router.get('/loans', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const groups = await Group.find({ adminId: req.session.userId });
    const groupIds = groups.map(g => g._id);
    const { status } = req.query;
    let filter = { groupId: { $in: groupIds } };
    if (status) filter.status = status;

    const loans = await Loan.find(filter)
      .populate('memberId', 'name email phone')
      .populate('groupId', 'name')
      .sort({ createdAt: -1 });

    res.render('admin/loans', { title: 'Loan Management — SHG Tracker', loans, selectedStatus: status || '' });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error loading loans.');
    res.redirect('/admin/dashboard');
  }
});

// GET /admin/loans/:id
router.get('/loans/:id', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id)
      .populate('memberId', 'name email phone address')
      .populate('groupId', 'name')
      .populate('approvedBy', 'name');
    if (!loan) { req.flash('error', 'Loan not found.'); return res.redirect('/admin/loans'); }

    // Check overdue and calculate penalties
    const today = new Date();
    const group = loan.groupId;
    const graceDays = (group && group.gracePeriodDays !== undefined) ? group.gracePeriodDays : 5;
    const fixedFee = (group && group.lateFeeAmount !== undefined) ? group.lateFeeAmount : 50;
    const penalRate = (group && group.penalInterestRate !== undefined) ? group.penalInterestRate : 2; // % per month

    let modified = false;
    for (const inst of loan.instalmentSchedule) {
      if (inst.status !== 'paid') {
        const dueDate = new Date(inst.dueDate);
        const diffMs = today - dueDate;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays > graceDays) {
          inst.status = 'overdue';
          if (!inst.waivedPenalty) {
            inst.lateFee = fixedFee;
            // Penal interest on overdue principal: (principal * (penalRate/100) * (diffDays/30))
            const overduePrincipal = inst.principal;
            inst.penalInterest = parseFloat((overduePrincipal * (penalRate / 100) * (diffDays / 30)).toFixed(2));
          } else {
            inst.lateFee = 0;
            inst.penalInterest = 0;
          }
          modified = true;
        } else if (diffDays > 0) {
          // In grace period, mark as overdue but no fee yet
          inst.status = 'overdue';
          modified = true;
        }
      }
    }
    if (modified) {
      loan.totalPenalties = loan.instalmentSchedule.reduce((sum, i) => sum + (i.lateFee || 0) + (i.penalInterest || 0), 0);
      await loan.save();
    }

    const months = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
    res.render('admin/loan-detail', { title: 'Loan Details — SHG Tracker', loan, moment, months });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error loading loan details.');
    res.redirect('/admin/loans');
  }
});

// POST /admin/loans/:id/approve
router.post('/loans/:id/approve', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id).populate('groupId');
    if (!loan || loan.status !== 'pending') {
      req.flash('error', 'Invalid loan or already processed.');
      return res.redirect('/admin/loans');
    }

    const interestRate = loan.groupId.interestRate || 12;
    const { schedule, totalInterest, totalRepayable, instalmentAmount } =
      generateInstalmentSchedule(loan.amount, interestRate, loan.tenure, new Date());

    loan.status = 'active';
    loan.approvedAt = new Date();
    loan.approvedBy = req.session.userId;
    loan.interestRate = interestRate;
    loan.totalInterest = parseFloat(totalInterest.toFixed(2));
    loan.totalRepayable = parseFloat(totalRepayable.toFixed(2));
    loan.instalmentAmount = parseFloat(instalmentAmount.toFixed(2));
    loan.principalOutstanding = loan.amount;
    loan.instalmentSchedule = schedule;

    await loan.save();
    req.flash('success', `Loan approved! ₹${loan.amount} disbursed with ${loan.tenure}-month schedule.`);
    res.redirect(`/admin/loans/${loan._id}`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error approving loan.');
    res.redirect('/admin/loans');
  }
});

// POST /admin/loans/:id/reject
router.post('/loans/:id/reject', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    const loan = await Loan.findById(req.params.id);
    if (!loan || loan.status !== 'pending') {
      req.flash('error', 'Invalid loan or already processed.');
      return res.redirect('/admin/loans');
    }
    loan.status = 'rejected';
    loan.rejectedAt = new Date();
    loan.rejectionReason = reason || 'No reason provided';
    await loan.save();
    req.flash('success', 'Loan rejected.');
    res.redirect('/admin/loans');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error rejecting loan.');
    res.redirect('/admin/loans');
  }
});

// POST /admin/loans/:loanId/repay/:instalmentIndex
router.post('/loans/:loanId/repay/:instalmentIndex', isLoggedIn, isAdmin, async (req, res) => {
  try {
    const { paidAmount, penaltyPaid, waivePenalty } = req.body;
    const loan = await Loan.findById(req.params.loanId);
    if (!loan) { req.flash('error', 'Loan not found.'); return res.redirect('/admin/loans'); }

    const idx = parseInt(req.params.instalmentIndex);
    const instalment = loan.instalmentSchedule[idx];
    if (!instalment) { req.flash('error', 'Instalment not found.'); return res.redirect(`/admin/loans/${loan._id}`); }

    const paid = parseFloat(paidAmount) || 0;
    instalment.paidAmount = paid;
    instalment.paidDate = new Date();

    // Handle penalty collection or waiver
    if (waivePenalty === 'on' || waivePenalty === 'true') {
      instalment.waivedPenalty = true;
      instalment.lateFee = 0;
      instalment.penalInterest = 0;
      instalment.penaltyPaid = 0;
    } else {
      instalment.penaltyPaid = parseFloat(penaltyPaid) || 0;
    }

    if (paid >= instalment.totalAmount) {
      instalment.status = 'paid';
    } else if (paid > 0) {
      instalment.status = 'partial';
    }

    // Recompute totals
    loan.totalRepaid = loan.instalmentSchedule.reduce((sum, i) => sum + (i.paidAmount || 0), 0);
    loan.totalPenaltiesPaid = loan.instalmentSchedule.reduce((sum, i) => sum + (i.penaltyPaid || 0), 0);
    loan.totalPenalties = loan.instalmentSchedule.reduce((sum, i) => sum + (i.lateFee || 0) + (i.penalInterest || 0), 0);
    loan.principalOutstanding = Math.max(0, loan.totalRepayable - loan.totalRepaid);

    // Check if all paid
    const allPaid = loan.instalmentSchedule.every(i => i.status === 'paid');
    if (allPaid) {
      loan.status = 'closed';
      loan.closedAt = new Date();
    }

    await loan.save();
    const penaltyMsg = instalment.waivedPenalty ? ' (Penalty was waived)' : (instalment.penaltyPaid > 0 ? ` + ₹${instalment.penaltyPaid} penalty collected` : '');
    req.flash('success', `Repayment of ₹${paid}${penaltyMsg} recorded successfully.`);
    res.redirect(`/admin/loans/${loan._id}`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error recording repayment.');
    res.redirect('/admin/loans');
  }
});

module.exports = router;
