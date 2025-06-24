// importSampleProducts.js - Import sample products
const mongoose = require('mongoose');
const Product = require('./src/models/Product');
const Company = require('./src/models/Company');

require('dotenv').config();

const sampleProducts = [
  {
    name: 'Organic Whole Milk',
    category: 'Dairy',
    subcategory: 'Milk',
    description: 'Premium organic whole milk from grass-fed cows',
    specifications: {
      brand: 'Green Valley Farms',
      origin: 'Israel',
      ingredients: ['Organic Whole Milk'],
      allergens: ['Milk'],
      shelfLife: '7 days',
      storageConditions: 'Keep refrigerated at 2-4°C'
    },
    packaging: [
      { type: 'Bottle', size: '1', unit: 'Liter', price: 3.99, moq: 12 },
      { type: 'Carton', size: '2', unit: 'Liter', price: 7.49, moq: 6 }
    ],
    certifications: {
      kosher: true,
      organic: true,
      halal: false
    },
    minimumOrderQuantity: 12,
    leadTime: { production: 2, shipping: 1 }
  },
  {
    name: 'Premium Orange Juice',
    category: 'Beverages',
    subcategory: 'Juices',
    description: '100% pure squeezed orange juice, no added sugar',
    specifications: {
      brand: 'Sunny Citrus',
      origin: 'Israel',
      ingredients: ['100% Orange Juice'],
      allergens: [],
      shelfLife: '14 days',
      storageConditions: 'Keep refrigerated'
    },
    packaging: [
      { type: 'Bottle', size: '1', unit: 'Liter', price: 4.99, moq: 12 },
      { type: 'Bottle', size: '330', unit: 'ml', price: 1.99, moq: 24 }
    ],
    certifications: {
      kosher: true,
      organic: false,
      halal: true
    },
    minimumOrderQuantity: 12,
    leadTime: { production: 3, shipping: 1 }
  },
  {
    name: 'Greek Style Yogurt',
    category: 'Dairy',
    subcategory: 'Yogurt',
    description: 'Thick and creamy Greek style yogurt with live cultures',
    specifications: {
      brand: 'Mediterranean Delight',
      origin: 'Israel',
      ingredients: ['Milk', 'Live Yogurt Cultures'],
      allergens: ['Milk'],
      shelfLife: '21 days',
      storageConditions: 'Keep refrigerated at 2-4°C'
    },
    packaging: [
      { type: 'Cup', size: '150', unit: 'g', price: 1.49, moq: 24 },
      { type: 'Cup', size: '500', unit: 'g', price: 3.99, moq: 12 }
    ],
    certifications: {
      kosher: true,
      organic: true,
      halal: false
    },
    minimumOrderQuantity: 24,
    leadTime: { production: 2, shipping: 1 }
  },
  {
    name: 'Extra Virgin Olive Oil',
    category: 'Oils & Condiments',
    subcategory: 'Oils',
    description: 'Cold-pressed extra virgin olive oil from selected olives',
    specifications: {
      brand: 'Golden Grove',
      origin: 'Israel',
      ingredients: ['100% Extra Virgin Olive Oil'],
      allergens: [],
      shelfLife: '24 months',
      storageConditions: 'Store in cool, dark place'
    },
    packaging: [
      { type: 'Bottle', size: '500', unit: 'ml', price: 8.99, moq: 12 },
      { type: 'Bottle', size: '1', unit: 'Liter', price: 15.99, moq: 6 }
    ],
    certifications: {
      kosher: true,
      organic: true,
      halal: true
    },
    minimumOrderQuantity: 6,
    leadTime: { production: 5, shipping: 2 }
  },
  {
    name: 'Whole Wheat Pita Bread',
    category: 'Bakery',
    subcategory: 'Bread',
    description: 'Traditional whole wheat pita bread, no preservatives',
    specifications: {
      brand: 'Holy Land Bakery',
      origin: 'Israel',
      ingredients: ['Whole Wheat Flour', 'Water', 'Yeast', 'Salt'],
      allergens: ['Gluten'],
      shelfLife: '5 days',
      storageConditions: 'Store in cool, dry place'
    },
    packaging: [
      { type: 'Pack', size: '6', unit: 'pieces', price: 2.99, moq: 20 },
      { type: 'Pack', size: '12', unit: 'pieces', price: 5.49, moq: 10 }
    ],
    certifications: {
      kosher: true,
      organic: false,
      halal: true
    },
    minimumOrderQuantity: 20,
    leadTime: { production: 1, shipping: 1 }
  }
];

const importProducts = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/foodxchange');
    console.log('Connected to MongoDB');

    // Get the supplier company
    const supplier = await Company.findOne({ type: 'supplier' });
    if (!supplier) {
      console.error('No supplier company found. Please run testUsersUpdated.js first.');
      process.exit(1);
    }

    console.log(`\nUsing supplier: ${supplier.name}`);
    console.log('Importing sample products...\n');

    // Import each product
    for (const productData of sampleProducts) {
      try {
        const product = await Product.create({
          ...productData,
          supplier: supplier._id,
          status: 'active'
        });
        console.log(`✅ Created: ${product.name}`);
      } catch (error) {
        if (error.code === 11000) {
          console.log(`⚠️  ${productData.name} already exists`);
        } else {
          console.error(`❌ Error creating ${productData.name}:`, error.message);
        }
      }
    }

    // Get total count
    const totalProducts = await Product.countDocuments();
    console.log(`\n✅ Import complete! Total products in database: ${totalProducts}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error importing products:', error);
    process.exit(1);
  }
};

importProducts();
