const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Issue = require('../models/Issue'); 
const protect = require('../middleware/auth').protect;
const authorize = require('../middleware/rbac').authorize;
const sendEmail = require('../utils/sendEmail'); 
const AnonymousReport = require('../models/AnonymousReport'); 

// --- Multer Configuration (omitted for brevity, assume correct) ---
const storage = multer.diskStorage({ destination: './uploads/', filename: function (req, file, cb) { cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname)); }, });
const upload = multer({ storage: storage, limits: { fileSize: 1000000 }, fileFilter: function (req, file, cb) { checkFileType(file, cb); }, }).single('issueImage'); 
function checkFileType(file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) { return cb(null, true); } else { cb(new Error('Error: Images Only!')); }
}
// --- End Multer Configuration ---

// ----------------------------------------------------------------------------------
// --- 1. AUTHENTICATED SUBMISSION (POST /api/issues) ---
// ----------------------------------------------------------------------------------
router.post('/', protect, authorize(['citizen', 'admin']), (req, res) => {
    upload(req, res, async (err) => {
        if (err) { return res.status(400).json({ message: err.message || err }); }
        if (!req.file) { return res.status(400).json({ message: 'No image file provided.' }); }

        const { issueType, description, lat, lng, title, zone } = req.body; 
        
        if (!title || !zone) {
            return res.status(400).json({ message: 'Title and Zone fields are required.' });
        }
        
        // 🚀 CRITICAL FIX CHECK: If req.user is undefined here, the protect middleware failed.
        if (!req.user || !req.user._id) {
            return res.status(401).json({ message: "Authorization failed. Please log in again." });
        }


        try {
            const ticketId = `TICKET-${Date.now()}-${Math.floor(Math.random() * 900) + 100}`;
            
            const newIssue = await Issue.create({
                ticketId, title, issueType, description, 
                issueImageUrl: `/uploads/${req.file.filename}`, 
                lat: parseFloat(lat), lng: parseFloat(lng), 
                reporter: req.user._id, // This now safely uses the fixed _id property
                zone, status: 'Pending', 
            });

            res.status(201).json({ message: 'Report submitted successfully.', ticketId: newIssue.ticketId, status: newIssue.status });
        } catch (error) {
            console.error("Authenticated Submission Error:", error.message); 
            res.status(500).json({ message: 'Server error during issue creation.', details: error.message });
        }
    });
});


// ----------------------------------------------------------------------------------
// --- 2. ANONYMOUS STEP 1: REQUEST OTP (POST /api/issues/otp-send) ---
// ----------------------------------------------------------------------------------
router.post('/otp-send', async (req, res) => {
    const { reporterEmail, reporterName, reporterMobile, title, zone, issueType, description, lat, lng } = req.body;
    // ... (rest of the OTP logic remains the same) ...
    if (!reporterEmail || !title || !lat || !lng) {
        return res.status(400).json({ message: 'Missing required fields for report.' });
    }

    try {
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); 

        const tempReport = await AnonymousReport.create({
            reporterEmail, reporterName, reporterMobile, title, zone,
            issueType, description, lat, lng,
            otp: otpCode,
            otpExpires,
        });

        const emailMessage = `<p>Your verification code for your issue report is: <strong>${otpCode}</strong>. It expires in 10 minutes.</p>`;
        await sendEmail({
            email: reporterEmail,
            subject: 'Issue Report Verification Code',
            message: emailMessage,
        });

        res.status(200).json({ message: 'Verification code sent.', tempId: tempReport._id });

    } catch (error) {
        console.error("OTP Send Error:", error.message);
        res.status(500).json({ message: 'Failed to send verification code. Try again.' });
    }
});


// ----------------------------------------------------------------------------------
// --- 3. ANONYMOUS STEP 2: VERIFY OTP AND SUBMIT FINAL REPORT (POST /api/issues/anonymous) ---
// ----------------------------------------------------------------------------------
router.post('/anonymous', (req, res) => {
    // ... (rest of the anonymous logic remains the same) ...
    upload(req, res, async (err) => {
        if (err) { return res.status(400).json({ message: err.message || 'File upload error.' }); }
        if (!req.file) { return res.status(400).json({ message: 'No image file provided.' }); }

        const { enteredOtp, tempId } = req.body;
        if (!enteredOtp || !tempId) { return res.status(400).json({ message: 'Verification details are missing.' }); }

        try {
            const tempReport = await AnonymousReport.findById(tempId);
            if (!tempReport) { return res.status(404).json({ message: 'Report session expired or invalid.' }); }
            if (tempReport.otpExpires < new Date() || tempReport.otp !== enteredOtp) {
                await tempReport.deleteOne(); return res.status(400).json({ message: 'Invalid or expired verification code.' });
            }

            // --- Verification Success: Create Final Issue ---
            const ticketId = `TICKET-${Date.now()}-${Math.floor(Math.random() * 900) + 100}`;
            
            const newIssue = await Issue.create({
                ticketId, title: tempReport.title, issueType: tempReport.issueType, description: tempReport.description,
                issueImageUrl: `/uploads/${req.file.filename}`, lat: tempReport.lat, lng: tempReport.lng,
                zone: tempReport.zone, status: 'Pending', 
            });

            await AnonymousReport.deleteOne({ _id: tempId });
            res.status(201).json({ message: 'Report submitted successfully.', ticketId: newIssue.ticketId, status: newIssue.status });

        } catch (error) {
            console.error("Anonymous Submission Error:", error.message);
            res.status(500).json({ message: 'Server error during final report submission.', details: error.message });
        }
    });
});


// ----------------------------------------------------------------------------------
// --- 4. DATA RETRIEVAL: GET MY REPORTS (NEW) ---
// ----------------------------------------------------------------------------------
router.get('/my-reports', protect, authorize(['citizen']), async (req, res) => {
    try {
        const issues = await Issue.find({ reporter: req.user._id }).sort({ reportedAt: -1 });
        const mappedIssues = issues.map(issue => ({
            ticketId: issue.ticketId, issueType: issue.issueType, status: issue.status,
            date: issue.createdAt.toISOString().split('T')[0], description: issue.description,
        }));
        res.json(mappedIssues);
    } catch (error) {
        console.error("Error fetching citizen reports:", error);
        res.status(500).json({ message: 'Failed to retrieve your reports.' });
    }
});

// ----------------------------------------------------------------------------------
// --- 5. OTHER DATA ROUTES (Existing) ---
// ----------------------------------------------------------------------------------
router.get('/track/:ticketId', async (req, res) => {
    const issue = await Issue.findOne({ ticketId: req.params.ticketId }).select('ticketId status description reportedAt');
    if (issue) { res.json(issue); } else { res.status(404).json({ message: 'Ticket ID not found.' }); }
});

router.get('/', protect, authorize('admin'), async (req, res) => {
    const issues = await Issue.find().populate('reporter', 'name email').populate('assignedTo', 'name email');
    res.json(issues);
});

router.put('/:id/status', protect, authorize(['authority', 'admin']), async (req, res) => {
    const { status, resolutionDetails } = req.body;
    const issue = await Issue.findById(req.params.id);
    if (issue) {
        issue.status = status || issue.status;
        issue.resolutionDetails = resolutionDetails || issue.resolutionDetails;
        if (status === 'Closed' && !issue.resolutionDate) { issue.resolutionDate = new Date(); }
        const updatedIssue = await issue.save();
        res.json(updatedIssue);
    } else { res.status(404).json({ message: 'Issue not found' }); }
});

module.exports = router;