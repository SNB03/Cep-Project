const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET; 
const MOCK_TOKEN = 'mock-authority-token'; 
// NOTE: We don't need the User model here for this fix, but keeping the necessary module exports.

const protect = (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];

        // 🟢 SIMULATION BYPASS CHECK
        if (token === MOCK_TOKEN) {
            console.log("Middleware Bypass: Accepting mock-authority-token.");

            const isAdminRoute = req.originalUrl.includes('admin') || req.originalUrl.includes('dashboard');
            const assumedRole = isAdminRoute ? 'admin' : 'authority';
            
            // Setting the ID property to _id for consistency with Mongoose
            req.user = { 
                _id: 'mockUserId123', // 🚀 FIX: Use _id here
                role: assumedRole, 
                zone: assumedRole === 'admin' ? 'Global' : 'Central' 
            };
            return next();
        }

        // --- STANDARD JWT VERIFICATION ---
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            
            // The JWT payload is { user: { id, role, zone } }
            const userPayload = decoded.user;

            // 🚀 CRITICAL FIX: Attach user data, mapping 'id' from the JWT to '_id' for the app/Mongoose
            req.user = {
                _id: userPayload.id, 
                role: userPayload.role,
                zone: userPayload.zone,
            };
            
            next();
        } catch (error) {
            console.error("JWT Verification Failed:", error);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    } else {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

const authorize = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        console.log(`Authorization Failed: User role ${req.user?.role} not in required roles [${roles.join(', ')}]`);
        return res.status(403).json({ message: `User role ${req.user?.role} is not authorized to access this route` });
    }
    next();
};

module.exports = { protect, authorize, JWT_SECRET };