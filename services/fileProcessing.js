const sharp = require('sharp');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const { Readable } = require('stream');
const path = require('path');
const fs = require('fs').promises;
const { logger } = require('../middleware/errorHandler');

// Processing queue
const processingQueue = [];
const MAX_CONCURRENT_JOBS = 3;
let currentJobs = 0;

// File processing service
class FileProcessingService {
  static async processFile(fileData) {
    return new Promise((resolve, reject) => {
      processingQueue.push({ fileData, resolve, reject });
      FileProcessingService.processNext();
    });
  }

  static async processNext() {
    if (currentJobs >= MAX_CONCURRENT_JOBS || processingQueue.length === 0) {
      return;
    }

    const job = processingQueue.shift();
    currentJobs++;

    try {
      const result = await FileProcessingService.processFileInternal(job.fileData);
      job.resolve(result);
    } catch (error) {
      job.reject(error);
    } finally {
      currentJobs--;
      // Process next job
      setTimeout(() => FileProcessingService.processNext(), 100);
    }
  }

  static async processFileInternal(fileData) {
    const startTime = Date.now();
    
    try {
      logger.info('Starting file processing', {
        fileId: fileData.id,
        mimetype: fileData.mimetype,
        size: fileData.size
      });

      let processingResult = {
        startTime: new Date(startTime).toISOString(),
        status: 'processing'
      };

      // Process based on file type
      switch (fileData.mimetype) {
        case 'image/jpeg':
        case 'image/png':
        case 'image/gif':
          processingResult = await FileProcessingService.processImage(fileData);
          break;
        
        case 'text/csv':
          processingResult = await FileProcessingService.processCSV(fileData);
          break;
        
        case 'application/pdf':
          processingResult = await FileProcessingService.processPDF(fileData);
          break;
        
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        case 'application/vnd.ms-excel':
          processingResult = await FileProcessingService.processExcel(fileData);
          break;
        
        case 'text/plain':
          processingResult = await FileProcessingService.processText(fileData);
          break;
        
        default:
          processingResult = {
            status: 'completed',
            message: 'File uploaded successfully but no specific processing available',
            fileInfo: {
              size: fileData.size,
              mimetype: fileData.mimetype
            }
          };
      }

      processingResult.endTime = new Date().toISOString();
      processingResult.processingDuration = Date.now() - startTime;
      processingResult.status = 'completed';

      logger.info('File processing completed', {
        fileId: fileData.id,
        duration: processingResult.processingDuration,
        status: processingResult.status
      });

      return processingResult;

    } catch (error) {
      logger.error('File processing failed', {
        fileId: fileData.id,
        error: error.message,
        duration: Date.now() - startTime
      });

      return {
        status: 'error',
        error: 'Processing failed',
        message: 'The file could not be processed successfully',
        endTime: new Date().toISOString(),
        processingDuration: Date.now() - startTime
      };
    }
  }

  static async processImage(fileData) {
    try {
      const buffer = Buffer.from(fileData.buffer);
      const metadata = await sharp(buffer).metadata();
      
      // Create thumbnail
      const thumbnailBuffer = await sharp(buffer)
        .resize(200, 200, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      // Save thumbnail
      const thumbnailPath = path.join(
        __dirname, '..', 'uploads', 'thumbnails',
        `thumb_${fileData.filename.replace(path.extname(fileData.filename), '.jpg')}`
      );
      
      await fs.mkdir(path.dirname(thumbnailPath), { recursive: true });
      await fs.writeFile(thumbnailPath, thumbnailBuffer);

      return {
        imageInfo: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          channels: metadata.channels,
          hasAlpha: metadata.hasAlpha,
          colorSpace: metadata.space
        },
        thumbnailCreated: true,
        thumbnailPath: `/uploads/thumbnails/thumb_${fileData.filename.replace(path.extname(fileData.filename), '.jpg')}`,
        fileAnalysis: {
          aspectRatio: (metadata.width / metadata.height).toFixed(2),
          megapixels: ((metadata.width * metadata.height) / 1000000).toFixed(1),
          estimatedColors: metadata.channels === 1 ? 'Grayscale' : 'Color'
        }
      };
    } catch (error) {
      throw new Error(`Image processing failed: ${error.message}`);
    }
  }

  static async processCSV(fileData) {
    try {
      const buffer = Buffer.from(fileData.buffer);
      const csvText = buffer.toString('utf-8');
      
      return new Promise((resolve, reject) => {
        const rows = [];
        let headers = [];
        let rowCount = 0;
        
        const stream = Readable.from(csvText);
        
        stream
          .pipe(csv())
          .on('headers', (headerList) => {
            headers = headerList;
          })
          .on('data', (row) => {
            rowCount++;
            if (rowCount <= 5) { 
              rows.push(row);
            }
          })
          .on('end', () => {
            resolve({
              csvAnalysis: {
                totalRows: rowCount,
                columns: headers,
                columnCount: headers.length,
                sampleData: rows.slice(0, 3),
                estimatedDataTypes: FileProcessingService.analyzeCSVColumns(rows)
              },
              fileStats: {
                size: buffer.length,
                encoding: 'UTF-8',
                hasHeaders: headers.length > 0
              }
            });
          })
          .on('error', (error) => {
            reject(new Error(`CSV processing failed: ${error.message}`));
          });
      });
    } catch (error) {
      throw new Error(`CSV processing failed: ${error.message}`);
    }
  }

  static analyzeCSVColumns(sampleRows) {
    if (sampleRows.length === 0) return {};
    
    const columnTypes = {};
    const firstRow = sampleRows[0];
    
    Object.keys(firstRow).forEach(column => {
      const values = sampleRows.map(row => row[column]).filter(v => v && v.trim());
      
      if (values.length === 0) {
        columnTypes[column] = 'empty';
        return;
      }
      
      const hasNumbers = values.every(v => !isNaN(v) && !isNaN(parseFloat(v)));
      const hasEmails = values.some(v => /\S+@\S+\.\S+/.test(v));
      const hasDates = values.some(v => !isNaN(Date.parse(v)));
      
      if (hasNumbers) {
        columnTypes[column] = 'number';
      } else if (hasEmails) {
        columnTypes[column] = 'email';
      } else if (hasDates) {
        columnTypes[column] = 'date';
      } else {
        columnTypes[column] = 'text';
      }
    });
    
    return columnTypes;
  }

  static async processExcel(fileData) {
    try {
      const buffer = Buffer.from(fileData.buffer);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      
      const sheetNames = workbook.SheetNames;
      const sheetsInfo = [];
      
      sheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        sheetsInfo.push({
          name: sheetName,
          rowCount: jsonData.length,
          columnCount: jsonData.length > 0 ? Math.max(...jsonData.map(row => row.length)) : 0,
          hasHeaders: jsonData.length > 0 && jsonData[0].length > 0,
          sampleData: jsonData.slice(0, 3) // First 3 rows
        });
      });
      
      return {
        excelAnalysis: {
          totalSheets: sheetNames.length,
          sheets: sheetsInfo,
          workbookInfo: {
            creator: workbook.Props?.Author || 'Unknown',
            lastModifiedBy: workbook.Props?.LastAuthor || 'Unknown'
          }
        },
        fileStats: {
          size: buffer.length,
          format: fileData.mimetype.includes('openxml') ? 'XLSX' : 'XLS'
        }
      };
    } catch (error) {
      throw new Error(`Excel processing failed: ${error.message}`);
    }
  }

  static async processPDF(fileData) {
    try {
      const buffer = Buffer.from(fileData.buffer);
      
      // Simulate PDF analysis
      const estimatedPages = Math.max(1, Math.floor(buffer.length / 50000)); // Rough estimate
      const hasImages = buffer.includes(Buffer.from('/Image'));
      const hasText = buffer.includes(Buffer.from('/Text'));
      
      return {
        pdfAnalysis: {
          estimatedPages: estimatedPages,
          fileSize: buffer.length,
          hasImages: hasImages,
          hasText: hasText,
          securityFeatures: {
            encrypted: buffer.includes(Buffer.from('/Encrypt')),
            hasDigitalSignature: buffer.includes(Buffer.from('/Sig')),
            hasWatermark: false // Could be enhanced
          }
        },
        extractedMetadata: {
          version: FileProcessingService.extractPDFVersion(buffer),
          producer: 'Mock PDF Processor v1.0'
        }
      };
    } catch (error) {
      throw new Error(`PDF processing failed: ${error.message}`);
    }
  }

  static extractPDFVersion(buffer) {
    const pdfHeader = buffer.slice(0, 10).toString();
    const versionMatch = pdfHeader.match(/%PDF-(\d\.\d)/);
    return versionMatch ? versionMatch[1] : 'Unknown';
  }

  static async processText(fileData) {
    try {
      const buffer = Buffer.from(fileData.buffer);
      const text = buffer.toString('utf-8');
      
      const lines = text.split('\n');
      const words = text.split(/\s+/).filter(word => word.length > 0);
      const characters = text.length;
      
      return {
        textAnalysis: {
          lineCount: lines.length,
          wordCount: words.length,
          characterCount: characters,
          averageWordsPerLine: (words.length / lines.length).toFixed(1),
          encoding: 'UTF-8',
          preview: text.substring(0, 200) + (text.length > 200 ? '...' : '')
        },
        fileStats: {
          size: buffer.length,
          isEmpty: text.trim().length === 0
        }
      };
    } catch (error) {
      throw new Error(`Text processing failed: ${error.message}`);
    }
  }

  static getQueueStatus() {
    return {
      queueLength: processingQueue.length,
      activeJobs: currentJobs,
      maxConcurrentJobs: MAX_CONCURRENT_JOBS
    };
  }
}

module.exports = FileProcessingService;