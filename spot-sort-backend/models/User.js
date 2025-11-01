const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    mobileNumber: { type: String, required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    dateOfBirth: { type: Date, required: true },
    role: { 
        type: String, 
        enum: ['citizen', 'authority', 'admin'], 
        default: 'citizen' 
    },
    zone: { type: String, required: function() { return this.role === 'authority'; } }, 
    createdAt: { type: Date, default: Date.now },

    // 💡 NEW FIELDS FOR OTP VERIFICATION
    isVerified: { type: Boolean, default: false }, // Must be verified to log in
    otp: { type: String, select: false }, 
    otpExpires: { type: Date, select: false },
});

// Pre-save hook to hash password remains critical
userSchema.pre('save', async function (next) {
    // 🛑 CRITICAL: Only hash the password if the user is NOT already verified
    // This prevents hashing on every save (e.g., when updating OTP)
    if (!this.isModified('password') || this.isVerified) { 
        return next();
    }
    const salt = await bcrypt.genSalt(10); 
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema,'users');