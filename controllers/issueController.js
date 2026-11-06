const mongoose = require('mongoose');
const Book = require('../models/Book');
const BookIssue = require('../models/BookIssue');
const User = require('../models/User');

/**
 * Calculate per-book fine based on 15-day loan policy:
 * - First 15 days: ₹0 fine
 * - Starting from 16th day: ₹1 per day late
 * - Returned books freeze fine accumulation at returnDate
 * - Outstanding fine is ₹0 if marked PAID
 */
const calculateFine = (issue, asOfDate = new Date()) => {
  const statusUpper = (issue.status || '').toUpperCase();

  // If request is still PENDING or missing issue/due date, fine is 0
  if (statusUpper === 'PENDING' || !issue.issueDate || !issue.dueDate) {
    return {
      fine: 0,
      outstandingFine: 0,
      isOverdue: false,
      daysLate: 0,
    };
  }

  // If returned, calculate fine up to returnDate; if active, calculate up to asOfDate
  const endDate =
    statusUpper === 'RETURNED' && issue.returnDate
      ? new Date(issue.returnDate)
      : asOfDate;

  const dueDate = new Date(issue.dueDate);

  if (endDate <= dueDate) {
    return {
      fine: 0,
      outstandingFine: 0,
      isOverdue: false,
      daysLate: 0,
    };
  }

  const diffMs = endDate.getTime() - dueDate.getTime();
  const daysLate = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const calculatedFine = Math.max(0, daysLate * 1); // ₹1 per day

  const isPaid = issue.paymentStatus === 'PAID';
  const outstandingFine = isPaid ? 0 : calculatedFine;

  return {
    fine: calculatedFine,
    outstandingFine,
    isOverdue: daysLate > 0,
    daysLate,
  };
};

// @desc    Student requests a book (Status: PENDING, stock unchanged)
// @route   POST /requestBook
const requestBook = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { bookId } = req.body;
    if (!bookId || typeof bookId !== 'string' || !bookId.trim()) {
      return res.status(400).json({ success: false, message: 'bookId is required' });
    }

    const trimmedBookId = bookId.trim();

    // Find requested book by bookId or MongoDB _id
    let book = await Book.findOne({ bookId: trimmedBookId });
    if (!book && mongoose.Types.ObjectId.isValid(trimmedBookId)) {
      book = await Book.findById(trimmedBookId);
    }

    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    // Check for existing pending request for this student and book
    const existingPending = await BookIssue.findOne({
      userId: req.user.userId,
      bookId: book.bookId,
      status: { $in: ['PENDING', 'Pending', 'pending'] },
    });

    if (existingPending) {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending request for this book',
      });
    }

    // Check if student already has this book actively issued
    const existingIssued = await BookIssue.findOne({
      userId: req.user.userId,
      bookId: book.bookId,
      status: { $in: ['ISSUED', 'Issued', 'issued'] },
    });

    if (existingIssued) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active borrowed copy of this book',
      });
    }

    // Generate unique issueId
    const issueId = 'REQ_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    // Create BookIssue record with PENDING status (availableCopies is NOT decreased)
    const issue = new BookIssue({
      issueId,
      userId: req.user.userId,
      bookId: book.bookId,
      requestDate: new Date(),
      issueDate: null,
      dueDate: null,
      returnDate: null,
      status: 'PENDING',
      fine: 0,
      paymentStatus: 'UNPAID',
    });

    await issue.save();

    return res.status(201).json({
      success: true,
      message: 'Book requested successfully. Awaiting librarian approval.',
      issue,
    });
  } catch (error) {
    console.error('Error requesting book:', error.message);
    return res.status(500).json({ success: false, message: 'Server error while requesting book' });
  }
};

// @desc    Admin issues a book (Approve PENDING request or issue directly)
// @route   POST /issueBook
const issueBook = async (req, res) => {
  let bookDecrementedId = null;

  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Admin authorization required to issue books',
      });
    }

    const rawIssueId = req.body.issueId || req.body.id;
    const rawBookId = req.body.bookId;

    // Case 1: Admin is approving/issuing an existing PENDING request
    if (rawIssueId && typeof rawIssueId === 'string' && rawIssueId.trim()) {
      const trimmedIssueId = rawIssueId.trim();

      let issue = await BookIssue.findOne({ issueId: trimmedIssueId });
      if (!issue && mongoose.Types.ObjectId.isValid(trimmedIssueId)) {
        issue = await BookIssue.findById(trimmedIssueId);
      }

      if (!issue) {
        return res.status(404).json({ success: false, message: 'Book request record not found' });
      }

      const currentStatus = (issue.status || '').toUpperCase();

      if (currentStatus === 'ISSUED') {
        return res.status(400).json({ success: false, message: 'This book request has already been issued' });
      }

      if (currentStatus === 'RETURNED') {
        return res.status(400).json({ success: false, message: 'Cannot issue an already returned record' });
      }

      if (currentStatus !== 'PENDING') {
        return res.status(400).json({ success: false, message: `Invalid request status: ${issue.status}` });
      }

      // Find the associated book
      let book = await Book.findOne({ bookId: issue.bookId });
      if (!book && mongoose.Types.ObjectId.isValid(issue.bookId)) {
        book = await Book.findById(issue.bookId);
      }

      if (!book) {
        return res.status(404).json({ success: false, message: 'Associated book not found in catalog' });
      }

      // Check available copies - must be > 0
      if (book.availableCopies <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot issue book: No available copies in stock. Request remains PENDING.',
        });
      }

      // Atomically decrement available copies
      const updatedBook = await Book.findOneAndUpdate(
        { _id: book._id, availableCopies: { $gt: 0 } },
        { $inc: { availableCopies: -1 } },
        { returnDocument: 'after' }
      );

      if (!updatedBook) {
        return res.status(400).json({
          success: false,
          message: 'Cannot issue book: No available copies in stock. Request remains PENDING.',
        });
      }

      bookDecrementedId = book._id;

      // Calculate 15-day loan period
      const issueDate = new Date();
      const dueDate = new Date(issueDate.getTime() + 15 * 24 * 60 * 60 * 1000);

      issue.status = 'ISSUED';
      issue.issueDate = issueDate;
      issue.dueDate = dueDate;
      issue.fine = 0;
      issue.paymentStatus = 'UNPAID';

      await issue.save();

      return res.status(200).json({
        success: true,
        message: 'Book issued successfully with 15-day due date',
        issue,
      });
    }

    // Case 2: Admin is issuing directly by bookId and student userId
    if (!rawBookId || typeof rawBookId !== 'string' || !rawBookId.trim()) {
      return res.status(400).json({ success: false, message: 'bookId or issueId is required' });
    }

    const trimmedBookId = rawBookId.trim();
    let book = await Book.findOne({ bookId: trimmedBookId });
    if (!book && mongoose.Types.ObjectId.isValid(trimmedBookId)) {
      book = await Book.findById(trimmedBookId);
    }

    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    if (book.availableCopies <= 0) {
      return res.status(400).json({ success: false, message: 'Book is not available (0 copies left)' });
    }

    let targetUserId = req.body.userId ? req.body.userId.trim() : req.user.userId;

    const updatedBook = await Book.findOneAndUpdate(
      { _id: book._id, availableCopies: { $gt: 0 } },
      { $inc: { availableCopies: -1 } },
      { returnDocument: 'after' }
    );

    if (!updatedBook) {
      return res.status(400).json({ success: false, message: 'Book is not available (0 copies left)' });
    }

    bookDecrementedId = book._id;

    const issueId = 'ISSUE_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const issueDate = new Date();
    const dueDate = new Date(issueDate.getTime() + 15 * 24 * 60 * 60 * 1000);

    const issue = new BookIssue({
      issueId,
      userId: targetUserId,
      bookId: book.bookId,
      requestDate: issueDate,
      issueDate,
      dueDate,
      returnDate: null,
      status: 'ISSUED',
      fine: 0,
      paymentStatus: 'UNPAID',
    });

    await issue.save();

    return res.status(200).json({
      success: true,
      message: 'Book issued successfully with 15-day due date',
      issue,
    });
  } catch (error) {
    if (bookDecrementedId) {
      await Book.findByIdAndUpdate(bookDecrementedId, { $inc: { availableCopies: 1 } }).catch(() => {});
    }
    console.error('Error issuing book:', error.message);
    return res.status(500).json({ success: false, message: 'Server error while issuing book' });
  }
};

// @desc    Admin returns an issued book (Status: RETURNED, freeze fine, restore copy)
// @route   PUT /returnBook
const returnBook = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Only librarian/admin can return books',
      });
    }

    const rawIssueId = req.body.issueId || req.body.id;
    if (!rawIssueId || typeof rawIssueId !== 'string' || !rawIssueId.trim()) {
      return res.status(400).json({ success: false, message: 'issueId is required' });
    }

    const trimmedIssueId = rawIssueId.trim();

    let issue = await BookIssue.findOne({ issueId: trimmedIssueId });
    if (!issue && mongoose.Types.ObjectId.isValid(trimmedIssueId)) {
      issue = await BookIssue.findById(trimmedIssueId);
    }

    if (!issue) {
      return res.status(404).json({ success: false, message: 'Book issue record not found' });
    }

    const currentStatus = (issue.status || '').toUpperCase();

    if (currentStatus === 'PENDING') {
      return res.status(400).json({
        success: false,
        message: 'Cannot return a book that is still pending approval',
      });
    }

    if (currentStatus === 'RETURNED') {
      return res.status(400).json({
        success: false,
        message: 'Book has already been returned',
      });
    }

    // Find related book
    let book = await Book.findOne({ bookId: issue.bookId });
    if (!book && mongoose.Types.ObjectId.isValid(issue.bookId)) {
      book = await Book.findById(issue.bookId);
    }

    if (!book) {
      return res.status(404).json({ success: false, message: 'Related catalog book not found' });
    }

    const returnDate = new Date();

    // Calculate final fine as of returnDate (fine freezes upon return)
    const fineCalculation = calculateFine({
      ...issue.toObject(),
      status: 'RETURNED',
      returnDate,
    });

    const finalFine = fineCalculation.fine;

    // Atomically update issue status to RETURNED to prevent double return
    const updatedIssue = await BookIssue.findOneAndUpdate(
      {
        _id: issue._id,
        status: { $in: ['ISSUED', 'Issued', 'issued'] },
      },
      {
        $set: {
          status: 'RETURNED',
          returnDate,
          fine: finalFine,
        },
      },
      { returnDocument: 'after' }
    );

    if (!updatedIssue) {
      return res.status(400).json({
        success: false,
        message: 'Book has already been returned or cannot be updated',
      });
    }

    // Atomically increment availableCopies by 1 (cannot exceed total quantity)
    await Book.findOneAndUpdate(
      { _id: book._id, availableCopies: { $lt: book.quantity } },
      { $inc: { availableCopies: 1 } },
      { returnDocument: 'after' }
    );

    return res.status(200).json({
      success: true,
      message: 'Book returned successfully',
      issue: updatedIssue,
      fine: finalFine,
      outstandingFine: updatedIssue.paymentStatus === 'PAID' ? 0 : finalFine,
    });
  } catch (error) {
    console.error('Error returning book:', error.message);
    return res.status(500).json({ success: false, message: 'Server error while returning book' });
  }
};

// @desc    Admin collects/records payment for an outstanding fine
// @route   POST /payFine
const payFine = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Admin authorization required to collect fines',
      });
    }

    const rawIssueId = req.body.issueId || req.body.id;
    if (!rawIssueId || typeof rawIssueId !== 'string' || !rawIssueId.trim()) {
      return res.status(400).json({ success: false, message: 'issueId is required' });
    }

    const trimmedIssueId = rawIssueId.trim();

    let issue = await BookIssue.findOne({ issueId: trimmedIssueId });
    if (!issue && mongoose.Types.ObjectId.isValid(trimmedIssueId)) {
      issue = await BookIssue.findById(trimmedIssueId);
    }

    if (!issue) {
      return res.status(404).json({ success: false, message: 'Issue record not found' });
    }

    if (issue.paymentStatus === 'PAID') {
      return res.status(400).json({
        success: false,
        message: 'Fine for this book loan has already been paid',
      });
    }

    // Calculate current fine
    const currentFineInfo = calculateFine(issue);
    if (currentFineInfo.fine <= 0) {
      return res.status(400).json({
        success: false,
        message: 'No fine is owed for this book',
      });
    }

    // Record payment
    issue.paymentStatus = 'PAID';
    issue.fine = currentFineInfo.fine;
    issue.finePaidAmount = currentFineInfo.fine;
    issue.paidAt = new Date();

    await issue.save();

    return res.status(200).json({
      success: true,
      message: `Fine of ₹${currentFineInfo.fine} recorded as PAID successfully`,
      issue,
    });
  } catch (error) {
    console.error('Error collecting fine:', error.message);
    return res.status(500).json({ success: false, message: 'Server error while collecting fine' });
  }
};

// @desc    Get issued books records with fine details (Student: own; Admin: all)
// @route   GET /issuedBooks
const getIssuedBooks = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const filter = {};

    if (req.user.role !== 'admin') {
      // Authenticated students can only view their own records
      filter.userId = req.user.userId;
    } else {
      if (req.query.userId && typeof req.query.userId === 'string' && req.query.userId.trim()) {
        filter.userId = req.query.userId.trim();
      }
      if (req.query.status && typeof req.query.status === 'string' && req.query.status.trim()) {
        const s = req.query.status.trim().toUpperCase();
        filter.status = { $regex: new RegExp(`^${s}$`, 'i') };
      }
    }

    const issues = await BookIssue.find(filter).sort({ createdAt: -1, issueDate: -1 });

    // Populate associated book and user information for each issue record
    const issuesPopulated = await Promise.all(
      issues.map(async (issue) => {
        let book = await Book.findOne({ bookId: issue.bookId });
        if (!book && mongoose.Types.ObjectId.isValid(issue.bookId)) {
          book = await Book.findById(issue.bookId);
        }

        let user = await User.findOne({ userId: issue.userId }).select('userId name email role');
        if (!user && mongoose.Types.ObjectId.isValid(issue.userId)) {
          user = await User.findById(issue.userId).select('userId name email role');
        }

        const issueObj = issue.toObject();

        // Calculate dynamic fine values
        const fineDetails = calculateFine(issue);
        issueObj.calculatedFine = fineDetails.fine;
        issueObj.fine = fineDetails.fine;
        issueObj.outstandingFine = fineDetails.outstandingFine;
        issueObj.isOverdue = fineDetails.isOverdue;
        issueObj.daysLate = fineDetails.daysLate;

        // Ensure status is normalized uppercase for frontend consistency
        issueObj.status = (issue.status || 'PENDING').toUpperCase();

        if (book) {
          issueObj.book = {
            bookId: book.bookId,
            title: book.title,
            author: book.author,
            category: book.category,
            publisher: book.publisher,
            availableCopies: book.availableCopies,
            quantity: book.quantity,
          };
          issueObj.title = book.title;
          issueObj.author = book.author;
          issueObj.category = book.category;
          issueObj.publisher = book.publisher;
          issueObj.availableCopies = book.availableCopies;
        }

        if (user) {
          issueObj.user = {
            userId: user.userId,
            name: user.name,
            email: user.email,
            role: user.role,
          };
          issueObj.studentName = user.name;
          issueObj.studentEmail = user.email;
        }

        return issueObj;
      })
    );

    return res.status(200).json({
      success: true,
      issues: issuesPopulated,
    });
  } catch (error) {
    console.error('Error fetching issued books:', error.message);
    return res.status(500).json({ success: false, message: 'Server error while fetching issued books' });
  }
};

module.exports = {
  calculateFine,
  requestBook,
  issueBook,
  returnBook,
  payFine,
  getIssuedBooks,
};
