// middleware/rbac.js

/**
 * Middleware for Role-Based Access Control
 * @param {string[]} roles - Array of roles allowed to access the route (e.g., ['admin', 'authority'])
 */
const authorize = (roles = []) => {
    // roles param can be a single role string or an array of role strings
    if (typeof roles === 'string') {
        roles = [roles];
    }

    return (req, res, next) => {
        // req.user is populated by the 'protect' middleware
        if (!req.user || (roles.length && !roles.includes(req.user.role))) {
            // User's role is not authorized
            return res.status(403).json({ message: 'Access denied: Insufficient permissions.' });
        }

        // Authentication and authorization successful
        next();
    };
};

module.exports = authorize;