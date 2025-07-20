const mongoose = require('mongoose');

// Database connection
module.exports = async function connectDB() {
    try {
        if (mongoose.connection.readyState === 1) {
            // If already connected, return the existing connection
            return mongoose.connection;
        }

        // Use the MONGODB_URI environment variable from Function App settings
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log(`MongoDB Connected: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error(`Error connecting to MongoDB: ${error.message}`);
        // Don't exit the process in Azure Functions
        throw error;
    }
};