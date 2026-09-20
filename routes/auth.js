const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/User');
const { generateOTP, sendOTP } = require('../utils/sms');

// Helper: check if phone verification is needed or complete session
async function initiateOrCompleteLogin(req, res, user) {
  // If first-time login (phone not verified)
  if (!user.phoneVerified) {
    req.session.pendingUserId = user._id.toString();

    // If phone number is missing, redirect to enter phone
    if (!user.phone) {
      return res.redirect('/auth/verify-phone');
    }

    // Auto-generate 5-digit OTP and send
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    const smsRes = await sendOTP(user.phone, otp);
    if (smsRes.isDemo) {
      req.session.demoOtp = otp;
    }
    req.flash('info', `First-time login: A 5-digit verification code was sent to ${user.phone}.`);
    return res.redirect('/auth/verify-otp');
  }

  // Already verified - establish full session
  req.session.userId = user._id.toString();
  req.session.role = user.role;
  req.session.userName = user.name;
  req.session.groupId = user.groupId ? user.groupId.toString() : null;
  req.flash('success', `Welcome back, ${user.name}!`);
  return res.redirect(user.role === 'admin' ? '/admin/dashboard' : '/member/dashboard');
}

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

    return initiateOrCompleteLogin(req, res, user);
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
    const user = new User({ 
      name, 
      email, 
      password, 
      role, 
      phone, 
      address,
      phoneVerified: false 
    });
    await user.save();
    req.flash('success', 'Registration successful! Please sign in to verify your phone.');
    res.redirect('/auth/login');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Registration failed. Try again.');
    res.redirect('/auth/register');
  }
});

// ─── PHONE VERIFICATION & OTP ROUTES ──────────────────────────────────────────

// GET /auth/verify-phone
router.get('/verify-phone', async (req, res) => {
  if (!req.session.pendingUserId) {
    return res.redirect('/auth/login');
  }
  const user = await User.findById(req.session.pendingUserId);
  if (!user) {
    delete req.session.pendingUserId;
    return res.redirect('/auth/login');
  }
  res.render('auth/verify-phone', {
    title: 'Verify Phone — SHG Tracker',
    phone: user.phone || ''
  });
});

// POST /auth/verify-phone
router.post('/verify-phone', async (req, res) => {
  try {
    if (!req.session.pendingUserId) {
      return res.redirect('/auth/login');
    }
    const user = await User.findById(req.session.pendingUserId);
    if (!user) {
      delete req.session.pendingUserId;
      return res.redirect('/auth/login');
    }

    let { phone } = req.body;
    if (!phone || phone.trim().length < 8) {
      req.flash('error', 'Please enter a valid mobile phone number.');
      return res.redirect('/auth/verify-phone');
    }
    phone = phone.trim();
    user.phone = phone;

    // Generate 5-digit OTP
    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    const smsRes = await sendOTP(phone, otp);
    if (smsRes.isDemo) {
      req.session.demoOtp = otp;
    }

    req.flash('success', `5-digit verification code sent to ${phone}.`);
    res.redirect('/auth/verify-otp');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to send OTP. Please try again.');
    res.redirect('/auth/verify-phone');
  }
});

// GET /auth/verify-otp
router.get('/verify-otp', async (req, res) => {
  if (!req.session.pendingUserId) {
    return res.redirect('/auth/login');
  }
  const user = await User.findById(req.session.pendingUserId);
  if (!user) {
    delete req.session.pendingUserId;
    return res.redirect('/auth/login');
  }
  if (!user.phone) {
    return res.redirect('/auth/verify-phone');
  }

  const demoOtp = req.session.demoOtp || null;
  res.render('auth/verify-otp', {
    title: 'Enter Verification Code — SHG Tracker',
    phone: user.phone,
    demoOtp
  });
});

// POST /auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    if (!req.session.pendingUserId) {
      return res.redirect('/auth/login');
    }
    const user = await User.findById(req.session.pendingUserId);
    if (!user) {
      delete req.session.pendingUserId;
      return res.redirect('/auth/login');
    }

    const { otp } = req.body;
    if (!otp || otp.trim().length !== 5) {
      req.flash('error', 'Please enter a valid 5-digit OTP code.');
      return res.redirect('/auth/verify-otp');
    }

    // Verify OTP and expiration
    if (!user.otp || user.otp !== otp.trim()) {
      req.flash('error', 'Invalid verification code. Please check and try again.');
      return res.redirect('/auth/verify-otp');
    }

    if (!user.otpExpires || new Date() > user.otpExpires) {
      req.flash('error', 'Verification code has expired. Please request a new one.');
      return res.redirect('/auth/verify-otp');
    }

    // Success! Mark phone verified
    user.phoneVerified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    // Clean up pending session
    delete req.session.pendingUserId;
    delete req.session.demoOtp;

    // Establish full user session
    req.session.userId = user._id.toString();
    req.session.role = user.role;
    req.session.userName = user.name;
    req.session.groupId = user.groupId ? user.groupId.toString() : null;

    req.flash('success', `Phone verified successfully! Welcome, ${user.name}!`);
    return res.redirect(user.role === 'admin' ? '/admin/dashboard' : '/member/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Verification failed. Please try again.');
    res.redirect('/auth/verify-otp');
  }
});

// POST /auth/resend-otp
router.post('/resend-otp', async (req, res) => {
  try {
    if (!req.session.pendingUserId) {
      return res.redirect('/auth/login');
    }
    const user = await User.findById(req.session.pendingUserId);
    if (!user || !user.phone) {
      return res.redirect('/auth/verify-phone');
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    const smsRes = await sendOTP(user.phone, otp);
    if (smsRes.isDemo) {
      req.session.demoOtp = otp;
    }

    req.flash('success', `New 5-digit verification code sent to ${user.phone}.`);
    res.redirect('/auth/verify-otp');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not resend OTP. Please try again.');
    res.redirect('/auth/verify-otp');
  }
});

// ─── GOOGLE OAUTH ─────────────────────────────────────────────────────────────

// GET /auth/google — redirect to Google consent screen
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    req.flash('error', 'Google Sign-In is not configured on this server. Please contact administrator.');
    return res.redirect('/auth/login');
  }
  const role = req.query.role === 'admin' ? 'admin' : 'member';
  if (req.session) {
    req.session.oauthRole = role;
  }
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: role,
    prompt: 'select_account'
  })(req, res, next);
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
    return initiateOrCompleteLogin(req, res, req.user);
  }
);

// GET & POST /auth/logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
});

module.exports = router;
