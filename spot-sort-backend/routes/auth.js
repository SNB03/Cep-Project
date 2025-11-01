
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Helper to generate JWT
const generateToken = (id, role) => {
    return jwt.sign({ id, role }, process.env.JWT_SECRET, {
        expiresIn: '30d', // Token expires in 30 days
    });
};

// @route   POST /api/auth/signup
// @desc    Register a new user (Citizen role)
// @access  Public
router.post('/signup', async (req, res) => {
    const { name, email, password, mobileNumber, gender, dateOfBirth } = req.body;

    const userExists = await User.findOne({ email });

    if (userExists) {
        return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({
        name,
        email,
        password,
        mobileNumber,
        gender,
        dateOfBirth,
        role: 'citizen', // Default role for signup
    });

    if (user) {
        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id, user.role),
        });
    } else {
        res.status(400).json({ message: 'Invalid user data' });
    }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
    const { email, password, role } = req.body; // Expecting role from frontend select

    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
        // Additional check to ensure the user is logging in with the correct role (optional but good for demo)
        if (user.role !== role) {
             return res.status(401).json({ message: 'Invalid credentials or role mismatch.' });
        }
        
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id, user.role),
        });
    } else {
        res.status(401).json({ message: 'Invalid email or password' });
    }
});

module.exports = router;