// routes/auth.js
const express = require('express');
const router = express.Router();
const User = require('../models/User'); 
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const JWT_SECRET = process.env.JWT_SECRET; 

// Helper to generate JWT
const generateToken = (id, role, zone) => { 
    return jwt.sign(
        { user: { id, role, zone } }, 
        JWT_SECRET,
        { expiresIn: '30d' }
    );
};

// ... (Signup route remains the same)

// @route POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password, role } = req.body;
    const trimmedEmail = email ? email.trim() : null; 
    let user = null;

    try {
        console.log(`[AUTH] Login attempt for: ${trimmedEmail}, Role: ${role}`); 

        // 🟢 ATTEMPT 1: Robust, Case-Insensitive Search (Current method)
        user = await User.findOne({ email: { $regex: new RegExp(trimmedEmail, "i") } });

        if (!user) {
            console.log(`[AUTH] Lookup Fallback: Regex failed. Trying simple match.`);
            
            // 🚀 ATTEMPT 2: Fallback to Simple, Exact Match on the email field.
            // This bypasses any regex issues and relies on the primary email index.
            user = await User.findOne({ email: trimmedEmail });
        }
        
        // Final check after both attempts
        if (!user) {
            console.log(`[AUTH] Login failed: User not found for ${trimmedEmail}`);
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // --- Authentication & Authorization Checks ---
        
        // 1. Password Check
        if (!(await user.matchPassword(password))) {
            console.log(`[AUTH] Login failed: Password mismatch for ${trimmedEmail}`);
            return res.status(401).json({ message: 'Invalid email or password' });
        }
        
        // 2. Role Check
        if (user.role !== role) {
            console.log(`[AUTH] Login failed: Role mismatch. Expected ${role}, got ${user.role}`);
            return res.status(403).json({ message: 'Invalid credentials or role mismatch.' });
        }
        
        // Success response
        const token = generateToken(user._id, user.role, user.zone);
        res.json({
            _id: user._id,
            email: user.email,
            role: user.role,
            zone: user.zone, 
            token: token,
        });
        console.log(`[AUTH] Login successful for ${trimmedEmail}. Response sent.`);

    } catch (err) {
        console.error(`[AUTH] Server error during login for ${trimmedEmail}:`, err);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

module.exports = router;