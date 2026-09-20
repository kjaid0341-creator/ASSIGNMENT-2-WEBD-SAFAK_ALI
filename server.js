require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const path = require('path');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('./models/User');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const memberRoutes = require('./routes/member');
const { setLocals } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for reverse proxies like Render
app.enable('trust proxy');

// ─── DATABASE ────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ─── VIEW ENGINE ─────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── MIDDLEWARE ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'shg_dev_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

app.use(flash());
app.use(setLocals);

// ─── PASSPORT ────────────────────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const callbackURL = process.env.GOOGLE_CALLBACK_URL ||
    (process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/auth/google/callback` : 'http://localhost:3000/auth/google/callback');

  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL,
    passReqToCallback: true
  }, async (req, accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails && profile.emails[0] ? profile.emails[0].value.toLowerCase() : null;
      if (!email) {
        return done(new Error('No email found in Google profile.'));
      }

      // Determine requested role from query state or session
      const requestedRole = (req.query && req.query.state === 'admin') || (req.session && req.session.oauthRole === 'admin')
        ? 'admin'
        : 'member';

      // Check if user already exists (by googleId or email)
      let user = await User.findOne({ googleId: profile.id });

      if (!user) {
        user = await User.findOne({ email });
        if (user) {
          // Link Google account to existing email user
          user.googleId = profile.id;
          user.avatar = profile.photos?.[0]?.value || user.avatar || null;
          // If user explicitly signed in/up as admin, upgrade them
          if (requestedRole === 'admin' && user.role !== 'admin') {
            user.role = 'admin';
          }
          await user.save();
        } else {
          // Brand new Google user — assign requested role (admin or member)
          user = await User.create({
            name: profile.displayName || email.split('@')[0],
            email,
            googleId: profile.id,
            avatar: profile.photos?.[0]?.value || null,
            role: requestedRole,
            isActive: true
          });
        }
      } else {
        // User already has Google ID linked
        // If they chose admin, ensure they have admin access
        if (requestedRole === 'admin' && user.role !== 'admin') {
          user.role = 'admin';
          await user.save();
        } else if (requestedRole === 'member' && user.role !== 'member') {
          user.role = 'member';
          await user.save();
        }
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }));
} else {
  console.warn('⚠️ Google OAuth disabled: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not provided in environment.');
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect(req.session.role === 'admin' ? '/admin/dashboard' : '/member/dashboard');
  }
  res.render('landing', { title: 'SHG Tracker — Empowering Communities' });
});

app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/member', memberRoutes);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('404', { title: '404 — Page Not Found' });
});

// ─── ERROR HANDLER ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { title: 'Server Error', error: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 SHG Tracker running at http://localhost:${PORT}`);
});
