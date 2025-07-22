import { Request, Response } from 'express';
import { parse } from 'csv-parse';
import { CSVProcessor } from '../services/csvProcessor';
import { UploadHistory } from '../models/UploadHistory';
import { logger } from '../config/logger';

class UploadController {
  private csvProcessor: CSVProcessor;

  constructor() {
    this.csvProcessor = new CSVProcessor();
  }

  uploadProductsCSV = async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const uploadHistory = await UploadHistory.create({
        userId: req.user?.id || req.userId,
        fileName: req.file.originalname,
        fileType: 'products',
        status: 'processing',
        totalRecords: 0,
        processedRecords: 0,
        failedRecords: 0
      });

      // Process CSV asynchronously
      this.processCSV(req.file.buffer, 'products', uploadHistory.id, req.user?.id || req.userId || '');

      res.status(202).json({
        message: 'CSV upload initiated',
        uploadId: uploadHistory.id,
        statusUrl: `/api/upload/csv/status/${uploadHistory.id}`
      });
    } catch (error) {
      logger.error('Error uploading products CSV:', error);
      res.status(500).json({ message: 'Failed to upload CSV' });
    }
  };

  uploadUsersCSV = async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const uploadHistory = await UploadHistory.create({
        userId: req.user?.id || req.userId,
        fileName: req.file.originalname,
        fileType: 'users',
        status: 'processing',
        totalRecords: 0,
        processedRecords: 0,
        failedRecords: 0
      });

      this.processCSV(req.file.buffer, 'users', uploadHistory.id, req.user?.id || req.userId || '');

      res.status(202).json({
        message: 'CSV upload initiated',
        uploadId: uploadHistory.id,
        statusUrl: `/api/upload/csv/status/${uploadHistory.id}`
      });
    } catch (error) {
      logger.error('Error uploading users CSV:', error);
      res.status(500).json({ message: 'Failed to upload CSV' });
    }
  };

  uploadCompaniesCSV = async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const uploadHistory = await UploadHistory.create({
        userId: req.user?.id || req.userId,
        fileName: req.file.originalname,
        fileType: 'companies',
        status: 'processing',
        totalRecords: 0,
        processedRecords: 0,
        failedRecords: 0
      });

      this.processCSV(req.file.buffer, 'companies', uploadHistory.id, req.user?.id || req.userId || '');

      res.status(202).json({
        message: 'CSV upload initiated',
        uploadId: uploadHistory.id,
        statusUrl: `/api/upload/csv/status/${uploadHistory.id}`
      });
    } catch (error) {
      logger.error('Error uploading companies CSV:', error);
      res.status(500).json({ message: 'Failed to upload CSV' });
    }
  };

  uploadOrdersCSV = async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const uploadHistory = await UploadHistory.create({
        userId: req.user?.id || req.userId,
        fileName: req.file.originalname,
        fileType: 'orders',
        status: 'processing',
        totalRecords: 0,
        processedRecords: 0,
        failedRecords: 0
      });

      this.processCSV(req.file.buffer, 'orders', uploadHistory.id, req.user?.id || req.userId || '');

      res.status(202).json({
        message: 'CSV upload initiated',
        uploadId: uploadHistory.id,
        statusUrl: `/api/upload/csv/status/${uploadHistory.id}`
      });
    } catch (error) {
      logger.error('Error uploading orders CSV:', error);
      res.status(500).json({ message: 'Failed to upload CSV' });
    }
  };

  getCSVTemplate = async (req: Request, res: Response) => {
    try {
      const { type } = req.params;
      const template = await this.csvProcessor.getTemplate(type);
      
      if (!template) {
        return res.status(404).json({ message: 'Template not found' });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-template.csv"`);
      res.send(template);
    } catch (error) {
      logger.error('Error getting CSV template:', error);
      res.status(500).json({ message: 'Failed to get template' });
    }
  };

  getUploadHistory = async (req: Request, res: Response) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      
      const history = await UploadHistory.find({
        userId: req.user?.id || req.userId
      })
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit));

      const total = await UploadHistory.countDocuments({ userId: req.user!.id });

      res.json({
        data: history,
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      });
    } catch (error) {
      logger.error('Error getting upload history:', error);
      res.status(500).json({ message: 'Failed to get upload history' });
    }
  };

  getUploadStatus = async (req: Request, res: Response) => {
    try {
      const { uploadId } = req.params;
      
      const upload = await UploadHistory.findById(uploadId);
      
      if (!upload) {
        return res.status(404).json({ message: 'Upload not found' });
      }

      res.json(upload);
    } catch (error) {
      logger.error('Error getting upload status:', error);
      res.status(500).json({ message: 'Failed to get upload status' });
    }
  };

  private async processCSV(buffer: Buffer, type: string, uploadId: string, userId: string) {
    try {
      const records: any[] = [];
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      parser.on('readable', function() {
        let record;
        while ((record = parser.read()) !== null) {
          records.push(record);
        }
      });

      parser.on('end', async () => {
        await UploadHistory.findByIdAndUpdate(uploadId, {
          totalRecords: records.length
        });

        const result = await this.csvProcessor.processRecords(type, records, userId, uploadId);

        await UploadHistory.findByIdAndUpdate(uploadId, {
          status: 'completed',
          processedRecords: result.processed,
          failedRecords: result.failed,
          errors: result.errors,
          completedAt: new Date()
        });
      });

      parser.on('error', async (error) => {
        logger.error('CSV parsing error:', error);
        await UploadHistory.findByIdAndUpdate(uploadId, {
          status: 'failed',
          errors: [error.message],
          completedAt: new Date()
        });
      });

      parser.write(buffer);
      parser.end();
    } catch (error) {
      logger.error('Error processing CSV:', error);
      await UploadHistory.findByIdAndUpdate(uploadId, {
        status: 'failed',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        completedAt: new Date()
      });
    }
  }
}

export const uploadController = new UploadController();