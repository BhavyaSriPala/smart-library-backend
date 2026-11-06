const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const bookRoutes = require('./routes/bookRoutes');
const issueRoutes = require('./routes/issueRoutes');

// Load environment variables from .env
dotenv.config();

// Connect to MongoDB Atlas
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Sanitize trailing newlines or spaces from URLs (e.g., accidental Enter in Postman)
app.use((req, res, next) => {
  req.url = req.url.replace(/(%0[aAdD]|\s)+$/g, '');
  next();
});

// Ensure DB is connected before handling requests
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

// Routes - support both root and /api prefixes
app.use('/', authRoutes);
app.use('/api', authRoutes);

app.use('/books', bookRoutes);
app.use('/api/books', bookRoutes);

app.use('/', issueRoutes);
app.use('/api', issueRoutes);

// Basic health check endpoint
app.get(['/', '/api'], (req, res) => {
  res.send('Smart Library Backend is Running');
});

// Port configuration
const PORT = process.env.PORT || 5000;

// Start server when run directly (local / traditional server)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

// Export for Vercel serverless function support
module.exports = app;
