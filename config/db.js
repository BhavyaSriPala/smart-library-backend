const mongoose = require('mongoose');

// Asynchronous function to connect to MongoDB Atlas
const connectDB = async () => {
  try {
    const connUri = process.env.MONGODB_URI;

    // Check if the MongoDB URI is defined in the environment variables
    if (!connUri) {
      console.log('MongoDB URI is not set in .env. Waiting for MongoDB Atlas connection string...');
      return;
    }

    // Reuse existing connection if already connected (vital for serverless deployments like Vercel)
    if (mongoose.connection.readyState >= 1) {
      return;
    }

    // Connect to MongoDB Atlas using Mongoose
    const conn = await mongoose.connect(connUri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    // Clearly report connection errors without logging sensitive credentials
    console.error(`MongoDB connection error: ${error.message}`);
  }
};

module.exports = connectDB;
