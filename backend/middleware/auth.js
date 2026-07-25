// middleware/auth.js - Authentication middleware
// Imported from server.js verifyToken for consistent token validation
const jwt = require('jsonwebtoken');

/**
 * Verify JWT token from Authorization header
 * Expects: Authorization: Bearer <token>
 * Sets req.userId if token is valid
 */
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        // Use same JWT_SECRET as server.js for consistency — never fall back to a public default
        const JWT_SECRET = process.env.JWT_SECRET;
        if (!JWT_SECRET) throw new Error('JWT_SECRET not set');
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

module.exports = verifyToken;