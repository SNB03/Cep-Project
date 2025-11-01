const mongoose = require('mongoose');

const AnonymousReportSchema = new mongoose.Schema({
    // Fields passed from the frontend (ReportIssueForm.jsx)
    reporterName: { type: String, required: true },
    reporterEmail: { type: String, required: true, unique: true },
    reporterMobile: { type: String, required: true },
    title: { type: String, required: true },
    zone: { type: String, required: true },
    issueType: { type: String, enum: ['pothole', 'waste'], required: true },
    description: { type: String, required: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    
    // Verification Fields
    otp: { type: String, required: true },
    otpExpires: { type: Date, required: true },

    createdAt: { type: Date, default: Date.now, expires: 600 } // Auto-delete unverified data after 10 min
});

module.exports = mongoose.model('AnonymousReport', AnonymousReportSchema, 'anonymousreports');
