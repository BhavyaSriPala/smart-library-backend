const express = require('express');
const router = express.Router();
const {
  requestBook,
  issueBook,
  returnBook,
  payFine,
  getIssuedBooks,
} = require('../controllers/issueController');
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/adminMiddleware');

// Student requests a book (Status: PENDING, stock unchanged)
router.post('/requestBook', protect, requestBook);

// Admin issues a book (Approve PENDING request or issue; decrement copies; 15-day dueDate)
router.post('/issueBook', protect, adminOnly, issueBook);

// Admin returns an issued book (Stop fine accumulation, restore available copies)
router.put('/returnBook', protect, adminOnly, returnBook);

// Admin records fine payment (Status: PAID, outstanding = 0)
router.post('/payFine', protect, adminOnly, payFine);

// View issued books (Student sees own; Admin sees all / filterable)
router.get('/issuedBooks', protect, getIssuedBooks);

module.exports = router;
