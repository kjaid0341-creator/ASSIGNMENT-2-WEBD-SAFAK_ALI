const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/User');

// GET /auth/login
router.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect(req.session.role === 'admin' ? '/admin/dashboard' : '/member/dashboard');
  }
  res.render('auth/login', { title: 'Login — SHG Tracker' });
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      req.flash('error', 'Please provide email and password.');
      return res.redirect('/auth/login');
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.isActive) {
      req.flash('error', 'Invalid credentials or account inactive.');
      return res.redirect('/auth/login');
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      req.flash('error', 'Invalid credentials.');
      return res.redirect('/auth/login');
    }
    req.session.userId = user._id.toString();
    req.session.role = user.role;
    req.session.userName = user.name;
    req.session.groupId = user.groupId ? user.groupId.toString() : null;
    req.flash('success', `Welcome back, ${user.name}!`);
    return res.redirect(user.role === 'admin' ? '/admin/dashboard' : '/member/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Server error. Please try again.');
    res.redirect('/auth/login');
  }
});

// GET /auth/register
router.get('/register', (req, res) => {
  if (req.session.userId) {
    return res.redirect(req.session.role === 'admin' ? '/admin/dashboard' : '/member/dashboard');
  }
  res.render('auth/register', { title: 'Register — SHG Tracker' });
});

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, confirmPassword, role, phone, address } = req.body;
    if (!name || !email || !password || !role) {
      req.flash('error', 'All required fields must be filled.');
      return res.redirect('/auth/register');
    }
    if (password !== confirmPassword) {
      req.flash('error', 'Passwords do not match.');
      return res.redirect('/auth/register');
    }
    if (password.length < 6) {
      req.flash('error', 'Password must be at least 6 characters.');
      return res.redirect('/auth/register');
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      req.flash('error', 'Email already registered.');
      return res.redirect('/auth/register');
    }
    const user = new User({ name, email, password, role, phone, address });
    await user.save();
    req.flash('success', 'Registration successful! Please login.');
    res.redirect('/auth/login');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Registration failed. Try again.');
    res.redirect('/auth/register');
  }
});

// ─── GOOGLE OAUTH ─────────────────────────────────────────────────────────────

// GET /auth/google — redirect to Google consent screen
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    req.flash('error', 'Google Sign-In is not configured on this server. Please contact administrator.');
    return res.redirect('/auth/login');
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

// GET /auth/google/callback — Google redirects back here
router.get('/google/callback', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    req.flash('error', 'Google Sign-In is not configured.');
    return res.redirect('/auth/login');
  }
  passport.authenticate('google', {
    failureRedirect: '/auth/login',
    failureFlash: true
  })(req, res, next);
}, (req, res) => {
    const user = req.user;
    // Set the same session vars used everywhere else in the app
    req.session.userId = user._id.toString();
    req.session.role = user.role;
    req.session.userName = user.name;
    req.session.groupId = user.groupId ? user.groupId.toString() : null;
    req.flash('success', `Welcome, ${user.name}!`);
    res.redirect(user.role === 'admin' ? '/admin/dashboard' : '/member/dashboard');
  }
);

// POST /auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
});

module.exports = router;
