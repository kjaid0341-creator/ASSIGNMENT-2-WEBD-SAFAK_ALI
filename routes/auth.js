const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/User');
const { generateOTP, sendOTP } = require('../utils/sms');

// Helper: establish session directly and redirect to role dashboard
function initiateOrCompleteLogin(req, res, user) {
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
      phone: phone || '', 
      address: address || '',
      phoneVerified: true 
    });
    await user.save();
    req.flash('success', 'Registration successful! Please sign in.');
    res.redirect('/auth/login');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Registration failed. Try again.');
    res.redirect('/auth/register');
  }
});

// ─── PHONE VERIFICATION & OTP ROUTES ──────────────────────────────────────────

// POST /auth/api/send-otp (AJAX)
router.post('/api/send-otp', async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Please enter a mobile phone number.' });
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit mobile number.' });
    }

    const otp = generateOTP();
    req.session.phoneOtp = otp;
    req.session.phoneOtpPhone = cleanPhone;
    req.session.phoneOtpExpires = Date.now() + 10 * 60 * 1000;

    // If there is a pending user (first-time login)
    if (req.session.pendingUserId) {
      const pendingUser = await User.findById(req.session.pendingUserId);
      if (pendingUser) {
        pendingUser.phone = cleanPhone;
        pendingUser.otp = otp;
        pendingUser.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
        await pendingUser.save();
      }
    }

    const smsRes = await sendOTP(cleanPhone, otp);
    return res.json({
      success: true,
      message: smsRes.message || `OTP sent to +91 ${cleanPhone.slice(-10)}`,
      isDemo: smsRes.isDemo,
      demoOtp: smsRes.isDemo ? otp : undefined
    });
  } catch (err) {
    console.error('API Send OTP error:', err);
    return res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
  }
});

// POST /auth/api/verify-otp (AJAX)
router.post('/api/verify-otp', async (req, res) => {
  try {
    let { phone, otp } = req.body;
    if (!otp || otp.trim().length !== 5) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 5-digit OTP.' });
    }

    const cleanPhone = (phone || '').replace(/\D/g, '');
    const cleanOtp = otp.trim();

    // Check session OTP
    let isValid = false;
    if (req.session.phoneOtp && req.session.phoneOtp === cleanOtp) {
      if (Date.now() <= req.session.phoneOtpExpires) {
        isValid = true;
      }
    }

    // Also check pending user if applicable
    if (!isValid && req.session.pendingUserId) {
      const pendingUser = await User.findById(req.session.pendingUserId);
      if (pendingUser && pendingUser.otp === cleanOtp && pendingUser.otpExpires > new Date()) {
        isValid = true;
      }
    }

    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP code.' });
    }

    // Success!
    req.session.phoneVerified = true;
    req.session.verifiedPhone = cleanPhone;

    // If pending user logging in for first time, finalize their account verification
    if (req.session.pendingUserId) {
      const user = await User.findById(req.session.pendingUserId);
      if (user) {
        user.phoneVerified = true;
        user.phone = cleanPhone;
        user.otp = null;
        user.otpExpires = null;
        await user.save();

        delete req.session.pendingUserId;
        delete req.session.demoOtp;

        req.session.userId = user._id.toString();
        req.session.role = user.role;
        req.session.userName = user.name;
        req.session.groupId = user.groupId ? user.groupId.toString() : null;

        return res.json({
          success: true,
          message: 'Phone verified! Logging you in...',
          redirectUrl: user.role === 'admin' ? '/admin/dashboard' : '/member/dashboard'
        });
      }
    }

    return res.json({ success: true, message: 'Phone number verified successfully!' });
  } catch (err) {
    console.error('API Verify OTP error:', err);
    return res.status(500).json({ success: false, message: 'Verification error. Please try again.' });
  }
});

// GET /auth/verify-phone (dormant - redirects to login)
router.get('/verify-phone', (req, res) => {
  res.redirect('/auth/login');
});

// POST /auth/verify-phone (dormant)
router.post('/verify-phone', (req, res) => {
  res.redirect('/auth/login');
});

// GET /auth/verify-otp (dormant - redirects to login)
router.get('/verify-otp', (req, res) => {
  res.redirect('/auth/login');
});

// POST /auth/verify-otp (dormant)
router.post('/verify-otp', (req, res) => {
  res.redirect('/auth/login');
});

// POST /auth/resend-otp (dormant)
router.post('/resend-otp', (req, res) => {
  res.redirect('/auth/login');
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
