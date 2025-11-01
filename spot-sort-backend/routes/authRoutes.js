const express = require('express');
const router = express.Router();
const User = require('../models/User'); 
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const sendEmail = require('../utils/sendEmail'); // Utility for sending emails

const JWT_SECRET =process.env.JWT_SECRET; 

// Helper to generate JWT
//const JWT_SECRET = process.env.JWT_SECRET; // This must match the secret used in protect.js

// Helper to generate JWT
const generateToken = (id, role, zone) => { 
    if (!JWT_SECRET) {
        // If it's missing, log a fatal error and throw an exception to halt the server 
        // before a bad token is generated.
        console.error("CRITICAL ERROR: JWT_SECRET is undefined. Check .env file.");
        throw new Error("JWT_SECRET must be defined for authentication.");
    }
    
    const userIdString = id ? id.toString() : null; 

    return jwt.sign(
        { 
            user: { 
                id: userIdString, 
                role, 
                zone 
            } 
        }, 
        JWT_SECRET, // Use the required environment variable value directly
        { expiresIn: '30d' }
    );
};

// --- AUTHENTICATION ENDPOINTS ---

// @route POST /api/auth/request-otp (Step 1 of Signup)
router.post('/request-otp', async (req, res) => {
    const { 
        name, email, password, mobileNumber, gender, dateOfBirth, role = 'citizen' 
    } = req.body;

    if (!name || !email || !password || !mobileNumber || !gender || !dateOfBirth) {
        return res.status(400).json({ message: 'Please ensure all fields are filled.' });
    }

    try {
        let user = await User.findOne({ email });

        if (user && user.isVerified) {
            return res.status(400).json({ message: 'User already exists and is verified.' });
        }

        // --- OTP Generation & Setup ---
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiryTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

        if (!user) {
            // New User: Create the user entry
            user = await User.create({
                name, email, password, mobileNumber, gender, 
                dateOfBirth: new Date(dateOfBirth), 
                role,
                isVerified: false, 
                otp: otpCode,
                otpExpires: otpExpiryTime,
            });
        } else {
            // Existing, unverified user: Update their OTP
            user.otp = otpCode;
            user.otpExpires = otpExpiryTime;
            await user.save(); 
        }

        // --- Send OTP Email ---
        const emailMessage = `
            <h1>Account Verification</h1>
            <p>Your verification code for Spot & Sort is:</p>
            <h2 style="color: #10b981;">${otpCode}</h2>
            <p>This code is valid for 10 minutes.</p>
        `;

        await sendEmail({
            email: user.email,
            subject: 'Spot & Sort: Email Verification Code',
            message: emailMessage,
        });

        res.status(200).json({ message: 'Verification code sent successfully.', email: user.email });

    } catch (error) {
        console.error(`[AUTH] OTP Request Error for ${email}:`, error.message);
        if (error.code === 11000) {
            return res.status(400).json({ message: 'A user with this email already exists.' });
        }
        res.status(500).json({ message: error.message || 'Server error during OTP request.' });
    }
});

// @route POST /api/auth/verify-otp (Step 2 of Signup)
router.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ message: 'Email and OTP are required.' });
    }

    try {
        // Find user, explicitly requesting the hidden otp/otpExpires fields
        const user = await User.findOne({ email }).select('+otp +otpExpires');

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (user.isVerified) {
            return res.status(400).json({ message: 'Account is already verified.' });
        }
        
        // 1. Check Expiration
        if (user.otpExpires < new Date()) {
            return res.status(400).json({ message: 'OTP expired. Please request a new code.' });
        }

        // 2. Check OTP Match
        if (user.otp !== otp) {
            return res.status(400).json({ message: 'Invalid verification code.' });
        }

        // 3. SUCCESS: Verify the account and clean up OTP fields
        user.isVerified = true;
        user.otp = undefined;
        user.otpExpires = undefined;

        await user.save(); 

        // Generate token for immediate login after verification
        const token = generateToken(user._id, user.role, user.zone);
        
        res.status(200).json({
            message: 'Account successfully verified!',
            _id: user._id,
            email: user.email,
            role: user.role,
            token: token,
        });

    } catch (error) {
        console.error(`[AUTH] OTP Verification Error for ${email}:`, error.message);
        res.status(500).json({ message: 'Server error during OTP verification.' });
    }
});


// @route POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password, role } = req.body;
    const trimmedEmail = email ? email.trim() : null; 
    
    try {
        console.log(`[AUTH] Login attempt for: ${trimmedEmail}, Role: ${role}`); 

        // 1. Find User by trimmed or case-insensitive email
        const user = await User.findOne({ 
             $or: [
                 { email: trimmedEmail }, 
                 { email: { $regex: new RegExp(trimmedEmail, "i") } }
             ]
        });
        
        // Final check: Did we find a user?
        if (!user) {
            console.log(`[AUTH] Login failed: User not found for ${trimmedEmail}`);
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // 2. Password Check
        if (!(await user.matchPassword(password))) {
            console.log(`[AUTH] Login failed: Password mismatch for ${trimmedEmail}`);
            return res.status(401).json({ message: 'Invalid email or password' });
        }
        
        // 3. 🛑 CRITICAL FIX: Account Verification Status Check
        if (!user.isVerified) {
            console.log(`[AUTH] Login failed: Account not verified for ${trimmedEmail}`);
            return res.status(403).json({ message: 'Account not verified. Check your email for the verification code.' });
        }

        // 4. Role Check
        if (user.role !== role) {
            console.log(`[AUTH] Login failed: Role mismatch. Expected ${role}, got ${user.role}`);
            return res.status(403).json({ message: 'Invalid credentials or role mismatch.' });
        }
        
        // 5. Success response
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