// Middleware for Admin authorization
const adminOnly = (req, res, next) => {
  // 1, 2. Check whether authenticated user has role === "admin"
  if (!req.user || req.user.role !== 'admin') {
    // 4. Return an appropriate authorization error
    return res.status(403).json({ message: 'Access denied: Admin authorization required' });
  }

  // 3. User is an admin, continue
  next();
};

module.exports = { adminOnly, adminMiddleware: adminOnly };
