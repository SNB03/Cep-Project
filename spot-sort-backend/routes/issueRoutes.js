
// routes/issueRoutes.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Issue = require('../models/Issue');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const router = express.Router();

// 🚨 NODEMAILER and HASHING IMPORTS (Ensure these imports are available)
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
    // 🚨 REPLACE with your email service credentials
    service: 'gmail', 
    auth: {
    user: 'sujitbhojrao665@gmail.com', // Your Gmail address
        pass: 'rpkm lepv opoh cnel'    // Your Gmail App Password 
    }
});


// Helper functions
const generateTicketId = (type) => {
    const prefix = type === 'pothole' ? 'P' : 'W';
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


// @route POST /api/issues/otp-send (STEP 1: Sends OTP and stores reporter data temporarily)
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
router.post('/anonymous', upload.single('issueImage'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Issue image is required.' });

        const { enteredOtp, tempId } = req.body;
        const storedData = otpStore.get(tempId);
        
        // 1. OTP and State Verification
        if (!storedData) {
            fs.unlinkSync(req.file.path); // Delete uploaded image if session expired/invalid
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
            // NOTE: Using reporterData from the session store
            const randomPassword = await bcrypt.hash(Math.random().toString(), 10);
            citizen = new User({
                name: reporterData.reporterName, 
                email: reporterEmail, 
                password: randomPassword,
                mobileNumber: reporterData.reporterMobile, 
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
            zone: 'Central'
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

        // Ensure both original issue image and resolution image paths are returned
        res.json({ 
            ticketId: issue.ticketId, 
            status: issue.status, 
            description: issue.title,
            issueImageUrl: `http://localhost:5000/${issue.issueImageUrl}`, // Original image
            resolutionImageUrl: issue.resolutionImageUrl ? `http://localhost:5000/${issue.resolutionImageUrl}` : null // Resolution image
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching ticket status.' });
    }
});

// @route GET /api/issues/authority/dashboard (Authority/Admin View)
router.get('/authority/dashboard', protect, authorize('authority', 'admin'), async (req, res) => {
    try {
        const filter = { 
            status: { $ne: 'Closed' } 
        };
        if (req.user.role !== 'admin') {
            filter.zone = req.user.zone;
        }

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
            imageUrl: `http://localhost:5000/${issue.issueImageUrl}`,
            resolutionImageUrl: issue.resolutionImageUrl ? `http://localhost:5000/${issue.resolutionImageUrl}` : null,
            assignedTo: issue.assignedTo,
        }));

        res.json(formattedIssues);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to load issues for your zone.' });
    }
});


// @route PUT /api/issues/:ticketId/status (Update status - For quick 'Assign' button)
router.put('/:ticketId/status', protect, authorize('authority', 'admin'), async (req, res) => {
    const { status, assignedTo } = req.body;
    try {
        const updateData = { status };
        if (assignedTo) {
             updateData.assignedTo = assignedTo; 
        }

        const issue = await Issue.findOneAndUpdate(
            { ticketId: req.params.ticketId }, 
            updateData, 
            { new: true }
        );

        if (!issue) return res.status(404).json({ message: 'Issue not found.' });
        res.json({ message: 'Status updated successfully.', newStatus: issue.status });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to update status.' });
    }
});


// @route PUT /api/issues/:ticketId/resolve (Authority uploads resolution image)
router.put('/:ticketId/resolve', protect, authorize('authority'), upload.single('resolutionImage'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Resolution image is required.' });

        const issue = await Issue.findOneAndUpdate(
            { ticketId: req.params.ticketId },
            { 
                status: 'Awaiting Verification', 
                resolutionImageUrl: req.file.path 
            },
            { new: true }
        );

        if (!issue) return res.status(404).json({ message: 'Issue not found.' });

        res.json({ 
            message: 'Resolution submitted. Awaiting citizen verification.', 
            newStatus: issue.status 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to submit resolution proof.' });
    }
});


// @route PUT /api/issues/:ticketId/verify (Citizen verifies the resolution - Used in TrackReportForm)
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











