# CSV Bulk Upload Guide

## Overview
The FoodXchange backend now supports bulk data upload via CSV files. You can upload products, users, companies, and orders in bulk using properly formatted CSV files.

## Supported Data Types
- **Products** - Upload product catalog with pricing, inventory, and specifications
- **Users** - Import user accounts with roles and preferences  
- **Companies** - Add buyer/seller companies with business information
- **Orders** - Import historical orders and transactions

## API Endpoints

### Upload CSV Files
```
POST /api/upload/csv/{type}
```
Where `{type}` can be: `products`, `users`, `companies`, or `orders`

**Headers:**
- `Authorization: Bearer {token}`
- `Content-Type: multipart/form-data`

**Body:**
- `file`: CSV file to upload

**Response:**
```json
{
  "message": "CSV upload initiated",
  "uploadId": "65abc123...",
  "statusUrl": "/api/upload/csv/status/65abc123..."
}
```

### Download CSV Templates
```
GET /api/upload/csv/template/{type}
```
Downloads a CSV template with sample data for the specified type.

### Check Upload Status
```
GET /api/upload/csv/status/{uploadId}
```
Returns the current status of a CSV upload job.

### View Upload History
```
GET /api/upload/csv/history?page=1&limit=10
```
Lists all previous CSV uploads for the authenticated user.

## CSV Format Requirements

### Products CSV
Required columns:
- `SKU` - Unique product identifier
- `Product Name` - Name of the product
- `Category` - Main product category

Optional columns include pricing, inventory, certifications, allergens, and more. See `data/templates/products-template.csv` for full format.

### Users CSV
Required columns:
- `Email` - Unique email address
- `First Name` - User's first name
- `Last Name` - User's last name

Users will be created with temporary passwords and should reset on first login.

### Companies CSV
Required columns:
- `Company Name` - Unique company name
- `Email` - Primary contact email

### Orders CSV
Required columns:
- `Order Number` - Unique order identifier

Note: Order items must be added separately after order creation.

## Data Validation

The upload process includes:
- Required field validation
- Data type conversion (dates, numbers, booleans)
- Foreign key validation (supplier IDs, company IDs)
- Duplicate detection

Failed rows will be reported in the upload status with specific error messages.

## Best Practices

1. **Start with templates** - Download and modify the provided CSV templates
2. **Test with small batches** - Upload a few records first to verify format
3. **Check IDs** - Ensure referenced IDs (supplier, company) exist in the system
4. **Monitor progress** - Use the status endpoint to track upload completion
5. **Review errors** - Check failed records and fix issues before re-uploading

## Example Usage

### Using cURL
```bash
# Upload products CSV
curl -X POST http://localhost:5000/api/upload/csv/products \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@products.csv"

# Check upload status
curl http://localhost:5000/api/upload/csv/status/UPLOAD_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Using JavaScript
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('/api/upload/csv/products', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const result = await response.json();
console.log('Upload ID:', result.uploadId);
```

## Limitations

- Maximum file size: 10MB
- Maximum records per file: 10,000
- Supported formats: CSV only (UTF-8 encoding)
- Admin role required for users, companies, and orders upload
- Seller role can upload their own products

## Error Handling

Common errors:
- `Missing required fields` - Check that all required columns have values
- `Invalid ID reference` - Referenced entity doesn't exist
- `Duplicate entry` - Record with same unique identifier already exists
- `Invalid data format` - Check date formats (YYYY-MM-DD) and number formats

## Support

For issues or questions about CSV uploads:
1. Check the upload status endpoint for specific error messages
2. Verify your CSV matches the template format exactly
3. Ensure proper permissions for the upload type
4. Contact support with the upload ID for troubleshooting