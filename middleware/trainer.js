module.exports = function (req, res, next) {
    // Check user type from auth middleware
    if (req.user.userType !== 'trainer') {
      return res.status(403).json({ msg: 'Access denied. Trainer role required.' });
    }
    next();
  };