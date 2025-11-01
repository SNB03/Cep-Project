// routes/issueRoutes.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Issue = require('../models/Issue'); // Assumed path
const User = require('../models/User'); // Assumed path
const { protect, authorize } = require('../middleware/auth');
const router = express.Router();

// 🚨 NODEMAILER and HASHING IMPORTS (Required for anonymous submission logic)
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');


// --- Multer Configuration for File Uploads ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads/';
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir);
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage: storage });


// --- In-Memory OTP Store ---
const otpStore = new Map();


// --- NODEMAILER CONFIGURATION ---
const transporter = nodemailer.createTransport({
    // REPLACE with your email service credentials
    service: 'gmail', 
    auth: {
    user: process.env.user, // Your Gmail address
    pass: process.env.pass    // Your Gmail App Password 
    }
});


// Helper functions
const generateTicketId = (type) => {
    const prefix = type === 'pothole' ? 'P' : (type === 'waste' ? 'W' : 'X');
    return `${prefix}-${Date.now().toString().slice(-6)}`;
};


// --- Function to send OTP email ---
const sendOTPEmail = async (email, otp) => {
    const mailOptions = {
        from: '"Spot & Sort Verification" <YOUR_SERVICE_EMAIL@gmail.com>', 
        to: email,
        subject: `🔒 Your Verification Code is: ${otp}`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <p>Use the code below to verify your email and complete your issue report submission:</p>
                <div style="background-color: #f3f4f6; padding: 15px; font-size: 24px; font-weight: bold; text-align: center; margin: 20px 0; color: #000;">
                    ${otp}
                </div>
                <p>This code expires in 10 minutes.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Verification OTP sent to ${email}.`);
    } catch (error) {
        console.error("Error sending OTP email:", error);
        throw new Error("OTP email service failed to send code.");
    }
};


// --- Function to send FINAL Report ID email ---
const sendReportIdEmail = async (email, ticketId) => {
    const mailOptions = {
        from: '"Spot & Sort Reporting" <YOUR_SERVICE_EMAIL@gmail.com>', 
        to: email,
        subject: `✅ Issue Report Submitted - Your Tracking ID: ${ticketId}`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ccc; border-radius: 8px;">
                <h2 style="color: #10B981;">Thank You for Reporting!</h2>
                <p>Your issue has been successfully logged with the city authorities.</p>
                
                <h3 style="color: #333;">Your unique Tracking ID is:</h3>
                <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; font-size: 24px; font-weight: bold; text-align: center; margin: 20px 0;">
                    ${ticketId}
                </div>
                
                <p>You can use this ID on our "Track Your Report" page to check its status at any time.</p>
                <p>— The Spot & Sort Team</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email successfully sent to ${email} with Ticket ID: ${ticketId}`);
    } catch (error) {
        console.error("Error sending email:", error);
        throw new Error("Email service failed to send confirmation.");
    }
};


// @route POST /api/issues/otp-send (STEP 1: Sends OTP for anonymous/new reports)
router.post('/otp-send', async (req, res) => {
    const { reporterName, reporterEmail, reporterMobile, issueType, description, lat, lng } = req.body;
    
    // Simple Server-Side Validation
    if (!reporterEmail || !description) {
        return res.status(400).json({ message: 'Missing required contact or issue details.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const tempId = Date.now().toString(36); // Unique ID for storage

    try {
        await sendOTPEmail(reporterEmail, otp);

        // Store data temporarily for 10 minutes
        otpStore.set(tempId, { 
            otp, 
            reporterEmail,
            reporterData: { reporterName, reporterMobile, issueType, description, lat, lng }
        });
        
        // Auto-delete after 10 minutes (600,000 ms)
        setTimeout(() => otpStore.delete(tempId), 600000); 

        res.status(200).json({ 
            message: 'Verification code sent to email.',
            tempId 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
});


// @route POST /api/issues/anonymous (STEP 2: Verify OTP and Final Submission with Image)
// Note: This creates a Citizen User account if one doesn't exist.
router.post('/anonymous', upload.single('issueImage'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Issue image is required.' });

        const { enteredOtp, tempId } = req.body;
        const storedData = otpStore.get(tempId);
        
        // 1. OTP and State Verification
        if (!storedData) {
            fs.unlinkSync(req.file.path); 
            return res.status(400).json({ message: 'Verification session expired or invalid.' });
        }

        if (enteredOtp !== storedData.otp) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ message: 'Invalid verification code.' });
        }

        // OTP verified - clean up store immediately
        otpStore.delete(tempId); 
        
        const { reporterEmail, reporterData } = storedData;
        
        // 2. Find or Create Citizen User
        let citizen = await User.findOne({ email: reporterEmail, role: 'citizen' });
        if (!citizen) {
            // Create a temporary citizen account for the anonymous report
            const randomPassword = await bcrypt.hash(Math.random().toString(), 10);
            citizen = new User({
                name: reporterData.reporterName || 'Anonymous Citizen', 
                email: reporterEmail, 
                password: randomPassword,
                mobileNumber: reporterData.reporterMobile || 'N/A', 
                gender: 'other', 
                dateOfBirth: new Date(),
                role: 'citizen', 
                zone: 'Central'
            });
            await citizen.save();
        }

        // 3. Create the Issue
        const newIssue = new Issue({
            ticketId: generateTicketId(reporterData.issueType),
            reporter: citizen._id,
            issueType: reporterData.issueType,
            title: reporterData.description.substring(0, 50),
            description: reporterData.description,
            lat: reporterData.lat,
            lng: reporterData.lng,
            issueImageUrl: req.file.path, // Use the path from the newly uploaded image
            zone: 'Central' // Hardcoding zone as Central for simplicity
        });

        await newIssue.save();

        // 4. Send FINAL Report ID Email
        await sendReportIdEmail(reporterEmail, newIssue.ticketId);

        res.status(201).json({ 
            message: 'Report submitted successfully. Check your email for the ID.', 
            ticketId: newIssue.ticketId 
        });

    } catch (err) {
        console.error(err);
        if (req.file?.path) fs.unlinkSync(req.file.path);
        res.status(500).json({ message: err.message || 'Failed to finalize report submission.' });
    }
});


// @route GET /api/issues/track/:ticketId (Public Tracking)
router.get('/track/:ticketId', async (req, res) => {
    try {
        const issue = await Issue.findOne({ ticketId: req.params.ticketId });
        if (!issue) return res.status(404).json({ message: 'Ticket ID not found.' });

        res.json({ 
            ticketId: issue.ticketId, 
            status: issue.status, 
            description: issue.title,
            issueImageUrl: `http://localhost:5000/${issue.issueImageUrl}`,
            resolutionImageUrl: issue.resolutionImageUrl ? `http://localhost:5000/${issue.resolutionImageUrl}` : null
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching ticket status.' });
    }
});

// @route GET /api/issues/authority/dashboard (Authority/Admin View)
router.get('/authority/dashboard', protect, authorize('authority', 'admin'), async (req, res) => {
    try {
        // Admin gets ALL issues (filter is empty); Authority gets zone-specific
        const filter = {};
        if (req.user.role !== 'admin' && req.user.zone) {
            filter.zone = req.user.zone;
        }

        // NOTE: Issues with status 'Closed' are excluded in your original file, 
        // but for full admin oversight, we might usually remove this filter.
        // Sticking to the original filter for now:
        filter.status = { $ne: 'Closed' }; 
        
        const issues = await Issue.find(filter).sort({ createdAt: 1 });
        
        const formattedIssues = issues.map(issue => ({
            ticketId: issue.ticketId,
            issueType: issue.issueType,
            title: issue.title,
            description: issue.description,
            status: issue.status,
            lat: issue.lat,
            lng: issue.lng,
            createdAt: issue.createdAt,
            issueImageUrl: `http://localhost:5000/${issue.issueImageUrl}`,
            resolutionImageUrl: issue.resolutionImageUrl ? `http://localhost:5000/${issue.resolutionImageUrl}` : null,
            zone: issue.zone, // Include zone for table view
            // Assigning/Reporter fields are omitted as they require population logic
        }));

        res.json(formattedIssues);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load issues for your zone.' });
    }
});


// @route PUT /api/issues/:ticketId/status (Update status or reassign)
router.put('/:ticketId/status', protect, authorize('authority', 'admin'), async (req, res) => {
    const { ticketId } = req.params;
    const { status, zone } = req.body;
    const { role, zone: userZone } = req.user;
    
    let updateFields = {};
    let conditions = { ticketId }; 

    // Authority restriction: only update issues within their assigned zone
    if (role === 'authority' && userZone && userZone !== 'Global') {
        conditions.zone = userZone;
    }

    if (status) {
        updateFields.status = status;
    }
    // Admin can reassign by setting the 'zone' field
    if (zone && role === 'admin') {
        updateFields.zone = zone;
    }

    if (Object.keys(updateFields).length === 0) {
        return res.status(400).json({ message: 'No valid fields provided for update.' });
    }

    try {
        const updatedIssue = await Issue.findOneAndUpdate(
            conditions,
            updateFields,
            { new: true, runValidators: true }
        );

        if (!updatedIssue) {
            return res.status(404).json({ message: 'Issue not found or user not authorized for this zone.' });
        }

        res.json({ success: true, data: updatedIssue });

    } catch (error) {
        console.error("Status Update Error:", error);
        res.status(500).json({ message: 'Server error updating issue status.' });
    }
});


// @route PUT /api/issues/:ticketId/resolve (Authority uploads resolution image)
router.put('/:ticketId/resolve', protect, authorize('authority'), upload.single('resolutionImage'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Resolution image is required.' });

        const issue = await Issue.findOneAndUpdate(
            { ticketId: req.params.ticketId, zone: req.user.zone }, // Ensure zone match
            { 
                status: 'Awaiting Verification', 
                resolutionImageUrl: req.file.path 
            },
            { new: true }
        );

        if (!issue) return res.status(404).json({ message: 'Issue not found or not assigned to your zone.' });

        res.json({ 
            message: 'Resolution submitted. Awaiting verification.', 
            newStatus: issue.status 
        });
    } catch (err) {
        console.error("Resolution Submission Error:", err);
        res.status(500).json({ message: 'Failed to submit resolution proof.' });
    }
});


// @route PUT /api/issues/:ticketId/verify (Citizen verification - For the Track Report page)
router.put('/:ticketId/verify', async (req, res) => {
    const { email } = req.body;
    try {
        const reporter = await User.findOne({ email, role: 'citizen' });
        if (!reporter) return res.status(403).json({ message: 'Reporter email not found or unauthorized.' });

        const issue = await Issue.findOneAndUpdate(
            { ticketId: req.params.ticketId, reporter: reporter._id },
            { 
                status: 'Closed', 
            },
            { new: true }
        );

        if (!issue) return res.status(404).json({ message: 'Issue not found or email does not match the reporter.' });

        res.json({ message: 'Issue successfully verified and closed.', newStatus: issue.status });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to verify issue.' });
    }
});


module.exports = router;