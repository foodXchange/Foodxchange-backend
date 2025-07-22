import { Router, Request, Response } from 'express';

const router = Router();

// Simple test endpoint
router.get('/test', (req: Request, res: Response) => {
  res.json({ message: 'Upload route is working!' });
});

// Get CSV template
router.get('/csv/template/:type', (req: Request, res: Response) => {
  const { type } = req.params;
  
  const templates: Record<string, string> = {
    products: `SKU,Product Name,Description,Category,Subcategory,Tags,Supplier ID,Brand,Country of Origin,Base Price,Currency,Unit,Min Order Quantity,Current Stock,Weight Value,Weight Unit,Units Per Case,Cases Per Pallet,Is Organic,Is Kosher,Is Halal,Is Vegan,Allergens,Storage Temp Min,Storage Temp Max,Shelf Life Days
SKU001,Organic Tomatoes,Fresh organic tomatoes from local farms,Vegetables,Fresh Produce,"organic,fresh,tomatoes",507f1f77bcf86cd799439011,FarmFresh,USA,2.99,USD,kg,10,500,1,kg,24,48,Yes,No,Yes,Yes,,2,8,7`,
    users: `Email,First Name,Last Name,Phone,Role,Company ID,Company Verified,Email Verified,Language,Timezone,Account Status
john.doe@example.com,John,Doe,+1234567890,buyer,507f1f77bcf86cd799439012,Yes,Yes,en,America/New_York,active`,
    companies: `Company Name,Description,Type,Industry,Street Address,City,State,Country,Postal Code,Email,Phone,Website,Registration Number,Tax ID,Year Established,Employee Count,Annual Revenue,Subscription Tier,Subscription Status
ABC Trading Co,Leading food distributor,buyer,Food & Beverage,123 Main Street,New York,NY,USA,10001,info@abctrading.com,+1234567890,www.abctrading.com,REG123456,TAX789012,2010,50,5000000,premium,active`,
    orders: `Order Number,PO Number,RFQ ID,Buyer ID,Buyer Company ID,Supplier ID,Supplier Company ID,Order Date,Delivery Date,Status,Currency,Subtotal,Tax Amount,Shipping Cost,Total Amount,Payment Terms,Payment Status,Delivery Address,Delivery City,Delivery Country,Incoterm
ORD-2024-001,PO-2024-001,507f1f77bcf86cd799439013,507f1f77bcf86cd799439014,507f1f77bcf86cd799439015,507f1f77bcf86cd799439016,507f1f77bcf86cd799439017,2024-01-15,2024-01-25,pending,USD,1000,100,50,1150,Net 30,pending,456 Delivery Street,Chicago,USA,FOB`
  };

  const template = templates[type];
  
  if (!template) {
    return res.status(404).json({ message: 'Template not found' });
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-template.csv"`);
  res.send(template);
});

// Simple upload endpoint (for testing without auth)
router.post('/csv/:type', (req: Request, res: Response) => {
  const { type } = req.params;
  
  res.json({
    message: 'CSV upload endpoint ready',
    type,
    note: 'Full upload functionality requires authentication and file processing setup'
  });
});

export default router;