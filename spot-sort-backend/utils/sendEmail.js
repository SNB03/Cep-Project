const nodemailer = require('nodemailer');

// 🛑 IMPORTANT: Configure your email service credentials
// You should use environment variables (.env file) for security
const transporter = nodemailer.createTransport({
    // Example using Gmail (You'll need to enable "Less secure app access" or use an App Password)
    service: 'gmail', 
    auth: {
        user: process.env.user, // Your Gmail address
    pass: process.env.pass    // Your Gmail App Password 
    },
    // Set up secure connection
    secure: true 
});

const sendEmail = async (options) => {
    try {
        const mailOptions = {
            from: `Spot & Sort Support <${process.env.EMAIL_USER || 'your_email@gmail.com'}>`,
            to: options.email,
            subject: options.subject,
            html: options.message,
        };

        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] Sent OTP to ${options.email}`);
    } catch (error) {
        console.error("[EMAIL ERROR] Could not send email:", error.message);
        // Throw an error to be handled by the controller
        throw new Error('Failed to send verification email.'); 
    }
};

module.exports = sendEmail;