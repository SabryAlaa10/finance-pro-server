import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Hardcoded users (same as Streamlit app)
const USERS = {
    saleh: {
        password: 'saleh109',
        userId: 1,
        name: 'Saleh'
    }
};

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = USERS[username.toLowerCase()];

    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
        { userId: user.userId, username: username.toLowerCase(), name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );

    res.json({
        success: true,
        token,
        user: {
            userId: user.userId,
            username: username.toLowerCase(),
            name: user.name
        }
    });
});

// GET /api/auth/me - Get current user info
router.get('/me', (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.json({ user: decoded });
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
});

export default router;
