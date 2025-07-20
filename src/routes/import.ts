const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');

const fs = require('fs');

const Product = require('../../models/Product');

// Configure file upload
const upload = multer({ dest: 'uploads/' });

// Simple import endpoint
router.post('/simple', upload.single('file'), async (req, res) => {
  try {
    console.log('Import request received');

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('File uploaded:', req.file.originalname);

    // Read the file based on type
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    const data = [];

    if (ext === 'csv') {
      // For CSV files
      const fileContent = fs.readFileSync(req.file.path, 'utf-8');
      const lines = fileContent.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());

      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const values = lines[i].split(',');
          const row = {};
          headers.forEach((header, index) => {
            row[header] = values[index]?.trim();
          });
          data.push(row);
        }
      }
    } else {
      // For Excel files
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(req.file.path);
      const worksheet = workbook.getWorksheet(1);
      const sheetName = worksheet.name;

      const headers = [];
      worksheet.getRow(1).eachCell((cell) => {
        headers.push(cell.value);
      });

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) { // Skip header row
          const rowData = {};
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1];
            if (header) {
              rowData[header] = cell.value;
            }
          });
          data.push(rowData);
        }
      });
    }

    console.log(`Found ${data.length} rows to import`);

    // Import to database
    let successCount = 0;
    for (const item of data) {
      try {
        // Create a new product with the data
        const product = new Product(item);
        await product.save();
        successCount++;
      } catch (err) {
        console.log('Error importing row:', err.message);
      }
    }

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: `Imported ${successCount} out of ${data.length} products`,
      count: successCount,
      total: data.length
    });

  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({
      error: 'Import failed',
      message: error.message
    });
  }
});

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'Import route is working!' });
});

module.exports = router;
