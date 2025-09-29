require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import middleware
const { errorHandler, requestLogger, rateLimit } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const processingLogsRoutes = require('./routes/processing-logs');
const archiveRoutes = require('./routes/archive');

const app = express();
const PORT = process.env.PORT || 8888;

// Basic middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Rate limiting
app.use('/api/', rateLimit(15 * 60 * 1000, 100)); // 100 requests per 15 minutes
app.use('/api/upload', rateLimit(15 * 60 * 1000, 20)); // 20 uploads per 15 minutes

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Custom headers for puzzle hints
app.use((req, res, next) => {
  res.set({
    'X-Upload-Limit': '10MB',
    'X-Hidden-Metadata': 'check_file_processing_logs_endpoint',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/files', uploadRoutes); // Alias for frontend compatibility
app.use('/api/processing-logs', processingLogsRoutes);
app.use('/api/archive', archiveRoutes);

// Profile endpoint (redirect to auth profile)
const { requireAuth } = require('./middleware/auth');
app.get('/api/profile', requireAuth, (req, res) => {
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
});

// Puzzle endpoints
app.post('/api/puzzle/start', requireAuth, (req, res) => {
    // Set puzzle clue in header
    res.set({
        'X-Puzzle-Clue': Buffer.from('Look for hidden endpoints in processing logs').toString('base64'),
        'X-Next-Step': 'processing-logs'
    });
    
    res.json({
        message: 'Challenge started! Check your network tab for clues...',
        hint: 'Check the response headers for your first clue',
        steps: [
            '1. Find the X-Puzzle-Clue header',
            '2. Decode the Base64 message',
            '3. Access the hidden processing logs endpoint',
            '4. Use the encoded data to access the archive'
        ]
    });
});

// Admin endpoints
app.post('/api/admin/queue/clear', requireAuth, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Admin access required',
            message: 'This operation requires administrator privileges'
        });
    }
    
    res.json({
        message: 'Queue cleared successfully',
        clearedItems: 0
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the frontend application
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    message: 'The requested endpoint does not exist'
  });
});

// Global error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Assessment 4: File Processing API running on http://localhost:${PORT}`);
  console.log(`View instructions: http://localhost:${PORT}`);
  console.log(`File Hub Application: http://localhost:${PORT}/app`);
  console.log(`Enhanced user experience with streamlined design!`);
  
  const fs = require('fs');
  const dirs = ['uploads', 'uploads/thumbnails', 'logs'];
  dirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  });
});
