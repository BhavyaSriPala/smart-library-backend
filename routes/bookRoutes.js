const express = require('express');
const router = express.Router();
const {
  getBooks,
  addBook,
  updateBook,
  deleteBook,
} = require('../controllers/bookController');
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/adminMiddleware');

// GET /books - Authenticated students and admins
router.get('/', protect, getBooks);

// POST /books - Admin only
router.post('/', protect, adminOnly, addBook);

// PUT /books/:id - Admin only
router.put('/:id', protect, adminOnly, updateBook);

// DELETE /books/:id - Admin only
router.delete('/:id', protect, adminOnly, deleteBook);

module.exports = router;
