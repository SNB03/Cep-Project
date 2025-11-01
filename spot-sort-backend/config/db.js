const mongoose = require('mongoose');

const connectDB = async () => {
    try {
          console.log(`Attempting to connect to URI: ${process.env.MONGO_URI.substring(0, 30)}...`); 
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host} 🚀`);
        console.log(`MongoDB Connected: ${conn.connection.host} 🚀`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1); // Exit process with failure
    }
};

module.exports = connectDB;