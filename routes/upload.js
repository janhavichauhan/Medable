const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { requireAuth, optionalAuth, requireAdmin } = require('../middleware/auth');
const { upload, validateFile, generateSecureFilename, saveFile, scanForVirus } = require('../middleware/fileValidation');
const { logger } = require('../middleware/errorHandler');
const FileProcessingService = require('../services/fileProcessing');

const router = express.Router();

// Mock file storage (in production would use cloud storage)
let uploadedFiles = [
  {
    id: 'file-001',
    originalName: 'sample-document.pdf',
    filename: 'sample-document-123.pdf',
    mimetype: 'application/pdf',
    size: 2048576,
    uploadedBy: 'user1',
    uploadDate: new Date('2024-01-01').toISOString(),
    status: 'processed',
    processingResult: { pages: 15, textExtracted: true },
    downloadUrl: '/uploads/sample-document-123.pdf',
    publicAccess: false
  },
  {
    id: 'file-002',
    originalName: 'company-data.csv',
    filename: 'company-data-456.csv', 
    mimetype: 'text/csv',
    size: 1024000,
    uploadedBy: 'admin',
    uploadDate: new Date('2024-01-02').toISOString(),
    status: 'processing',
    processingResult: null,
    downloadUrl: '/uploads/company-data-456.csv',
    publicAccess: true 
  },
  {
    id: 'file-003',
    originalName: 'corrupted-image.jpg',
    filename: 'corrupted-image-789.jpg',
    mimetype: 'image/jpeg',
    size: 0, 
    uploadedBy: 'user2',
    uploadDate: new Date('2024-01-03').toISOString(),
    status: 'error',
    processingResult: { error: 'Corrupted file header' },
    downloadUrl: null,
    publicAccess: false
  }
];

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

router.get('/', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20)); // Max 50 per page
    const status = req.query.status;
    const publicOnly = req.query.public === 'true';

    let filteredFiles = [...uploadedFiles];

    // Proper access control
    if (publicOnly) {
      filteredFiles = filteredFiles.filter(f => f.publicAccess);
    } else if (req.user.role === 'admin') {
      // Admin can see all files
      // No filtering needed
    } else {
      // Regular users can only see their own files and public files
      filteredFiles = filteredFiles.filter(f => 
        f.uploadedBy === req.user.userId || f.publicAccess
      );
    }

    if (status) {
      filteredFiles = filteredFiles.filter(f => f.status === status);
    }

    // Proper pagination
    const startIndex = (page - 1) * limit;
    const paginatedFiles = filteredFiles.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < filteredFiles.length;

    res.set({
      'X-Total-Files': filteredFiles.length.toString(),
      'X-Processing-Queue': uploadedFiles.filter(f => f.status === 'processing').length.toString()
    });

    res.json({
      files: paginatedFiles.map(file => ({
        id: file.id,
        originalName: file.originalName,
        filename: file.filename,
        size: file.size,
        mimetype: file.mimetype,
        uploadDate: file.uploadDate,
        status: file.status,
        downloadUrl: file.downloadUrl,
        publicAccess: file.publicAccess,
        // Only show uploader info to admin or file owner
        uploadedBy: (req.user.role === 'admin' || file.uploadedBy === req.user.userId) 
          ? file.uploadedBy : undefined,
        // Only show processing results to admin or file owner for non-public files
        processingResult: (file.publicAccess || req.user.role === 'admin' || file.uploadedBy === req.user.userId)
          ? sanitizeProcessingResult(file.processingResult, req.user.role === 'admin')
          : undefined
      })),
      pagination: {
        page,
        limit,
        total: filteredFiles.length,
        hasMore
      }
    });
  } catch (error) {
    logger.error('Error listing files', { error: error.message, user: req.user.userId });
    res.status(500).json({ 
      error: 'Failed to retrieve files',
      message: 'An error occurred while retrieving your files'
    });
  }
});

// Get file info - requires authentication
router.get('/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const file = uploadedFiles.find(f => f.id === fileId);
    
    if (!file) {
      return res.status(404).json({ 
        error: 'File not found',
        message: 'The requested file does not exist'
      });
    }

    // Proper access control check
    if (!file.publicAccess && req.user.userId !== file.uploadedBy && req.user.role !== 'admin') {
      logger.warn('Unauthorized file access attempt', {
        fileId,
        userId: req.user.userId,
        fileOwner: file.uploadedBy
      });
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to access this file'
      });
    }

    res.json({
      id: file.id,
      originalName: file.originalName,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      uploadDate: file.uploadDate,
      status: file.status,
      downloadUrl: file.downloadUrl,
      publicAccess: file.publicAccess,
      // Only show uploader info to admin or file owner
      uploadedBy: (req.user.role === 'admin' || file.uploadedBy === req.user.userId) 
        ? file.uploadedBy : undefined,
      processingResult: sanitizeProcessingResult(file.processingResult, req.user.role === 'admin')
    });
  } catch (error) {
    logger.error('Error retrieving file info', { 
      error: error.message, 
      fileId: req.params.fileId, 
      user: req.user.userId 
    });
    res.status(500).json({ 
      error: 'Failed to retrieve file information',
      message: 'An error occurred while retrieving file details'
    });
  }
});

router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file provided',
        message: 'Please select a file to upload'
      });
    }

    // Validate file
    const validation = validateFile(req.file);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'File validation failed',
        message: 'The uploaded file failed validation checks',
        details: validation.errors
      });
    }

    // Virus scan
    const virusScan = await scanForVirus(req.file);
    if (!virusScan.clean) {
      logger.warn('Virus detected in upload', {
        userId: req.user.userId,
        filename: req.file.originalname,
        threat: virusScan.threat
      });
      return res.status(400).json({
        error: 'Security threat detected',
        message: 'The uploaded file failed security scanning'
      });
    }

    // Generate secure filename
    const secureFilename = generateSecureFilename(req.file.originalname);
    
    // Save file to disk
    const filePath = await saveFile(req.file, secureFilename);
    
    const newFile = {
      id: uuidv4(),
      originalName: req.file.originalname,
      filename: secureFilename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      buffer: req.file.buffer, // Keep for processing
      uploadedBy: req.user.userId,
      uploadDate: new Date().toISOString(),
      status: 'uploaded',
      processingResult: null,
      downloadUrl: `/uploads/${secureFilename}`,
      publicAccess: false,
      filePath: filePath,
      virusScan: {
        clean: virusScan.clean,
        scanDate: virusScan.scanDate,
        engine: virusScan.engine
      }
    };

    uploadedFiles.push(newFile);

    // Start background processing
    FileProcessingService.processFile(newFile)
      .then(result => {
        const fileIndex = uploadedFiles.findIndex(f => f.id === newFile.id);
        if (fileIndex !== -1) {
          uploadedFiles[fileIndex].status = 'processed';
          uploadedFiles[fileIndex].processingResult = result;
          uploadedFiles[fileIndex].processedDate = new Date().toISOString();
        }
      })
      .catch(error => {
        logger.error('File processing failed', {
          fileId: newFile.id,
          error: error.message
        });
        const fileIndex = uploadedFiles.findIndex(f => f.id === newFile.id);
        if (fileIndex !== -1) {
          uploadedFiles[fileIndex].status = 'error';
          uploadedFiles[fileIndex].processingResult = {
            error: 'Processing failed',
            message: 'File processing encountered an error'
          };
        }
      });

    logger.info('File uploaded successfully', {
      fileId: newFile.id,
      userId: req.user.userId,
      filename: req.file.originalname,
      size: req.file.size
    });
    res.set({
      'X-File-Id': newFile.id,
      'Location': `/api/upload/${newFile.id}`
    });

    res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        id: newFile.id,
        originalName: newFile.originalName,
        size: newFile.size,
        status: newFile.status,
        downloadUrl: newFile.downloadUrl,
        processingQueued: true
      }
    });
  } catch (error) {
    logger.error('File upload failed', { 
      error: error.message, 
      user: req.user?.userId || 'unknown'
    });
    
    res.status(500).json({ 
      error: 'File upload failed',
      message: 'An error occurred while uploading your file'
    });
  }
});

// Update file metadata - requires authentication and ownership
router.put('/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const updateData = req.body;
    
    if (!fileId || typeof fileId !== 'string') {
      return res.status(400).json({
        error: 'Invalid file ID',
        message: 'Please provide a valid file ID'
      });
    }
    
    const file = uploadedFiles.find(f => f.id === fileId);
    
    if (!file) {
      return res.status(404).json({ 
        error: 'File not found',
        message: 'The requested file does not exist'
      });
    }

    // Proper ownership check
    if (file.uploadedBy !== req.user.userId && req.user.role !== 'admin') {
      logger.warn('Unauthorized metadata update attempt', {
        fileId,
        userId: req.user.userId,
        fileOwner: file.uploadedBy
      });
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You can only update your own files'
      });
    }

    // Validate update data
    const allowedFields = ['publicAccess', 'originalName'];
    const invalidFields = Object.keys(updateData).filter(key => !allowedFields.includes(key));
    
    if (invalidFields.length > 0) {
      return res.status(400).json({
        error: 'Invalid fields',
        message: 'Only publicAccess and originalName can be updated',
        invalidFields
      });
    }
    
    // Validate field values
    if ('publicAccess' in updateData && typeof updateData.publicAccess !== 'boolean') {
      return res.status(400).json({
        error: 'Invalid value',
        message: 'publicAccess must be a boolean value'
      });
    }
    
    if ('originalName' in updateData) {
      if (typeof updateData.originalName !== 'string' || updateData.originalName.trim().length === 0) {
        return res.status(400).json({
          error: 'Invalid value',
          message: 'originalName must be a non-empty string'
        });
      }
      // Sanitize filename
      updateData.originalName = updateData.originalName.trim().substring(0, 255);
    }
    
    // Apply updates
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        file[key] = updateData[key];
      }
    });
    
    file.lastModified = new Date().toISOString();

    logger.info('File metadata updated', {
      fileId,
      userId: req.user.userId,
      updates: Object.keys(updateData)
    });

    res.json({
      message: 'File metadata updated successfully',
      file: {
        id: file.id,
        originalName: file.originalName,
        publicAccess: file.publicAccess,
        status: file.status,
        lastModified: file.lastModified
      }
    });
  } catch (error) {
    logger.error('File metadata update failed', { 
      error: error.message, 
      fileId: req.params.fileId, 
      user: req.user.userId 
    });
    res.status(500).json({ 
      error: 'Update failed',
      message: 'An error occurred while updating file metadata'
    });
  }
});

router.delete('/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const fileIndex = uploadedFiles.findIndex(f => f.id === fileId);
    
    if (fileIndex === -1) {
      return res.status(404).json({ 
        error: 'File not found',
        message: 'The requested file does not exist'
      });
    }

    const file = uploadedFiles[fileIndex];

    // Proper ownership check
    if (file.uploadedBy !== req.user.userId && req.user.role !== 'admin') {
      logger.warn('Unauthorized file deletion attempt', {
        fileId,
        userId: req.user.userId,
        fileOwner: file.uploadedBy
      });
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You can only delete your own files'
      });
    }

    // Delete physical file
    try {
      if (file.filePath) {
        const fs = require('fs').promises;
        await fs.unlink(file.filePath);
      }
      
      // Delete thumbnail if it exists
      if (file.processingResult?.thumbnailPath) {
        const fs = require('fs').promises;
        const thumbnailFullPath = path.join(__dirname, '..', 'public', file.processingResult.thumbnailPath);
        try {
          await fs.unlink(thumbnailFullPath);
        } catch (thumbError) {
          // Thumbnail deletion failed, but continue
          logger.warn('Failed to delete thumbnail', { fileId, error: thumbError.message });
        }
      }
    } catch (fsError) {
      logger.error('Failed to delete physical file', { fileId, error: fsError.message });
      // Continue with database deletion even if file deletion failed
    }

    // Remove from memory storage
    uploadedFiles.splice(fileIndex, 1);

    logger.info('File deleted successfully', {
      fileId,
      userId: req.user.userId,
      filename: file.originalName
    });

    res.json({ 
      message: 'File deleted successfully',
      deletedFile: {
        id: file.id,
        originalName: file.originalName
      }
    });
  } catch (error) {
    logger.error('File deletion failed', { 
      error: error.message, 
      fileId: req.params.fileId, 
      user: req.user.userId 
    });
    res.status(500).json({ 
      error: 'Deletion failed',
      message: 'An error occurred while deleting the file'
    });
  }
});

// Helper function to sanitize processing results
function sanitizeProcessingResult(result, isAdmin = false) {
  if (!result) return null;
  
  // Always remove sensitive information for non-admin users
  const sanitized = { ...result };
  
  if (!isAdmin) {
    // Remove potentially sensitive data
    delete sanitized.extractedText;
    delete sanitized.dataPreview;
    delete sanitized.sensitiveColumns;
    delete sanitized.internalNotes;
    delete sanitized.stack;
    delete sanitized.processingServer;
    
    // Sanitize CSV results
    if (sanitized.csvAnalysis) {
      delete sanitized.csvAnalysis.sampleData;
      delete sanitized.csvAnalysis.estimatedDataTypes;
    }
    
    // Sanitize Excel results
    if (sanitized.excelAnalysis && sanitized.excelAnalysis.sheets) {
      sanitized.excelAnalysis.sheets = sanitized.excelAnalysis.sheets.map(sheet => ({
        name: sheet.name,
        rowCount: sheet.rowCount,
        columnCount: sheet.columnCount,
        hasHeaders: sheet.hasHeaders
        // Remove sampleData
      }));
    }
  }
  
  return sanitized;
}

// Download file endpoint
router.get('/:fileId/download', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = uploadedFiles.find(f => f.id === fileId);
    
    if (!file) {
      return res.status(404).json({ 
        error: 'File not found',
        message: 'The requested file does not exist'
      });
    }

    // Access control check
    if (!file.publicAccess && req.user.userId !== file.uploadedBy && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You do not have permission to download this file'
      });
    }

    // Set download headers
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    res.setHeader('Content-Type', file.mimetype);
    
    // In a real app, you'd stream the file from storage
    // For now, redirect to the static file
    if (file.downloadUrl) {
      return res.redirect(file.downloadUrl);
    } else {
      return res.status(404).json({
        error: 'File not available',
        message: 'The physical file is not available for download'
      });
    }
  } catch (error) {
    logger.error('File download failed', { 
      error: error.message, 
      fileId: req.params.fileId, 
      user: req.user.userId 
    });
    res.status(500).json({ 
      error: 'Download failed',
      message: 'An error occurred while downloading the file'
    });
  }
});

// Process file endpoint
router.post('/:fileId/process', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = uploadedFiles.find(f => f.id === fileId);
    
    if (!file) {
      return res.status(404).json({ 
        error: 'File not found',
        message: 'The requested file does not exist'
      });
    }

    // Access control check
    if (req.user.userId !== file.uploadedBy && req.user.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You can only process your own files'
      });
    }

    if (file.status === 'processing') {
      return res.status(409).json({
        error: 'Already processing',
        message: 'This file is already being processed'
      });
    }

    // Update status to processing
    file.status = 'processing';
    file.processingResult = null;

    // Start processing (simulate async processing)
    setTimeout(() => {
      file.status = 'processed';
      file.processingResult = {
        processedAt: new Date().toISOString(),
        success: true,
        details: 'File processed successfully'
      };
    }, 2000);

    res.json({
      message: 'File processing started',
      fileId: file.id,
      status: 'processing'
    });
  } catch (error) {
    logger.error('File processing failed', { 
      error: error.message, 
      fileId: req.params.fileId, 
      user: req.user.userId 
    });
    res.status(500).json({ 
      error: 'Processing failed',
      message: 'An error occurred while processing the file'
    });
  }
});

// Get processing queue status - admin only
router.get('/system/queue-status', requireAuth, requireAdmin, (req, res) => {
  try {
    const queueStatus = FileProcessingService.getQueueStatus();
    
    res.json({
      queue: queueStatus,
      fileStats: {
        total: uploadedFiles.length,
        uploaded: uploadedFiles.filter(f => f.status === 'uploaded').length,
        processing: uploadedFiles.filter(f => f.status === 'processing').length,
        processed: uploadedFiles.filter(f => f.status === 'processed').length,
        error: uploadedFiles.filter(f => f.status === 'error').length
      }
    });
  } catch (error) {
    logger.error('Failed to get queue status', { error: error.message });
    res.status(500).json({
      error: 'Failed to get queue status',
      message: 'An error occurred while retrieving queue information'
    });
  }
});

// Test token generation endpoint (development only)
if (process.env.NODE_ENV === 'development') {
  const { createTestToken } = require('../middleware/auth');
  
  router.post('/auth/test-token', (req, res) => {
    const { userId = 'test-user', role = 'user' } = req.body;
    
    const token = createTestToken(userId, role);
    
    res.json({
      message: 'Test token created',
      token,
      user: { userId, role },
      usage: 'Add to Authorization header as: Bearer ' + token
    });
  });
}

module.exports = router;
