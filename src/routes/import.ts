import express, { Request, Response } from 'express';
import multer from 'multer';
import csv from 'csv-parser';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
    }
  }
});

interface ImportResult {
  success: boolean;
  message: string;
  imported?: number;
  failed?: number;
  errors?: string[];
}

interface ProductData {
  name: string;
  description?: string;
  sku?: string;
  category?: string;
  price: number;
  moq?: number;
  unit?: string;
  supplier: string;
  certifications?: string;
  leadTime?: string;
}

// Import products
router.post('/products', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ 
      success: false, 
      message: 'No file uploaded' 
    } as ImportResult);
  }

  const results: ProductData[] = [];
  const errors: string[] = [];
  let rowNumber = 1;

  try {
    const stream = fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (data: any) => {
        rowNumber++;
        
        // Validate required fields
        if (!data.name || !data.price || !data.supplier) {
          errors.push(`Row ${rowNumber}: Missing required fields (name, price, or supplier)`);
          return;
        }

        // Parse and validate price
        const price = parseFloat(data.price);
        if (isNaN(price) || price <= 0) {
          errors.push(`Row ${rowNumber}: Invalid price value`);
          return;
        }

        // Create product object
        const product: ProductData = {
          name: data.name.trim(),
          description: data.description?.trim() || '',
          sku: data.sku?.trim() || '',
          category: data.category?.trim() || 'Uncategorized',
          price,
          moq: parseInt(data.moq) || 1,
          unit: data.unit?.trim() || 'unit',
          supplier: data.supplier.trim(),
          certifications: data.certifications?.trim() || '',
          leadTime: data.leadTime?.trim() || '1-2 weeks',
        };

        results.push(product);
      })
      .on('end', async () => {
        // Clean up uploaded file
        fs.unlinkSync(req.file!.path);

        // TODO: Save to database
        // const Product = require('../models/Product');
        // if (results.length > 0) {
        //   await Product.insertMany(results);
        // }

        const response: ImportResult = {
          success: true,
          message: `Import completed. ${results.length} products processed.`,
          imported: results.length,
          failed: errors.length,
          errors: errors.slice(0, 10), // Return first 10 errors
        };

        res.json(response);
      })
      .on('error', (error) => {
        fs.unlinkSync(req.file!.path);
        res.status(500).json({
          success: false,
          message: 'CSV parsing failed: ' + error.message,
        } as ImportResult);
      });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      success: false,
      message: 'Import failed: ' + (error as Error).message,
    } as ImportResult);
  }
});

// Import suppliers
router.post('/suppliers', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ 
      success: false, 
      message: 'No file uploaded' 
    } as ImportResult);
  }

  // TODO: Implement supplier import logic
  fs.unlinkSync(req.file.path);

  res.json({
    success: true,
    message: 'Suppliers import endpoint ready',
    imported: 0,
    failed: 0,
  } as ImportResult);
});

// Import categories
router.post('/categories', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ 
      success: false, 
      message: 'No file uploaded' 
    } as ImportResult);
  }

  // TODO: Implement category import logic
  fs.unlinkSync(req.file.path);

  res.json({
    success: true,
    message: 'Categories import endpoint ready',
    imported: 0,
    failed: 0,
  } as ImportResult);
});

// Import users
router.post('/users', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ 
      success: false, 
      message: 'No file uploaded' 
    } as ImportResult);
  }

  // TODO: Implement user import logic
  fs.unlinkSync(req.file.path);

  res.json({
    success: true,
    message: 'Users import endpoint ready',
    imported: 0,
    failed: 0,
  } as ImportResult);
});

// Import certifications
router.post('/certifications', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ 
      success: false, 
      message: 'No file uploaded' 
    } as ImportResult);
  }

  // TODO: Implement certification import logic
  fs.unlinkSync(req.file.path);

  res.json({
    success: true,
    message: 'Certifications import endpoint ready',
    imported: 0,
    failed: 0,
  } as ImportResult);
});

export default router;