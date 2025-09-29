const express = require('express');
const jwt = require('jsonwebtoken');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'file-upload-secret-2024';
const DEFAULT_USERS = {
    user: {
        username: process.env.USER_USERNAME || 'testuser',
        password: process.env.USER_PASSWORD || 'userpass123',
        role: 'user'
    },
    admin: {
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD || 'adminpass123',
        role: 'admin'
    }
};

// POST /api/auth/login - Login endpoint
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                error: 'Missing credentials',
                message: 'Username and password are required'
            });
        }

        // Check against user credentials
        const user = Object.values(DEFAULT_USERS).find(u => 
            u.username === username && u.password === password
        );

        if (!user) {
            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'Username or password is incorrect'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user.username, 
                role: user.role 
            }, 
            JWT_SECRET,
            { expiresIn: '1000h' } 
        );

        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            user: {
                username: user.username,
                role: user.role
            },
            expiresIn: '1000h'
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'Login failed',
            message: 'Internal server error during login'
        });
    }
});

router.get('/credentials', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
            error: 'Not available in production',
            message: 'Credential information is not available in production mode'
        });
    }

    res.json({
        message: 'Available test credentials for login',
        credentials: {
            user: {
                username: DEFAULT_USERS.user.username,
                password: DEFAULT_USERS.user.password,
                role: 'user',
                note: 'Can access file operations and user endpoints'
            },
            admin: {
                username: DEFAULT_USERS.admin.username,
                password: DEFAULT_USERS.admin.password,
                role: 'admin',
                note: 'Can access all endpoints including admin functions'
            }
        },
        usage: {
            endpoint: 'POST /api/auth/login',
            example: {
                body: {
                    username: DEFAULT_USERS.user.username,
                    password: DEFAULT_USERS.user.password
                }
            }
        }
    });
});

router.post('/refresh', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            error: 'No token provided',
            message: 'Authorization header with Bearer token is required'
        });
    }

    try {
        // Verify the existing token (even if expired)
        const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
        
        // Generate new token with same payload
        const newToken = jwt.sign(
            { 
                userId: decoded.userId, 
                role: decoded.role 
            }, 
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: 'Token refreshed successfully',
            token: newToken,
            user: {
                username: decoded.userId,
                role: decoded.role
            },
            expiresIn: '24h'
        });

    } catch (error) {
        res.status(401).json({
            error: 'Invalid token',
            message: 'Token could not be refreshed'
        });
    }
});

// GET /api/auth/profile - Get user profile
router.get('/profile', requireAuth, (req, res) => {
    try {
        // Find user data from the default users
        const user = Object.values(DEFAULT_USERS).find(u => 
            u.username === req.user.userId
        );

        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                message: 'User profile could not be found'
            });
        }

        res.json({
            username: user.username,
            role: user.role,
            loginTime: new Date().toISOString()
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({
            error: 'Profile fetch failed',
            message: 'Internal server error while fetching profile'
        });
    }
});

module.exports = router;