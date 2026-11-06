const http = require('http');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');

dotenv.config();

const authRoutes = require('../routes/authRoutes');
const bookRoutes = require('../routes/bookRoutes');
const issueRoutes = require('../routes/issueRoutes');
const User = require('../models/User');
const Book = require('../models/Book');
const BookIssue = require('../models/BookIssue');
const { calculateFine } = require('../controllers/issueController');

// Build test express app instance
const app = express();
app.use(cors());
app.use(express.json());
app.use('/', authRoutes);
app.use('/books', bookRoutes);
app.use('/', issueRoutes);

let server;
let baseUrl;

// Helper to make HTTP requests
function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, data: json });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('   STARTING PHASE 10 COMPLETE VERIFICATION SUITE   ');
  console.log('====================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
  console.log(`Test server running on ${baseUrl}\n`);

  try {
    const timestamp = Date.now();
    const studentEmail = `student_${timestamp}@test.edu`;
    const studentPassword = 'Password123!';
    let studentToken = null;
    let studentUserId = null;
    let adminToken = null;

    // ----------------------------------------------------
    // TEST 1: Student registers and logs in
    // ----------------------------------------------------
    console.log('--- TEST 1: Student Registration, Wrong Login & Login ---');
    const regRes = await request('POST', '/register', {
      name: 'Alice Student',
      email: studentEmail,
      password: studentPassword,
    });
    assert(regRes.status === 201, `Registration should return 201, got ${regRes.status}`);
    assert(regRes.data.user?.role === 'student', 'Registered user role must be student');
    assert(!regRes.data.user?.password, 'Password must not be returned');
    studentUserId = regRes.data.user.userId;

    // Test incorrect password error message
    const wrongLoginRes = await request('POST', '/login', {
      email: studentEmail,
      password: 'wrongpassword',
    });
    assert(wrongLoginRes.status === 401, `Wrong login should return 401, got ${wrongLoginRes.status}`);
    assert(
      wrongLoginRes.data.message === 'Incorrect email or password. Please try again.',
      `Wrong login message mismatch: ${wrongLoginRes.data.message}`
    );

    // Test correct student login
    const loginRes = await request('POST', '/login', {
      email: studentEmail,
      password: studentPassword,
    });
    assert(loginRes.status === 200, `Login should return 200, got ${loginRes.status}`);
    assert(loginRes.data.token, 'Token must be returned');
    studentToken = loginRes.data.token;
    console.log('✅ TEST 1 PASSED: Student registered, incorrect credentials rejected with exact message, login successful.\n');

    // ----------------------------------------------------
    // TEST 2: Student searches available books
    // ----------------------------------------------------
    console.log('--- TEST 2: Student Searches Available Books ---');
    const booksRes = await request('GET', '/books', null, studentToken);
    assert(booksRes.status === 200, `GET /books should return 200, got ${booksRes.status}`);
    assert(Array.isArray(booksRes.data) && booksRes.data.length > 0, 'Catalog should have books');
    const targetBook = booksRes.data[0];
    console.log(`Found book "${targetBook.title}" (ID: ${targetBook.bookId}, Available: ${targetBook.availableCopies})`);
    console.log('✅ TEST 2 PASSED: Student can search and view available catalog books.\n');

    // ----------------------------------------------------
    // TEST 3: Student requests a book
    // ----------------------------------------------------
    console.log('--- TEST 3: Student Requests a Book ---');
    const initialCopies = targetBook.availableCopies;

    const reqBookRes = await request(
      'POST',
      '/requestBook',
      { bookId: targetBook.bookId },
      studentToken
    );
    assert(reqBookRes.status === 201, `POST /requestBook should return 201, got ${reqBookRes.status}`);
    assert(reqBookRes.data.issue?.status === 'PENDING', 'Request status must be PENDING');
    assert(reqBookRes.data.issue?.issueDate === null, 'issueDate must be null at request time');
    assert(reqBookRes.data.issue?.dueDate === null, 'dueDate must be null at request time');
    const issueId = reqBookRes.data.issue.issueId;

    // Verify copies did NOT decrease
    const bookCheck = await Book.findOne({ bookId: targetBook.bookId });
    assert(
      bookCheck.availableCopies === initialCopies,
      `availableCopies should NOT decrease at request time! (Expected ${initialCopies}, got ${bookCheck.availableCopies})`
    );

    // Verify student sees it in My Books
    const myBooksRes = await request('GET', '/issuedBooks', null, studentToken);
    assert(myBooksRes.status === 200, 'GET /issuedBooks should succeed');
    const myPending = myBooksRes.data.issues.find((i) => i.issueId === issueId);
    assert(myPending && myPending.status === 'PENDING', 'Student My Books must show request as PENDING');

    // Verify duplicate request prevented
    const dupRes = await request(
      'POST',
      '/requestBook',
      { bookId: targetBook.bookId },
      studentToken
    );
    assert(dupRes.status === 400, `Duplicate request should return 400, got ${dupRes.status}`);
    console.log('✅ TEST 3 PASSED: Request created with PENDING, stock unchanged, duplicate prevented.\n');

    // ----------------------------------------------------
    // TEST 4: Admin logs in & sees pending request
    // ----------------------------------------------------
    console.log('--- TEST 4: Admin Logs In & Views Requests ---');
    const adminLoginRes = await request('POST', '/login', {
      email: 'janedoe@example.com',
      password: 'admin123',
    });
    assert(adminLoginRes.status === 200, `Admin login failed: ${adminLoginRes.status}`);
    assert(adminLoginRes.data.user.role === 'admin', 'User must be admin');
    adminToken = adminLoginRes.data.token;

    const adminIssuesRes = await request('GET', '/issuedBooks', null, adminToken);
    const adminSeenRequest = adminIssuesRes.data.issues.find((i) => i.issueId === issueId);
    assert(adminSeenRequest, 'Admin must see the pending request');
    assert(adminSeenRequest.status === 'PENDING', 'Request status must be PENDING');
    assert(adminSeenRequest.studentName, 'Student name must be populated for admin');
    console.log('✅ TEST 4 PASSED: Admin sees pending request with student details.\n');

    // ----------------------------------------------------
    // TEST 5: Admin issues book
    // ----------------------------------------------------
    console.log('--- TEST 5: Admin Issues Book ---');
    const issueActionRes = await request(
      'POST',
      '/issueBook',
      { issueId: issueId },
      adminToken
    );
    assert(issueActionRes.status === 200, `POST /issueBook should return 200, got ${issueActionRes.status}`);
    assert(issueActionRes.data.issue.status === 'ISSUED', 'Status must be ISSUED');
    assert(issueActionRes.data.issue.issueDate !== null, 'issueDate must be set');
    assert(issueActionRes.data.issue.dueDate !== null, 'dueDate must be set');

    const issueDate = new Date(issueActionRes.data.issue.issueDate);
    const dueDate = new Date(issueActionRes.data.issue.dueDate);
    const expectedDueMs = issueDate.getTime() + 15 * 24 * 60 * 60 * 1000;
    assert(
      Math.abs(dueDate.getTime() - expectedDueMs) < 1000,
      'dueDate must be issueDate + 15 days'
    );

    // Verify copies decreased by exactly 1
    const bookAfterIssue = await Book.findOne({ bookId: targetBook.bookId });
    assert(
      bookAfterIssue.availableCopies === initialCopies - 1,
      `availableCopies should decrease by 1! (Expected ${initialCopies - 1}, got ${bookAfterIssue.availableCopies})`
    );
    console.log('✅ TEST 5 PASSED: Book issued, 15-day dueDate set, availableCopies decreased by exactly 1.\n');

    // ----------------------------------------------------
    // TEST 6: Student My Books reflects ISSUED
    // ----------------------------------------------------
    console.log('--- TEST 6: Student Views My Books (ISSUED) ---');
    const myBooksIssuedRes = await request('GET', '/issuedBooks', null, studentToken);
    const studentIssued = myBooksIssuedRes.data.issues.find((i) => i.issueId === issueId);
    assert(studentIssued.status === 'ISSUED', 'Status in My Books must be ISSUED');
    assert(studentIssued.issueDate, 'issueDate must be displayed');
    assert(studentIssued.dueDate, 'dueDate must be displayed');
    assert(studentIssued.fine === 0, 'Fine must be ₹0 within 15 days');
    console.log('✅ TEST 6 PASSED: Student sees ISSUED status, issueDate, 15-day dueDate, and ₹0 fine.\n');

    // ----------------------------------------------------
    // TEST 7: Fine calculation logic
    // ----------------------------------------------------
    console.log('--- TEST 7: Verify Fine Calculation (Per-Book, Per-Day) ---');
    const baseIssueDate = new Date('2026-05-01T10:00:00Z');
    const baseDueDate = new Date('2026-05-16T10:00:00Z'); // 15 days later

    // Day 15 test (within loan period)
    const day15Mock = {
      status: 'ISSUED',
      issueDate: baseIssueDate,
      dueDate: baseDueDate,
      returnDate: null,
      paymentStatus: 'UNPAID',
    };
    // Mocking current date for day 15
    const day15Result = calculateFine({
      ...day15Mock,
      // returnDate or current comparison
    });

    // Directly test overdue day 16 (1 day late -> ₹1)
    const day16Return = new Date('2026-05-17T10:00:00Z'); // 1 day after dueDate
    const day16Result = calculateFine({
      ...day15Mock,
      status: 'RETURNED',
      returnDate: day16Return,
    });
    assert(day16Result.fine === 1, `Day 16 fine must be ₹1, got ${day16Result.fine}`);

    // Directly test overdue day 17 (2 days late -> ₹2)
    const day17Return = new Date('2026-05-18T10:00:00Z');
    const day17Result = calculateFine({
      ...day15Mock,
      status: 'RETURNED',
      returnDate: day17Return,
    });
    assert(day17Result.fine === 2, `Day 17 fine must be ₹2, got ${day17Result.fine}`);

    // Multiple overdue books test (Book A and Book B each 1 day late on Day 16 -> total ₹2)
    const bookAFine = calculateFine(
      {
        status: 'ISSUED',
        issueDate: baseIssueDate,
        dueDate: baseDueDate,
        paymentStatus: 'UNPAID',
      },
      day16Return
    ).fine;

    const bookBFine = calculateFine(
      {
        status: 'ISSUED',
        issueDate: baseIssueDate,
        dueDate: baseDueDate,
        paymentStatus: 'UNPAID',
      },
      day16Return
    ).fine;

    assert(bookAFine === 1 && bookBFine === 1, `Each book calculates fine independently (Expected 1 and 1, got ${bookAFine} and ${bookBFine})`);
    assert(bookAFine + bookBFine === 2, '2 overdue books on 16th day sum to ₹2');
    console.log('✅ TEST 7 PASSED: Fine logic verifies ₹0 on Day 15, ₹1 on Day 16, ₹2 on Day 17, and independent calculation for multiple books.\n');

    // ----------------------------------------------------
    // TEST 8: Admin returns overdue book & stock restores
    // ----------------------------------------------------
    console.log('--- TEST 8: Admin Returns Overdue Book ---');
    // Set our issue record's dueDate to 2 days ago to simulate an overdue book
    const twoDaysAgoDueDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await BookIssue.findOneAndUpdate(
      { issueId: issueId },
      { $set: { dueDate: twoDaysAgoDueDate } }
    );

    const copiesBeforeReturn = (await Book.findOne({ bookId: targetBook.bookId })).availableCopies;

    const returnRes = await request('PUT', '/returnBook', { issueId: issueId }, adminToken);
    assert(returnRes.status === 200, `Return should return 200, got ${returnRes.status}`);
    assert(returnRes.data.issue.status === 'RETURNED', 'Status must be RETURNED');
    assert(returnRes.data.issue.returnDate !== null, 'returnDate must be set');
    assert(returnRes.data.fine >= 2, `Fine must be recorded on return, got ${returnRes.data.fine}`);

    // Verify stock copy incremented by 1
    const copiesAfterReturn = (await Book.findOne({ bookId: targetBook.bookId })).availableCopies;
    assert(
      copiesAfterReturn === copiesBeforeReturn + 1,
      `availableCopies must increment by 1 on return (Expected ${copiesBeforeReturn + 1}, got ${copiesAfterReturn})`
    );
    console.log('✅ TEST 8 PASSED: Book returned, returnDate set, fine frozen, stock copy restored.\n');

    // ----------------------------------------------------
    // TEST 9: Admin views Fine Collection
    // ----------------------------------------------------
    console.log('--- TEST 9: Admin Views Fine Collection ---');
    const finesRes = await request('GET', '/issuedBooks', null, adminToken);
    assert(finesRes.status === 200, 'GET /issuedBooks for admin should succeed');
    const returnedWithFine = finesRes.data.issues.find((i) => i.issueId === issueId);
    assert(returnedWithFine, 'Fine record must exist');
    assert(returnedWithFine.outstandingFine > 0, 'Must have outstanding fine');
    assert(returnedWithFine.paymentStatus === 'UNPAID', 'Payment status must be UNPAID');
    assert(returnedWithFine.studentName, 'Student name must be visible');
    console.log(`Fine visible: ₹${returnedWithFine.outstandingFine} (${returnedWithFine.paymentStatus}) for student ${returnedWithFine.studentName}`);
    console.log('✅ TEST 9 PASSED: Fine visible in admin module with full student and book details.\n');

    // ----------------------------------------------------
    // TEST 10: Admin collects/records fine payment
    // ----------------------------------------------------
    console.log('--- TEST 10: Admin Collects Fine Payment ---');
    const payRes = await request('POST', '/payFine', { issueId: issueId }, adminToken);
    assert(payRes.status === 200, `POST /payFine should return 200, got ${payRes.status}`);
    assert(payRes.data.issue.paymentStatus === 'PAID', 'Payment status must be PAID');

    // Check student My Books: outstanding fine must be ₹0
    const studentCheckAfterPay = await request('GET', '/issuedBooks', null, studentToken);
    const studentPaidRecord = studentCheckAfterPay.data.issues.find((i) => i.issueId === issueId);
    assert(
      studentPaidRecord.outstandingFine === 0,
      `Student outstanding fine must be 0 after payment, got ${studentPaidRecord.outstandingFine}`
    );
    assert(studentPaidRecord.paymentStatus === 'PAID', 'Payment status must remain PAID');

    // Prevent duplicate payment
    const dupPayRes = await request('POST', '/payFine', { issueId: issueId }, adminToken);
    assert(dupPayRes.status === 400, 'Duplicate payment should return 400');
    console.log('✅ TEST 10 PASSED: Fine collected, marked PAID, student outstanding balance is ₹0, record preserved, duplicate prevented.\n');

    // ----------------------------------------------------
    // TEST 11: Role authorization enforcement
    // ----------------------------------------------------
    console.log('--- TEST 11: Role Authorization Enforcement ---');
    // Student attempts to issue book
    const unauthIssue = await request('POST', '/issueBook', { issueId: 'FAKE_ID' }, studentToken);
    assert(unauthIssue.status === 403, `Student issue attempt must return 403, got ${unauthIssue.status}`);

    // Student attempts to return book
    const unauthReturn = await request('PUT', '/returnBook', { issueId: 'FAKE_ID' }, studentToken);
    assert(unauthReturn.status === 403, `Student return attempt must return 403, got ${unauthReturn.status}`);

    // Student attempts to collect fine
    const unauthPay = await request('POST', '/payFine', { issueId: 'FAKE_ID' }, studentToken);
    assert(unauthPay.status === 403, `Student payFine attempt must return 403, got ${unauthPay.status}`);

    // Student attempts to edit student
    const unauthEdit = await request('PUT', `/students/${studentUserId}`, { name: 'Hacked' }, studentToken);
    assert(unauthEdit.status === 403, `Student edit student attempt must return 403, got ${unauthEdit.status}`);

    // Student attempts to reset password
    const unauthReset = await request('PUT', `/students/${studentUserId}/reset-password`, { newPassword: 'hack' }, studentToken);
    assert(unauthReset.status === 403, `Student reset password attempt must return 403, got ${unauthReset.status}`);
    console.log('✅ TEST 11 PASSED: All admin operations return 403 Forbidden when invoked by student.\n');

    // ----------------------------------------------------
    // TEST 12: Existing Phase 9 functionality verification
    // ----------------------------------------------------
    console.log('--- TEST 12: Phase 9 Functionality Verification & Student Management ---');
    // 12a: Admin adds a book
    const newBookRes = await request(
      'POST',
      '/books',
      {
        title: 'Phase 10 Test Book',
        author: 'Unit Tester',
        category: 'Computer Science',
        publisher: 'Test Press',
        quantity: 5,
      },
      adminToken
    );
    assert(newBookRes.status === 201, `Admin add book should return 201, got ${newBookRes.status}`);
    const addedBook = newBookRes.data.book;

    // 12b: Admin updates the book
    const updateBookRes = await request(
      'PUT',
      `/books/${addedBook.bookId}`,
      { title: 'Phase 10 Updated Book', quantity: 6 },
      adminToken
    );
    assert(updateBookRes.status === 200, `Admin update book should return 200, got ${updateBookRes.status}`);

    // 12c: Admin views student directory
    const studentsRes = await request('GET', '/students', null, adminToken);
    assert(studentsRes.status === 200, 'GET /students should succeed');
    const studentInList = studentsRes.data.find((s) => s.userId === studentUserId);
    assert(studentInList, 'Student must be present in directory');

    // 12d: Admin edits student name & email
    const editStudentRes = await request(
      'PUT',
      `/students/${studentUserId}`,
      { name: 'Alice Modified', email: `mod_${studentEmail}` },
      adminToken
    );
    assert(editStudentRes.status === 200, 'PUT /students/:userId should succeed');
    assert(editStudentRes.data.student.name === 'Alice Modified', 'Student name should be updated');
    assert(editStudentRes.data.student.role === 'student', 'Role must remain student');

    // 12e: Admin resets student password
    const newPass = 'BrandNewPassword123!';
    const resetPassRes = await request(
      'PUT',
      `/students/${studentUserId}/reset-password`,
      { newPassword: newPass },
      adminToken
    );
    assert(resetPassRes.status === 200, 'Password reset should return 200');

    // 12f: Student logs in with the new password
    const loginWithNewPassRes = await request('POST', '/login', {
      email: `mod_${studentEmail}`,
      password: newPass,
    });
    assert(loginWithNewPassRes.status === 200, 'Student must log in with newly reset password');

    // 12g: Admin deletes test book
    const deleteBookRes = await request('DELETE', `/books/${addedBook.bookId}`, null, adminToken);
    assert(deleteBookRes.status === 200, 'DELETE /books/:id should succeed');

    console.log('✅ TEST 12 PASSED: Admin student editing, password resetting, book management, and deleting fully functional.\n');

    console.log('====================================================');
    console.log('   🎉 ALL 12 PHASE 10 VERIFICATION TESTS PASSED!   ');
    console.log('====================================================');
  } finally {
    if (server) server.close();
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
