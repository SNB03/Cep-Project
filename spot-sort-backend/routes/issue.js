// routes/issue.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Issue = require('../models/Issue');
const protect = require('../middleware/auth');
const authorize = require('../middleware/rbac');

// --- Multer Configuration for File Upload ---
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: function (req, file, cb) {
        // Custom filename: fieldname-timestamp.ext
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    },
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 1000000 }, // 1MB limit
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    },
}).single('issueImage'); // 'issueImage' is the field name expected from the frontend FormData

function checkFileType(file, cb) {
    // Allowed ext
    const filetypes = /jpeg|jpg|png|gif/;
    // Check ext
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    // Check mime type
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb('Error: Images Only!');
    }
}

// --- Controller Logic for Issues ---

// @route   POST /api/issues
// @desc    Report a new issue with image and location
// @access  Private (Citizen, Admin)
router.post('/', protect, authorize(['citizen', 'admin']), (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ message: err });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'No image file provided.' });
        }

        // Destructure data from req.body
        const { issueType, description, lat, lng } = req.body;

        try {
            // Generate unique ticket ID (Backend check for robustness)
            const ticketId = `TICKET-${Date.now()}-${Math.floor(Math.random() * 900) + 100}`;
            
            const newIssue = await Issue.create({
                ticketId,
                issueType,
                description,
                imageUrl: `/uploads/${req.file.filename}`, // Save file path/URL
                location: { lat: parseFloat(lat), lng: parseFloat(lng) },
                reporter: req.user._id,
                status: 'Received',
            });

            res.status(201).json({
                message: 'Report submitted successfully.',
                ticketId: newIssue.ticketId,
                status: newIssue.status,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Server error during issue creation.' });
        }
    });
});


// @route   GET /api/issues/track/:ticketId
// @desc    Get report status using only the public ticket ID
// @access  Public
router.get('/track/:ticketId', async (req, res) => {
    const issue = await Issue.findOne({ ticketId: req.params.ticketId }).select('ticketId status description reportedAt');

    if (issue) {
        res.json(issue);
    } else {
        res.status(404).json({ message: 'Ticket ID not found.' });
    }
});


// @route   GET /api/issues/
// @desc    Get all issues (Admin View)
// @access  Private (Admin)
router.get('/', protect, authorize('admin'), async (req, res) => {
    const issues = await Issue.find().populate('reporter', 'name email').populate('assignedTo', 'name email');
    res.json(issues);
});


// @route   PUT /api/issues/:id/status
// @desc    Update issue status (In Progress, Resolved)
// @access  Private (Authority, Admin)
router.put('/:id/status', protect, authorize(['authority', 'admin']), async (req, res) => {
    const { status, resolutionDetails } = req.body;

    const issue = await Issue.findById(req.params.id);

    if (issue) {
        issue.status = status || issue.status;
        issue.resolutionDetails = resolutionDetails || issue.resolutionDetails;
        
        const updatedIssue = await issue.save();
        res.json(updatedIssue);
    } else {
        res.status(404).json({ message: 'Issue not found' });
    }
});

module.exports = router;