const express = require('express');
const router = express.Router();
const { isLoggedIn, isMember } = require('../middleware/auth');
const User = require('../models/User');
const Group = require('../models/Group');
const Savings = require('../models/Savings');
const Loan = require('../models/Loan');
const moment = require('moment');

// GET /member/dashboard
router.get('/dashboard', isLoggedIn, isMember, async (req, res) => {
  try {
    const member = await User.findById(req.session.userId).populate('groupId', 'name interestRate');
    const savings = await Savings.find({ memberId: req.session.userId }).sort({ year: -1, month: -1 });
    const totalSavings = savings.reduce((sum, s) => sum + s.amount, 0);

    const loans = await Loan.find({ memberId: req.session.userId }).sort({ createdAt: -1 });
    const activeLoans = loans.filter(l => l.status === 'active');
    const pendingLoans = loans.filter(l => l.status === 'pending');

    const totalBorrowed = loans.filter(l => ['active','closed'].includes(l.status)).reduce((sum, l) => sum + l.amount, 0);
    const totalRepaid = loans.reduce((sum, l) => sum + l.totalRepaid, 0);
    const totalOutstanding = activeLoans.reduce((sum, l) => sum + l.principalOutstanding, 0);

    const months = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

    res.render('member/dashboard', {
      title: 'My Dashboard — SHG Tracker',
      member,
      savings: savings.slice(0, 6),
      loans: loans.slice(0, 5),
      stats: {
        totalSavings: totalSavings.toFixed(2),
        totalBorrowed: totalBorrowed.toFixed(2),
        totalRepaid: totalRepaid.toFixed(2),
        totalOutstanding: totalOutstanding.toFixed(2),
        activeLoans: activeLoans.length,
        pendingLoans: pendingLoans.length
      },
      months,
      moment
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error loading dashboard.');
    res.redirect('/auth/login');
  }
});

// GET /member/passbook
router.get('/passbook', isLoggedIn, isMember, async (req, res) => {
  try {
    const savings = await Savings.find({ memberId: req.session.userId })
      .sort({ year: -1, month: -1 });
    const totalSavings = savings.reduce((sum, s) => sum + s.amount, 0);
    const months = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

    res.render('member/passbook', {
      title: 'My Savings Passbook — SHG Tracker',
      savings,
      totalSavings: totalSavings.toFixed(2),
      months,
      moment
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error loading passbook.');
    res.redirect('/member/dashboard');
  }
});

// GET /member/loans
router.get('/loans', isLoggedIn, isMember, async (req, res) => {
  try {
    const member = await User.findById(req.session.userId).populate('groupId');
    const loans = await Loan.find({ memberId: req.session.userId }).sort({ createdAt: -1 });

    // Mark overdue instalments
    for (const loan of loans) {
      if (loan.status === 'active') {
        let modified = false;
        for (const inst of loan.instalmentSchedule) {
          if (inst.status === 'pending' && new Date(inst.dueDate) < new Date()) {
            inst.status = 'overdue';
            modified = true;
          }
        }
        if (modified) await loan.save();
      }
    }

    res.render('member/loan-status', {
      title: 'My Loans — SHG Tracker',
      loans,
      member,
      moment
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error loading loans.');
    res.redirect('/member/dashboard');
  }
});

// GET /member/loans/request
router.get('/loans/request', isLoggedIn, isMember, async (req, res) => {
  try {
    const member = await User.findById(req.session.userId).populate('groupId');
    if (!member.groupId) {
      req.flash('error', 'You must be assigned to a group to request a loan.');
      return res.redirect('/member/dashboard');
    }
    // Check for existing pending loan
    const pendingLoan = await Loan.findOne({ memberId: req.session.userId, status: 'pending' });
    if (pendingLoan) {
      req.flash('error', 'You already have a pending loan application.');
      return res.redirect('/member/loans');
    }
    res.render('member/loan-request', { title: 'Request Loan — SHG Tracker', member });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error loading loan form.');
    res.redirect('/member/dashboard');
  }
});

// POST /member/loans/request
router.post('/loans/request', isLoggedIn, isMember, async (req, res) => {
  try {
    const { amount, purpose, tenure } = req.body;
    const member = await User.findById(req.session.userId).populate('groupId');

    if (!member.groupId) {
      req.flash('error', 'You must be assigned to a group to request a loan.');
      return res.redirect('/member/loans/request');
    }

    // Check for Borrowing Freeze: Does member have active overdue installments?
    const activeLoans = await Loan.find({ memberId: member._id, status: 'active' });
    const today = new Date();
    let hasOverdue = false;

    for (const loan of activeLoans) {
      const graceDays = (member.groupId && member.groupId.gracePeriodDays !== undefined) ? member.groupId.gracePeriodDays : 5;
      for (const inst of loan.instalmentSchedule) {
        if (inst.status !== 'paid') {
          const diffDays = Math.floor((today - new Date(inst.dueDate)) / (1000 * 60 * 60 * 24));
          if (diffDays > graceDays) {
            hasOverdue = true;
            break;
          }
        }
      }
      if (hasOverdue) break;
    }

    if (hasOverdue) {
      req.flash('error', '⚠️ Loan Request Blocked: You have overdue loan installments. In accordance with SHG rules, you cannot borrow until all overdue payments are cleared.');
      return res.redirect('/member/loans');
    }

    if (!amount || !purpose || !tenure) {
      req.flash('error', 'All fields are required.');
      return res.redirect('/member/loans/request');
    }

    const loan = new Loan({
      memberId: req.session.userId,
      groupId: member.groupId._id,
      amount: parseFloat(amount),
      purpose,
      tenure: parseInt(tenure),
      interestRate: member.groupId.interestRate || 12,
      status: 'pending'
    });

    await loan.save();
    req.flash('success', 'Loan application submitted successfully! Awaiting admin approval.');
    res.redirect('/member/loans');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error submitting loan request.');
    res.redirect('/member/loans/request');
  }
});

// GET /member/loans/:id
router.get('/loans/:id', isLoggedIn, isMember, async (req, res) => {
  try {
    const loan = await Loan.findOne({ _id: req.params.id, memberId: req.session.userId })
      .populate('groupId', 'name interestRate gracePeriodDays lateFeeAmount penalInterestRate')
      .populate('approvedBy', 'name');

    if (!loan) {
      req.flash('error', 'Loan not found.');
      return res.redirect('/member/loans');
    }

    // Dynamically check penalties
    const today = new Date();
    const group = loan.groupId;
    const graceDays = (group && group.gracePeriodDays !== undefined) ? group.gracePeriodDays : 5;
    const fixedFee = (group && group.lateFeeAmount !== undefined) ? group.lateFeeAmount : 50;
    const penalRate = (group && group.penalInterestRate !== undefined) ? group.penalInterestRate : 2;

    for (const inst of loan.instalmentSchedule) {
      if (inst.status !== 'paid') {
        const diffDays = Math.floor((today - new Date(inst.dueDate)) / (1000 * 60 * 60 * 24));
        if (diffDays > graceDays && !inst.waivedPenalty) {
          inst.lateFee = fixedFee;
          inst.penalInterest = parseFloat((inst.principal * (penalRate / 100) * (diffDays / 30)).toFixed(2));
        }
      }
    }

    res.render('member/loan-detail', {
      title: 'Loan Details — SHG Tracker',
      loan,
      moment
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error loading loan details.');
    res.redirect('/member/loans');
  }
});

module.exports = router;
