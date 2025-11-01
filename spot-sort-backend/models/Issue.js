const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema({
    ticketId: { type: String, required: true, unique: true },
    
    // 🛑 CRITICAL FIX: Make 'reporter' optional for anonymous submissions.
    // We assume if the field is present, it must be valid (not required: true).
    reporter: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: false // Setting to false globally allows omission
    },
    
    issueType: { type: String, enum: ['pothole', 'waste'], required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['Pending', 'In Progress', 'Awaiting Verification', 'Closed'], 
        default: 'Pending' 
    },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    issueImageUrl: { type: String, required: true }, // Path to the uploaded image
    resolutionImageUrl: { type: String }, // Path to resolution image (uploaded by authority)
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Assigned authority/team
    zone: { type: String, required: true }, // Inherited from area of report
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Issue', issueSchema, 'issues');