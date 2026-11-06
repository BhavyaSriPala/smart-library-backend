const mongoose = require('mongoose');

const bookIssueSchema = new mongoose.Schema(
  {
    issueId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    userId: {
      type: String,
      required: true,
      trim: true,
    },
    bookId: {
      type: String,
      required: true,
      trim: true,
    },
    requestDate: {
      type: Date,
      default: Date.now,
    },
    issueDate: {
      type: Date,
      default: null,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    returnDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      required: true,
      enum: [
        'PENDING',
        'ISSUED',
        'RETURNED',
        'Pending',
        'Issued',
        'Returned',
        'pending',
        'issued',
        'returned',
      ],
      default: 'PENDING',
    },
    fine: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ['UNPAID', 'PAID'],
      default: 'UNPAID',
    },
    finePaidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

module.exports = mongoose.model('BookIssue', bookIssueSchema);
