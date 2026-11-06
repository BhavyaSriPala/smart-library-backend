const bcrypt = require('bcryptjs');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');

// @desc    Register a new student user
// @route   POST /register
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 1. Validate that name is provided
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }

    // 2. Validate that email is provided
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // 3. Validate that password is provided
    if (!password || typeof password !== 'string' || !password.trim()) {
      return res.status(400).json({ message: 'Password is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 4. Check whether the email already exists
    const existingUser = await User.findOne({ email: normalizedEmail });

    // 5. If email already exists, return an appropriate error response
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // 6. Generate a userId
    const userId = 'USER_' + Date.now();

    // 7. Hash the password using bcryptjs
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 8. Set role to "student" (ignore any role passed from client)
    const role = 'student';

    // 9. Save the user to MongoDB Atlas
    const user = new User({
      userId,
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role,
    });

    await user.save();

    // 10. Return a successful JSON response without the password
    return res.status(201).json({
      message: 'User registered successfully',
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    // Check for duplicate key error (code 11000)
    if (error.code === 11000) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    console.error('Registration error:', error.message);
    return res.status(500).json({ message: 'Server error during registration' });
  }
};

// @desc    Authenticate user & get token
// @route   POST /login
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Check that email and password are provided
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }

    if (!password || typeof password !== 'string' || !password.trim()) {
      return res.status(400).json({ message: 'Password is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 2. Find the user by email
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      // 4. Return an appropriate authentication error
      return res.status(401).json({ message: 'Incorrect email or password. Please try again.' });
    }

    // 3. Compare the entered password with the stored bcryptjs password hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // 4. Return an appropriate authentication error
      return res.status(401).json({ message: 'Incorrect email or password. Please try again.' });
    }

    // 5. If credentials are correct, generate a JWT
    const token = generateToken(user.userId, user.role);

    // 6. Return the JWT and safe user information
    return res.status(200).json({
      message: 'Login successful',
      token,
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ message: 'Server error during login' });
  }
};

// @desc    Get all registered students (Admin only)
// @route   GET /students
const getStudents = async (req, res) => {
  try {
    // Filter by role === "student" to exclude admin/librarian accounts
    // Select only safe fields: userId, name, email, role (password explicitly omitted)
    const students = await User.find({ role: 'student' })
      .select('userId name email role')
      .sort({ name: 1 });

    return res.status(200).json(students);
  } catch (error) {
    console.error('Error fetching students:', error.message);
    return res.status(500).json({ message: 'Server error while fetching students' });
  }
};

// @desc    Update student name and email (Admin only)
// @route   PUT /students/:userId
const updateStudent = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email } = req.body;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ message: 'Student userId is required' });
    }

    // Find student (ensure user is a student, not another admin)
    const student = await User.findOne({
      $or: [{ userId: userId.trim() }, { _id: userId.trim().match(/^[0-9a-fA-F]{24}$/) ? userId.trim() : null }],
      role: 'student',
    });

    if (!student) {
      return res.status(404).json({ message: 'Student record not found' });
    }

    // Validate and update name
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: 'Name cannot be empty' });
      }
      student.name = name.trim();
    }

    // Validate and update email
    if (email !== undefined) {
      if (typeof email !== 'string' || !email.trim()) {
        return res.status(400).json({ message: 'Email cannot be empty' });
      }
      const normalizedEmail = email.trim().toLowerCase();

      // Ensure email is not already taken by another user
      const existingUser = await User.findOne({
        email: normalizedEmail,
        userId: { $ne: student.userId },
      });
      if (existingUser) {
        return res.status(400).json({ message: 'Email is already in use by another user' });
      }
      student.email = normalizedEmail;
    }

    // Explicitly ensure role remains "student" (admin cannot change role)
    student.role = 'student';

    await student.save();

    return res.status(200).json({
      message: 'Student details updated successfully',
      student: {
        userId: student.userId,
        name: student.name,
        email: student.email,
        role: student.role,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email is already in use by another user' });
    }
    console.error('Error updating student:', error.message);
    return res.status(500).json({ message: 'Server error while updating student details' });
  }
};

// @desc    Reset a student's password (Admin only)
// @route   PUT /students/:userId/reset-password
const resetStudentPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ message: 'Student userId is required' });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }

    const student = await User.findOne({
      $or: [{ userId: userId.trim() }, { _id: userId.trim().match(/^[0-9a-fA-F]{24}$/) ? userId.trim() : null }],
      role: 'student',
    });

    if (!student) {
      return res.status(404).json({ message: 'Student record not found' });
    }

    // Hash the new password using existing bcryptjs implementation
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    student.password = hashedPassword;
    await student.save();

    // NEVER return password or password hash to frontend
    return res.status(200).json({
      message: 'Student password has been reset successfully',
      userId: student.userId,
    });
  } catch (error) {
    console.error('Error resetting student password:', error.message);
    return res.status(500).json({ message: 'Server error while resetting student password' });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getStudents,
  updateStudent,
  resetStudentPassword,
};


