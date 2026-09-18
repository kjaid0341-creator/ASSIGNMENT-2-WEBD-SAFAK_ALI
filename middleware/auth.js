// Middleware: Check if user is logged in
exports.isLoggedIn = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  req.flash('error', 'Please login to continue.');
  return res.redirect('/auth/login');
};

// Middleware: Check if user is admin
exports.isAdmin = (req, res, next) => {
  if (req.session && req.session.role === 'admin') {
    return next();
  }
  req.flash('error', 'Access denied. Admin only.');
  return res.redirect('/');
};

// Middleware: Check if user is member
exports.isMember = (req, res, next) => {
  if (req.session && req.session.role === 'member') {
    return next();
  }
  req.flash('error', 'Access denied. Members only.');
  return res.redirect('/');
};

// Middleware: Set local variables for views
exports.setLocals = (req, res, next) => {
  res.locals.currentUser = req.session.userId || null;
  res.locals.currentRole = req.session.role || null;
  res.locals.currentName = req.session.userName || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
};
