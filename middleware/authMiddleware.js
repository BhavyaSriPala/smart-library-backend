const jwt = require('jsonwebtoken');

// Middleware to verify JWT authentication token
const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // 1, 2, 3. Check if Authorization header is present and starts with Bearer
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization header missing or invalid' });
  }

  // 4. Extract the token
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Token not provided' });
  }

  // 5, 6. Verify the token using process.env.JWT_SECRET
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // 7. Attach decoded user information to req.user
    req.user = decoded;
    // 8. Continue to next middleware/controller
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

module.exports = { protect, authMiddleware: protect };
