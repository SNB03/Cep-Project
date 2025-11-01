// middleware/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = '727cf1c6a6e271cc3d56f85ec3946f4b93874ffe946658d0a4c60e643d00ebb4667131b98ef8c979e0fcf06428b65fb54784e5b204ad0134859a633c16826467'; // USE ENV VARIABLE IN PRODUCTION

const protect = (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, JWT_SECRET);

            // Attach user data to the request (excluding password)
            req.user = decoded.user;
            next();
        } catch (error) {
            console.error(error);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

const authorize = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
        return res.status(403).json({ message: `User role ${req.user.role} is not authorized to access this route` });
    }
    next();
};

module.exports = { protect, authorize, JWT_SECRET };