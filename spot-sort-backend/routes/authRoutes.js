// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User'); // Assuming your User model is here
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Ensure you import JWT_SECRET from middleware/auth.js
// If not, explicitly define it here (but make sure it's the SAME as in auth.js)
const { JWT_SECRET } = require('../middleware/auth'); 

// Helper function to generate a JWT token
const generateToken = (user) => {
    return jwt.sign(
        { user: { id: user._id, role: user.role, zone: user.zone } },
        JWT_SECRET,
        { expiresIn: '1h' } // Token expires in 1 hour
    );
};

// @route POST /api/auth/login
// @desc Authenticate user & get token
// @access Public
// router.post('/login', async (req, res) => {
//     const { email, password, role } = req.body;

//     try {
//         console.log(`[AUTH] Login attempt for: ${email}, Role: ${role}`); // LOG 1: Start of request

//         // Check if user exists
//         const user = await User.findOne({ email });
//         if (!user) {
//             console.log(`[AUTH] Login failed: User not found for ${email}`); // LOG: User not found
//             return res.status(400).json({ message: 'Invalid Credentials' });
//         }
//         console.log(`[AUTH] User found: ${user.email}, Expected Role: ${role}, Actual Role: ${user.role}`); // LOG 2: User found

//         // Check if the provided role matches the user's role in DB
//         if (user.role !== role) {
//             console.log(`[AUTH] Login failed: Role mismatch. Expected ${role}, got ${user.role}`); // LOG: Role mismatch
//             return res.status(403).json({ message: 'Not authorized for this role' });
//         }

//         // Compare provided password with hashed password in DB
//         console.log(`[AUTH] Comparing passwords for ${email}...`); // LOG 3: Before bcrypt compare
//         const isMatch = await bcrypt.compare(password, user.password);
//         if (!isMatch) {
//             console.log(`[AUTH] Login failed: Password mismatch for ${email}`); // LOG: Password mismatch
//             return res.status(400).json({ message: 'Invalid Credentials' });
//         }
//         console.log(`[AUTH] Password matched for ${email}.`); // LOG 4: After bcrypt compare

//         // Generate JWT Token
//         console.log(`[AUTH] Generating JWT for ${email}...`); // LOG 5: Before token generation
//         const token = generateToken(user);
//         console.log(`[AUTH] JWT generated for ${email}.`); // LOG 6: After token generation

//         // Send response
//         res.json({ token, role: user.role, userId: user._id, zone: user.zone });
//         console.log(`[AUTH] Login successful for ${email}. Response sent.`); // LOG 7: Response sent

//     } catch (err) {
//         console.error(`[AUTH] Server error during login for ${email}:`, err); // LOG: Error caught
//         res.status(500).json({ message: 'Server error during login.' });
//     }
// });
router.post('/login', async (req, res) => {
    const { email, password, role } = req.body;

    try {
        console.log(`[AUTH] 1. Starting Login attempt for: ${email}, Role: ${role}`); // LOG 1

        const user = await User.findOne({ email });
        if (!user) { /* ... error response ... */ }
        console.log(`[AUTH] 2. User found. Comparing passwords...`); // LOG 2

        // Comparison is the hang risk!
        const isMatch = await bcrypt.compare(password, user.password); // <--- Potential Hang Point
        if (!isMatch) { /* ... error response ... */ }
        console.log(`[AUTH] 3. Password matched.`); // LOG 3

        // ... (Token generation and response) ...
        console.log(`[AUTH] 4. Response sent.`); // LOG 4

    } catch (err) {
        // ... error handling ...
    }
});

module.exports = router;