const mongoose = require('mongoose');
const Book = require('../models/Book');
const BookIssue = require('../models/BookIssue');

// @desc    Add a new book (Admin only)
// @route   POST /books
const addBook = async (req, res) => {
  try {
    const { title, author, category, publisher, quantity } = req.body;

    // Validate required fields
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ message: 'Title is required' });
    }
    if (!author || typeof author !== 'string' || !author.trim()) {
      return res.status(400).json({ message: 'Author is required' });
    }
    if (!category || typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({ message: 'Category is required' });
    }
    if (!publisher || typeof publisher !== 'string' || !publisher.trim()) {
      return res.status(400).json({ message: 'Publisher is required' });
    }
    if (quantity === undefined || quantity === null || typeof quantity !== 'number' || isNaN(quantity)) {
      return res.status(400).json({ message: 'Valid quantity number is required' });
    }
    if (quantity < 0) {
      return res.status(400).json({ message: 'Quantity cannot be negative' });
    }

    // Generate unique bookId
    const bookId = 'BOOK_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    // Set availableCopies equal to quantity for a newly added book (ignore client-passed availableCopies)
    const availableCopies = quantity;

    const book = new Book({
      bookId,
      title: title.trim(),
      author: author.trim(),
      category: category.trim(),
      publisher: publisher.trim(),
      quantity,
      availableCopies,
    });

    await book.save();

    return res.status(201).json({
      message: 'Book added successfully',
      book,
    });
  } catch (error) {
    console.error('Error adding book:', error.message);
    return res.status(500).json({ message: 'Server error while adding book' });
  }
};

// @desc    Get all books / Search books (Authenticated Students and Admins)
// @route   GET /books or GET /books?search=keyword
const getBooks = async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};

    if (search && typeof search === 'string' && search.trim() !== '') {
      const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
      filter.$or = [
        { title: searchRegex },
        { author: searchRegex },
        { category: searchRegex },
      ];
    }

    const books = await Book.find(filter);
    return res.status(200).json(books);
  } catch (error) {
    console.error('Error fetching books:', error.message);
    return res.status(500).json({ message: 'Server error while fetching books' });
  }
};

// @desc    Update book details (Admin only)
// @route   PUT /books/:id
const updateBook = async (req, res) => {
  try {
    const { id } = req.params;

    // Find book by MongoDB _id or bookId
    let book = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      book = await Book.findById(id);
    }
    if (!book) {
      book = await Book.findOne({ bookId: id });
    }

    if (!book) {
      return res.status(404).json({ message: 'Book not found' });
    }

    const { title, author, category, publisher, quantity, availableCopies } = req.body;

    // Validate string fields if provided
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ message: 'Title cannot be empty' });
      }
      book.title = title.trim();
    }

    if (author !== undefined) {
      if (typeof author !== 'string' || !author.trim()) {
        return res.status(400).json({ message: 'Author cannot be empty' });
      }
      book.author = author.trim();
    }

    if (category !== undefined) {
      if (typeof category !== 'string' || !category.trim()) {
        return res.status(400).json({ message: 'Category cannot be empty' });
      }
      book.category = category.trim();
    }

    if (publisher !== undefined) {
      if (typeof publisher !== 'string' || !publisher.trim()) {
        return res.status(400).json({ message: 'Publisher cannot be empty' });
      }
      book.publisher = publisher.trim();
    }

    // Check count of currently issued copies
    const activeIssuesCount = await BookIssue.countDocuments({
      bookId: book.bookId,
      status: { $in: ['ISSUED', 'Issued', 'issued'] },
    });

    if (quantity !== undefined) {
      if (typeof quantity !== 'number' || isNaN(quantity) || quantity < 0) {
        return res.status(400).json({ message: 'Quantity must be a valid non-negative number' });
      }

      if (quantity < activeIssuesCount) {
        return res.status(400).json({
          message: `Total quantity cannot be reduced below currently issued copies (${activeIssuesCount})`,
        });
      }

      if (availableCopies === undefined) {
        // Adjust availableCopies proportionally by the change in total quantity
        const quantityDiff = quantity - book.quantity;
        const newAvailable = book.availableCopies + quantityDiff;

        if (newAvailable < 0) {
          return res.status(400).json({ message: 'Quantity cannot be reduced below currently issued copies' });
        }
        book.availableCopies = newAvailable;
        book.quantity = quantity;
      }
    }

    if (availableCopies !== undefined) {
      if (typeof availableCopies !== 'number' || isNaN(availableCopies) || availableCopies < 0) {
        return res.status(400).json({ message: 'Available copies must be a valid non-negative number' });
      }

      const effectiveQuantity = quantity !== undefined ? quantity : book.quantity;
      if (availableCopies > effectiveQuantity) {
        return res.status(400).json({ message: 'Available copies cannot exceed quantity' });
      }

      if (availableCopies > effectiveQuantity - activeIssuesCount) {
        return res.status(400).json({
          message: `Available copies cannot exceed ${effectiveQuantity - activeIssuesCount} (${activeIssuesCount} copies are currently borrowed)`,
        });
      }

      book.availableCopies = availableCopies;
      if (quantity !== undefined) {
        book.quantity = quantity;
      }
    }

    await book.save();

    return res.status(200).json({
      message: 'Book updated successfully',
      book,
    });
  } catch (error) {
    console.error('Error updating book:', error.message);
    return res.status(500).json({ message: 'Server error while updating book' });
  }
};

// @desc    Delete a book (Admin only)
// @route   DELETE /books/:id
const deleteBook = async (req, res) => {
  try {
    const { id } = req.params;

    // Find book by MongoDB _id or bookId
    let book = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      book = await Book.findById(id);
    }
    if (!book) {
      book = await Book.findOne({ bookId: id });
    }

    if (!book) {
      return res.status(404).json({ message: 'Book not found' });
    }

    // Protect data consistency: check if book has active loans or pending requests
    const activeLoanOrRequest = await BookIssue.findOne({
      bookId: book.bookId,
      status: { $in: ['ISSUED', 'Issued', 'issued', 'PENDING', 'Pending', 'pending'] },
    });

    if (activeLoanOrRequest) {
      return res.status(400).json({
        message:
          'Cannot delete book: Book currently has active loans or pending student requests. Please return or resolve them first.',
      });
    }

    await book.deleteOne();

    return res.status(200).json({
      message: 'Book deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting book:', error.message);
    return res.status(500).json({ message: 'Server error while deleting book' });
  }
};

module.exports = {
  getBooks,
  addBook,
  updateBook,
  deleteBook,
};
