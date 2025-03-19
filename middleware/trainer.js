module.exports = function (req, res, next) {
    if (req.user.userType !== 'trainer') {
      return res.status(403).json({ msg: 'Access denied. Trainer role required.' });
    }
    next();
  };