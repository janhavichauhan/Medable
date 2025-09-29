// ARCHIVE DOWNLOAD ENDPOINT - Final puzzle location
// Hint from processing logs: "archive download endpoint with key: ARCHIVE_MASTER_2024"

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Mock archive data
const archiveContents = [
  {
    filename: 'system-backup.zip',
    size: 104857600, // 100MB
    created: new Date('2024-01-01').toISOString(),
    contains: ['user-data.csv', 'config.json', 'logs.txt'],
    downloadKey: 'backup-2024-q1'
  },
  {
    filename: 'processed-files.tar.gz',
    size: 52428800, // 50MB
    created: new Date('2024-01-15').toISOString(),
    contains: ['images/', 'documents/', 'spreadsheets/'],
    downloadKey: 'processed-jan-2024'
  },
  {
    filename: 'audit-trail.zip',
    size: 10485760, // 10MB
    created: new Date().toISOString(),
    contains: ['access-logs.json', 'error-reports.csv', 'security-events.log'],
    downloadKey: 'audit-current',
    restricted: true
  }
];

// XOR encrypted final message
const FINAL_SECRET_MESSAGE = 'SECRET_ARCHIVE_ACCESS_UNLOCKED_CONGRATULATIONS_FILE_MASTER_ACHIEVEMENT_2024';
const ENCRYPTION_KEY = 'ARCHIVE_MASTER_2024';

function xorEncrypt(text, key) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return Buffer.from(result).toString('base64');
}

function xorDecrypt(encryptedBase64, key) {
  const encrypted = Buffer.from(encryptedBase64, 'base64').toString();
  let result = '';
  for (let i = 0; i < encrypted.length; i++) {
    result += String.fromCharCode(encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

const ENCRYPTED_FINAL_MESSAGE = xorEncrypt(FINAL_SECRET_MESSAGE, ENCRYPTION_KEY);
const JWT_SECRET = process.env.JWT_SECRET || 'file-upload-secret-2024';

// Get archives
router.get('/', async (req, res) => {
  try {
    // Multiple access methods for final puzzle
    const authHeader = req.get('authorization');
    const archiveKey = req.get('x-archive-key');
    const masterKey = req.query.master_key;
    const downloadKey = req.query.download_key;
    
    let hasAccess = false;
    let accessLevel = 'basic';
    let currentUser = null;

    // Method 1: Archive Master Key (ultimate access)
    if (archiveKey === ENCRYPTION_KEY || masterKey === ENCRYPTION_KEY) {
      hasAccess = true;
      accessLevel = 'master';
    }
    // Method 2: JWT Token (limited access)
    else if (authHeader) {
      try {
        const token = authHeader.split(' ')[1];
        currentUser = jwt.verify(token, JWT_SECRET);
        hasAccess = true;
        accessLevel = currentUser.role === 'admin' ? 'admin' : 'user';
      } catch (e) {
        // Continue to check download key
      }
    }
    // Method 3: Download Key (archive-specific access)
    else if (downloadKey) {
      const validArchive = archiveContents.find(a => a.downloadKey === downloadKey);
      if (validArchive && !validArchive.restricted) {
        hasAccess = true;
        accessLevel = 'archive';
      }
    }

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Access denied to archive system',
        hints: [
          'Try with valid JWT token',
          'Use specific download key for archives',
          'Master archive key in X-Archive-Key header',
          'The processing logs might have mentioned a key...'
        ]
      });
    }

    let availableArchives = [...archiveContents];
    let responseData = {
      accessLevel,
      archives: [],
      downloadLinks: {},
      systemStatus: {}
    };

    // Filter archives based on access level
    if (accessLevel === 'user') {
      availableArchives = availableArchives.filter(a => !a.restricted);
    } else if (accessLevel === 'archive') {
      const downloadKey = req.query.download_key;
      availableArchives = availableArchives.filter(a => a.downloadKey === downloadKey);
    }
    // admin and master see all archives

    // Prepare archive information
    responseData.archives = availableArchives.map(archive => {
      let archiveInfo = {
        filename: archive.filename,
        size: archive.size,
        created: archive.created,
        downloadKey: archive.downloadKey
      };

      // Add more details based on access level
      if (accessLevel === 'admin' || accessLevel === 'master') {
        archiveInfo.contains = archive.contains;
        archiveInfo.restricted = archive.restricted || false;
        archiveInfo.downloadUrl = `/api/download/${archive.downloadKey}`;
      }

      // Add sensitive information for master access
      if (accessLevel === 'master') {
        archiveInfo.internalPath = `/secure/archives/${archive.filename}`;
        archiveInfo.checksum = crypto.createHash('sha256')
          .update(archive.filename + archive.size)
          .digest('hex').substring(0, 16);
        archiveInfo.compressionRatio = '75%';
      }

      return archiveInfo;
    });

    // Add system status information
    if (accessLevel === 'admin' || accessLevel === 'master') {
      responseData.systemStatus = {
        totalArchives: archiveContents.length,
        totalSizeGB: Math.round(archiveContents.reduce((sum, a) => sum + a.size, 0) / (1024 * 1024 * 1024)),
        lastBackup: new Date(Date.now() - 86400000).toISOString(), // 24 hours ago
        compressionEnabled: true,
        encryptionStatus: 'active'
      };
    }

    // Add ultimate secret for master access
    if (accessLevel === 'master') {
      responseData.masterAccess = {
        congratulations: 'You have achieved MASTER level access to the archive system!',
        encryptedSecret: ENCRYPTED_FINAL_MESSAGE,
        decryptionKey: ENCRYPTION_KEY,
        decryptionHint: 'Use XOR decryption with the master key',
        achievementUnlocked: 'FILE_PROCESSING_MASTER_2024',
        finalMessage: 'You have successfully completed all file processing challenges!'
      };

      // Decrypt the message for them as a bonus
      responseData.decryptedSecret = xorDecrypt(ENCRYPTED_FINAL_MESSAGE, ENCRYPTION_KEY);
    }

    // Add download links for accessible archives
    availableArchives.forEach(archive => {
      responseData.downloadLinks[archive.downloadKey] = {
        url: `/api/download/${archive.downloadKey}`,
        expiresIn: '1 hour',
        method: 'GET'
      };
    });

    res.set({
      'X-Access-Level': accessLevel,
      'X-Available-Archives': responseData.archives.length.toString(),
      'X-Master-Access': accessLevel === 'master' ? 'UNLOCKED' : 'LOCKED',
      'X-Achievement': accessLevel === 'master' ? 'FILE_PROCESSING_MASTER_2024' : 'none',
      'Cache-Control': 'no-cache'
    });

    res.json(responseData);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Key endpoint for the puzzle chain
router.post('/key', async (req, res) => {
  try {
    const authHeader = req.get('authorization');
    const { solution } = req.body;
    
    let hasAccess = false;
    let currentUser = null;

    // Check JWT token
    if (authHeader) {
      try {
        const token = authHeader.split(' ')[1];
        currentUser = jwt.verify(token, JWT_SECRET);
        hasAccess = true;
      } catch (e) {
        // Invalid token
      }
    }

    if (!hasAccess) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Authentication required to access archive key'
      });
    }

    if (!solution) {
      return res.status(400).json({
        error: 'Missing solution',
        message: 'Please provide the encoded solution from processing logs'
      });
    }

    // Decode the Base64 solution
    let decodedSolution;
    try {
      decodedSolution = Buffer.from(solution, 'base64').toString('utf-8');
    } catch (e) {
      return res.status(400).json({
        error: 'Invalid solution format',
        message: 'Solution must be valid Base64'
      });
    }

    // Check if solution contains the master key
    if (decodedSolution.includes('ARCHIVE_MASTER_2024')) {
      res.json({
        success: true,
        message: 'Archive key unlocked!',
        key: ENCRYPTION_KEY,
        hint: 'Use this key with X-Archive-Key header to access master archives',
        achievement: 'PUZZLE_MASTER_2024',
        nextStep: 'Access /api/archive with X-Archive-Key header'
      });
    } else {
      res.status(400).json({
        error: 'Incorrect solution',
        message: 'The provided solution does not contain the required key'
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
