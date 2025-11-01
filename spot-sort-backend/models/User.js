// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    mobileNumber: { type: String, required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    dateOfBirth: { type: Date, required: true },
    role: { 
        type: String, 
        enum: ['citizen', 'authority', 'admin'], 
        default: 'citizen' 
    },
    // Authority-specific field (e.g., zone assignment)
    zone: { type: String, required: function() { return this.role === 'authority'; } }, 
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);