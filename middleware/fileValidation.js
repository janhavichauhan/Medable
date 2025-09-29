const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const mimeTypes = require('mime-types');

const ALLOWED_MIME_TYPES = {
  'image/jpeg': { extensions: ['.jpg', '.jpeg'], maxSize: 5 * 1024 * 1024 }, // 5MB
  'image/png': { extensions: ['.png'], maxSize: 5 * 1024 * 1024 }, // 5MB
  'image/gif': { extensions: ['.gif'], maxSize: 2 * 1024 * 1024 }, // 2MB
  'application/pdf': { extensions: ['.pdf'], maxSize: 10 * 1024 * 1024 }, // 10MB
  'text/csv': { extensions: ['.csv'], maxSize: 1 * 1024 * 1024 }, // 1MB
  'text/plain': { extensions: ['.txt'], maxSize: 512 * 1024 }, // 512KB
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { 
    extensions: ['.xlsx'], 
    maxSize: 5 * 1024 * 1024 
  }, // 5MB
  'application/vnd.ms-excel': { extensions: ['.xls'], maxSize: 5 * 1024 * 1024 } // 5MB
};

const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar',
  '.app', '.deb', '.pkg', '.rpm', '.dmg', '.iso', '.bin', '.run', '.sh'
];

// Create uploads directory if it doesn't exist
async function ensureUploadsDirectory() {
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  try {
    await fs.access(uploadsDir);
  } catch (error) {
    await fs.mkdir(uploadsDir, { recursive: true });
  }
  return uploadsDir;
}

// File validation function
function validateFile(file) {
  const errors = [];
  
  // Check if file exists and has content
  if (!file || !file.buffer || file.size === 0) {
    errors.push('File is empty or corrupted');
    return { isValid: false, errors };
  }
  
  // Check file size
  if (file.size > 20 * 1024 * 1024) { // 20MB absolute maximum
    errors.push('File size exceeds maximum limit of 20MB');
  }
  
  // Validate MIME type
  const mimeConfig = ALLOWED_MIME_TYPES[file.mimetype];
  if (!mimeConfig) {
    errors.push(`File type ${file.mimetype} is not allowed`);
  } else {
    // Validate file size against mime-specific limits
    if (file.size > mimeConfig.maxSize) {
      errors.push(`File size exceeds limit for ${file.mimetype} (max: ${mimeConfig.maxSize / (1024 * 1024)}MB)`);
    }
    
    // Validate file extension
    const fileExt = path.extname(file.originalname).toLowerCase();
    if (!mimeConfig.extensions.includes(fileExt)) {
      errors.push(`File extension ${fileExt} doesn't match MIME type ${file.mimetype}`);
    }
  }
  
  // Check for dangerous extensions
  const fileExt = path.extname(file.originalname).toLowerCase();
  if (DANGEROUS_EXTENSIONS.includes(fileExt)) {
    errors.push(`File extension ${fileExt} is not allowed for security reasons`);
  }
  
  // Basic file header validation (magic number check)
  if (file.buffer && file.buffer.length > 0) {
    const headerValidation = validateFileHeader(file.buffer, file.mimetype);
    if (!headerValidation.isValid) {
      errors.push(headerValidation.error);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// File header validation (magic number check)
function validateFileHeader(buffer, expectedMimeType) {
  const signatures = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
    'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]]
  };
  
  const expectedSignatures = signatures[expectedMimeType];
  if (!expectedSignatures) {
    return { isValid: true }; // No signature check for this type
  }
  
  for (const signature of expectedSignatures) {
    let matches = true;
    for (let i = 0; i < signature.length && i < buffer.length; i++) {
      if (buffer[i] !== signature[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return { isValid: true };
    }
  }
  
  return { 
    isValid: false, 
    error: `File header doesn't match expected format for ${expectedMimeType}` 
  };
}

// Generate secure filename
function generateSecureFilename(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, ext);
  
  // Create secure filename with UUID and sanitized original name
  const sanitizedBaseName = baseName
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .substring(0, 50); // Limit length
    
  return `${uuidv4()}_${sanitizedBaseName}${ext}`;
}

// Multer configuration
const storage = multer.memoryStorage(); // Store in memory for validation

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
    files: 1 // Only one file at a time
  },
  fileFilter: (req, file, cb) => {
    // Basic pre-validation
    if (!file.originalname || file.originalname.length === 0) {
      return cb(new Error('Invalid filename'));
    }
    
    const ext = path.extname(file.originalname).toLowerCase();
    if (DANGEROUS_EXTENSIONS.includes(ext)) {
      return cb(new Error(`File extension ${ext} is not allowed`));
    }
    
    cb(null, true);
  }
});

// Save file to disk after validation
async function saveFile(file, filename) {
  const uploadsDir = await ensureUploadsDirectory();
  const filePath = path.join(uploadsDir, filename);
  
  await fs.writeFile(filePath, file.buffer);
  return filePath;
}

// Mock virus scanning (in production, use actual antivirus API)
async function scanForVirus(file) {
  // Simulate virus scanning delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Check for suspicious patterns (mock implementation)
  const suspiciousPatterns = [
    Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'),
    Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR'),
    Buffer.from('virus'), // Simple pattern for demo
    Buffer.from('malware')
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (file.buffer.includes(pattern)) {
      return {
        clean: false,
        threat: 'Test virus pattern detected'
      };
    }
  }
  
  return {
    clean: true,
    scanDate: new Date().toISOString(),
    engine: 'MockAV v1.0'
  };
}

module.exports = {
  upload,
  validateFile,
  generateSecureFilename,
  saveFile,
  scanForVirus,
  ALLOWED_MIME_TYPES,
  ensureUploadsDirectory
};