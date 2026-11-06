const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');
const Book = require('../models/Book');
const BookIssue = require('../models/BookIssue');

async function seedDatabase() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI is not set in backend/.env');
    process.exit(1);
  }

  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(mongoUri);
  console.log(`Connected to database: ${mongoose.connection.name}`);

  try {
    const salt = await bcrypt.genSalt(10);

    // ----------------------------------------------------
    // 1. ADMIN ACCOUNTS
    // ----------------------------------------------------
    const adminAccounts = [
      {
        userId: 'USER_ADMIN_1',
        name: 'Admin',
        email: 'admin123@gmail.com',
        rawPassword: 'admin@123',
        role: 'admin',
      },
      {
        userId: 'USER_ADMIN_LIBRARIAN1',
        name: 'librarian1',
        email: 'librarian123@gmail.com',
        rawPassword: 'Librarian@123',
        role: 'admin',
      },
    ];

    console.log('\n--- Seeding Admin Accounts ---');
    for (const adm of adminAccounts) {
      const hashedPassword = await bcrypt.hash(adm.rawPassword, salt);
      const existing = await User.findOne({ email: adm.email });
      if (existing) {
        existing.role = 'admin';
        existing.name = adm.name;
        existing.password = hashedPassword;
        await existing.save();
        console.log(`✅ Admin updated: ${adm.name} (${adm.email})`);
      } else {
        await User.create({
          userId: adm.userId,
          name: adm.name,
          email: adm.email,
          password: hashedPassword,
          role: 'admin',
        });
        console.log(`✅ Admin created: ${adm.name} (${adm.email})`);
      }
    }

    // ----------------------------------------------------
    // 2. STUDENT ACCOUNTS (@gmail.com)
    // ----------------------------------------------------
    const studentAccounts = [
      {
        userId: 'USER_STU_RAHUL',
        name: 'Rahul Sharma',
        email: 'rahul.sharma2026@gmail.com',
        rawPassword: 'Student@123',
        role: 'student',
      },
      {
        userId: 'USER_STU_PRIYA',
        name: 'Priya Patel',
        email: 'priya.patel2026@gmail.com',
        rawPassword: 'Student@123',
        role: 'student',
      },
      {
        userId: 'USER_STU_ANANYA',
        name: 'Ananya Verma',
        email: 'ananya.verma2026@gmail.com',
        rawPassword: 'Student@123',
        role: 'student',
      },
      {
        userId: 'USER_STU_KARTHIK',
        name: 'Karthik Reddy',
        email: 'karthik.reddy2026@gmail.com',
        rawPassword: 'Student@123',
        role: 'student',
      },
    ];

    console.log('\n--- Seeding Student Accounts ---');
    for (const stu of studentAccounts) {
      const hashedPassword = await bcrypt.hash(stu.rawPassword, salt);
      const existing = await User.findOne({ email: stu.email });
      if (existing) {
        existing.role = 'student';
        existing.name = stu.name;
        existing.password = hashedPassword;
        await existing.save();
        console.log(`✅ Student updated: ${stu.name} (${stu.email})`);
      } else {
        await User.create({
          userId: stu.userId,
          name: stu.name,
          email: stu.email,
          password: hashedPassword,
          role: 'student',
        });
        console.log(`✅ Student created: ${stu.name} (${stu.email})`);
      }
    }

    // Retrieve Bhavya Sri if present
    const bhavyaStudent = await User.findOne({ email: 'sasirekha2400@gmail.com' });
    const rahulUser = await User.findOne({ email: 'rahul.sharma2026@gmail.com' });
    const priyaUser = await User.findOne({ email: 'priya.patel2026@gmail.com' });
    const ananyaUser = await User.findOne({ email: 'ananya.verma2026@gmail.com' });
    const karthikUser = await User.findOne({ email: 'karthik.reddy2026@gmail.com' });

    // ----------------------------------------------------
    // 3. CATALOG BOOKS
    // ----------------------------------------------------
    console.log('\n--- Seeding Catalog Books ---');
    const catalogBooks = [
      {
        bookId: 'BOOK_1001',
        title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
        author: 'Robert C. Martin',
        category: 'Computer Science',
        publisher: 'Prentice Hall',
        quantity: 5,
        availableCopies: 4, // 1 active loan to Rahul
      },
      {
        bookId: 'BOOK_1002',
        title: 'Introduction to Algorithms (4th Edition)',
        author: 'Thomas H. Cormen, Charles E. Leiserson',
        category: 'Computer Science',
        publisher: 'MIT Press',
        quantity: 6,
        availableCopies: 5, // 1 active loan to Bhavya
      },
      {
        bookId: 'BOOK_1003',
        title: 'Design Patterns: Elements of Reusable Object-Oriented Software',
        author: 'Erich Gamma, Richard Helm, Ralph Johnson, John Vlissides',
        category: 'Software Engineering',
        publisher: 'Addison-Wesley',
        quantity: 4,
        availableCopies: 4, // returned
      },
      {
        bookId: 'BOOK_1004',
        title: 'Database System Concepts (7th Edition)',
        author: 'Abraham Silberschatz, Henry F. Korth, S. Sudarshan',
        category: 'Database Systems',
        publisher: 'McGraw-Hill',
        quantity: 5,
        availableCopies: 4, // 1 active loan to Priya
      },
      {
        bookId: 'BOOK_1005',
        title: 'Computer Networking: A Top-Down Approach',
        author: 'James F. Kurose, Keith W. Ross',
        category: 'Networking',
        publisher: 'Pearson',
        quantity: 4,
        availableCopies: 4, // returned
      },
      {
        bookId: 'BOOK_1006',
        title: 'Operating System Concepts (10th Edition)',
        author: 'Abraham Silberschatz, Peter B. Galvin, Greg Gagne',
        category: 'Operating Systems',
        publisher: 'Wiley',
        quantity: 5,
        availableCopies: 5, // pending request
      },
      {
        bookId: 'BOOK_1007',
        title: 'Artificial Intelligence: A Modern Approach',
        author: 'Stuart Russell, Peter Norvig',
        category: 'Artificial Intelligence',
        publisher: 'Pearson',
        quantity: 4,
        availableCopies: 3, // 1 active loan to Ananya
      },
      {
        bookId: 'BOOK_1008',
        title: 'The Pragmatic Programmer: Your Journey To Mastery',
        author: 'Andrew Hunt, David Thomas',
        category: 'Software Engineering',
        publisher: 'Addison-Wesley',
        quantity: 3,
        availableCopies: 3, // returned
      },
      {
        bookId: 'BOOK_1009',
        title: 'Deep Learning',
        author: 'Ian Goodfellow, Yoshua Bengio, Aaron Courville',
        category: 'Machine Learning',
        publisher: 'MIT Press',
        quantity: 3,
        availableCopies: 3, // pending request
      },
      {
        bookId: 'BOOK_1010',
        title: 'Digital Logic and Computer Design',
        author: 'M. Morris Mano',
        category: 'Electrical Engineering',
        publisher: 'Prentice Hall',
        quantity: 5,
        availableCopies: 5, // returned
      },
    ];

    for (const b of catalogBooks) {
      await Book.findOneAndUpdate(
        { bookId: b.bookId },
        { $set: b },
        { upsert: true, returnDocument: 'after' }
      );
      console.log(`  + Book synced: "${b.title}" (${b.bookId}) - Available: ${b.availableCopies}/${b.quantity}`);
    }

    // ----------------------------------------------------
    // 4. TRANSACTIONS, RETURNS, AND OVERDUE FINES
    // ----------------------------------------------------
    console.log('\n--- Seeding Book Issues, Returns & Outstanding Fines ---');
    // Clear previous issues to ensure clean, consistent data
    await BookIssue.deleteMany({});

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const issuesToCreate = [];

    // --- STUDENT 1: Rahul Sharma (2 books with OUTSTANDING FINES) ---
    // 1. Overdue Active Loan (Clean Code): Issued 25 days ago, Due 10 days ago (Fine: ₹10 UNPAID)
    issuesToCreate.push({
      issueId: 'ISSUE_RAHUL_OVERDUE',
      userId: rahulUser.userId,
      bookId: 'BOOK_1001',
      requestDate: new Date(now - 26 * dayMs),
      issueDate: new Date(now - 25 * dayMs),
      dueDate: new Date(now - 10 * dayMs),
      returnDate: null,
      status: 'ISSUED',
      fine: 10,
      paymentStatus: 'UNPAID',
    });

    // 2. Overdue Returned Book (Design Patterns): Issued 35 days ago, Due 20 days ago, Returned 15 days ago (5 days late, Fine: ₹5 UNPAID)
    issuesToCreate.push({
      issueId: 'ISSUE_RAHUL_RET_FINE',
      userId: rahulUser.userId,
      bookId: 'BOOK_1003',
      requestDate: new Date(now - 36 * dayMs),
      issueDate: new Date(now - 35 * dayMs),
      dueDate: new Date(now - 20 * dayMs),
      returnDate: new Date(now - 15 * dayMs),
      status: 'RETURNED',
      fine: 5,
      paymentStatus: 'UNPAID',
    });

    // --- STUDENT 2: Priya Patel (2 books with OUTSTANDING FINES) ---
    // 1. Overdue Active Loan (Database System Concepts): Issued 27 days ago, Due 12 days ago (Fine: ₹12 UNPAID)
    issuesToCreate.push({
      issueId: 'ISSUE_PRIYA_OVERDUE',
      userId: priyaUser.userId,
      bookId: 'BOOK_1004',
      requestDate: new Date(now - 28 * dayMs),
      issueDate: new Date(now - 27 * dayMs),
      dueDate: new Date(now - 12 * dayMs),
      returnDate: null,
      status: 'ISSUED',
      fine: 12,
      paymentStatus: 'UNPAID',
    });

    // 2. Overdue Returned Book (Computer Networking): Issued 40 days ago, Due 25 days ago, Returned 17 days ago (8 days late, Fine: ₹8 UNPAID)
    issuesToCreate.push({
      issueId: 'ISSUE_PRIYA_RET_FINE',
      userId: priyaUser.userId,
      bookId: 'BOOK_1005',
      requestDate: new Date(now - 41 * dayMs),
      issueDate: new Date(now - 40 * dayMs),
      dueDate: new Date(now - 25 * dayMs),
      returnDate: new Date(now - 17 * dayMs),
      status: 'RETURNED',
      fine: 8,
      paymentStatus: 'UNPAID',
    });

    // --- STUDENT 3: Ananya Verma (1 Active on-time loan, 1 Returned on-time) ---
    // 1. Active Loan (AI Modern Approach): Issued 4 days ago, Due in 11 days (Fine: ₹0)
    issuesToCreate.push({
      issueId: 'ISSUE_ANANYA_ACTIVE',
      userId: ananyaUser.userId,
      bookId: 'BOOK_1007',
      requestDate: new Date(now - 5 * dayMs),
      issueDate: new Date(now - 4 * dayMs),
      dueDate: new Date(now + 11 * dayMs),
      returnDate: null,
      status: 'ISSUED',
      fine: 0,
      paymentStatus: 'UNPAID',
    });

    // 2. Returned Book on-time (Pragmatic Programmer): Issued 20 days ago, Returned 10 days ago (Fine: ₹0)
    issuesToCreate.push({
      issueId: 'ISSUE_ANANYA_RETURNED',
      userId: ananyaUser.userId,
      bookId: 'BOOK_1008',
      requestDate: new Date(now - 21 * dayMs),
      issueDate: new Date(now - 20 * dayMs),
      dueDate: new Date(now - 5 * dayMs),
      returnDate: new Date(now - 10 * dayMs),
      status: 'RETURNED',
      fine: 0,
      paymentStatus: 'UNPAID',
    });

    // --- STUDENT 4: Karthik Reddy (1 Pending Request, 1 Returned with PAID fine) ---
    // 1. Pending Request (Deep Learning): Requested 1 day ago
    issuesToCreate.push({
      issueId: 'ISSUE_KARTHIK_PENDING',
      userId: karthikUser.userId,
      bookId: 'BOOK_1009',
      requestDate: new Date(now - 1 * dayMs),
      issueDate: null,
      dueDate: null,
      returnDate: null,
      status: 'PENDING',
      fine: 0,
      paymentStatus: 'UNPAID',
    });

    // 2. Returned Book with Paid Fine (Digital Logic): Returned 3 days late, Fine ₹3 PAID
    issuesToCreate.push({
      issueId: 'ISSUE_KARTHIK_RET_PAID',
      userId: karthikUser.userId,
      bookId: 'BOOK_1010',
      requestDate: new Date(now - 30 * dayMs),
      issueDate: new Date(now - 29 * dayMs),
      dueDate: new Date(now - 14 * dayMs),
      returnDate: new Date(now - 11 * dayMs),
      status: 'RETURNED',
      fine: 3,
      paymentStatus: 'PAID',
      finePaidAmount: 3,
      paidAt: new Date(now - 10 * dayMs),
    });

    // --- EXISTING STUDENT: Bhavya Sri (if present: 1 Active loan, 1 Pending request) ---
    if (bhavyaStudent) {
      issuesToCreate.push({
        issueId: 'ISSUE_BHAVYA_ACTIVE',
        userId: bhavyaStudent.userId,
        bookId: 'BOOK_1002',
        requestDate: new Date(now - 2 * dayMs),
        issueDate: new Date(now - 1 * dayMs),
        dueDate: new Date(now + 14 * dayMs),
        returnDate: null,
        status: 'ISSUED',
        fine: 0,
        paymentStatus: 'UNPAID',
      });

      issuesToCreate.push({
        issueId: 'ISSUE_BHAVYA_PENDING',
        userId: bhavyaStudent.userId,
        bookId: 'BOOK_1006',
        requestDate: new Date(now - 1 * dayMs),
        issueDate: null,
        dueDate: null,
        returnDate: null,
        status: 'PENDING',
        fine: 0,
        paymentStatus: 'UNPAID',
      });
    }

    await BookIssue.insertMany(issuesToCreate);
    console.log(`✅ Seeded ${issuesToCreate.length} circulation transactions across students.`);

    console.log('\n======================================================');
    console.log('🎉 ENHANCED DATABASE SEEDING COMPLETED SUCCESSFULLY!');
    console.log('======================================================');
    console.log('ADMIN ACCOUNTS:');
    console.log('  1) Name: Admin       | Email: admin123@gmail.com     | Password: admin@123');
    console.log('  2) Name: librarian1  | Email: librarian123@gmail.com | Password: Librarian@123');
    console.log('\nSTUDENT ACCOUNTS:');
    console.log('  1) Rahul Sharma   | rahul.sharma2026@gmail.com | Password: Student@123 (2 books with ₹15 outstanding fine)');
    console.log('  2) Priya Patel    | priya.patel2026@gmail.com  | Password: Student@123 (2 books with ₹20 outstanding fine)');
    console.log('  3) Ananya Verma   | ananya.verma2026@gmail.com | Password: Student@123 (Active loan + Clean return)');
    console.log('  4) Karthik Reddy  | karthik.reddy2026@gmail.com| Password: Student@123 (Pending request + Paid fine return)');
    if (bhavyaStudent) {
      console.log('  5) Bhavya sri     | sasirekha2400@gmail.com    | (Active loan + Pending request)');
    }
    console.log('======================================================\n');
  } catch (error) {
    console.error('❌ Error during seeding:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

seedDatabase();
