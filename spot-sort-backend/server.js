const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
// const dotenv = require('dotenv'); // Uncomment if you use a .env file
// dotenv.config();

const authRoutes = require('./routes/authRoutes');
const issueRoutes = require('./routes/issueRoutes');

const app = express();
const PORT = 5000;

// CRITICAL FIX: Ensure this matches your MongoDB database name exactly
const MONGODB_URI = 'mongodb://localhost:27017/SpotSortDB'; 

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static('uploads')); 

// MongoDB Connection
// Clean up 'User' model on hot-reload to prevent Mongoose errors
if (mongoose.models.User) {
  delete mongoose.models.User;
}

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log(`MongoDB connected successfully to database: ${MONGODB_URI.split('/').pop()}`);
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/issues', issueRoutes);

app.get('/', (req, res) => {
  res.send('Spot & Sort API Running');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});