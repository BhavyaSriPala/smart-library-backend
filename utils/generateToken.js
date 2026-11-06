const jwt = require('jsonwebtoken');

// Helper function to generate JWT token containing userId and role
const generateToken = (userId, role) => {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: '1d',
  });
};

module.exports = generateToken;
