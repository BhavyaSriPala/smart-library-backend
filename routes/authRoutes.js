const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getStudents,
  updateStudent,
  resetStudentPassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/adminMiddleware');

// User Registration Route: POST /register
router.post('/register', registerUser);

// User Login Route: POST /login
router.post('/login', loginUser);

// View Student Records Route: GET /students (Admin only)
router.get('/students', protect, adminOnly, getStudents);

// Edit Student Details: PUT /students/:userId (Admin only)
router.put('/students/:userId', protect, adminOnly, updateStudent);

// Reset Student Password: PUT /students/:userId/reset-password (Admin only)
router.put('/students/:userId/reset-password', protect, adminOnly, resetStudentPassword);

module.exports = router;

