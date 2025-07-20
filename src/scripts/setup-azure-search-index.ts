import { SearchIndexClient, AzureKeyCredential } from '@azure/search-documents';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function setupProductsIndex() {
  console.log('🏗️  Setting up Azure Search Index...\n');

  const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
  const apiKey = process.env.AZURE_SEARCH_KEY;
  const indexName = process.env.AZURE_SEARCH_INDEX_NAME || 'products-index';

  if (!endpoint || !apiKey) {
    console.error('❌ Missing Azure Search configuration');
    return false;
  }

  try {
    const indexClient = new SearchIndexClient(
      endpoint,
      new AzureKeyCredential(apiKey)
    );

    console.log('📋 Checking if index exists...');

    try {
      const existingIndex = await indexClient.getIndex(indexName);
      console.log(`✅ Index '${indexName}' already exists!`);
      return true;
    } catch (error: any) {
      if (error.statusCode === 404) {
        console.log(`📝 Index '${indexName}' doesn't exist. Creating...`);
      } else {
        throw error;
      }
    }

    // Define the index schema for FoodXchange products
    const indexDefinition = {
      name: indexName,
      fields: [
        {
          name: 'id',
          type: 'Edm.String',
          key: true,
          searchable: false,
          filterable: true,
          retrievable: true
        },
        {
          name: 'name',
          type: 'Edm.String',
          searchable: true,
          filterable: false,
          retrievable: true,
          analyzerName: 'en.microsoft'
        },
        {
          name: 'description',
          type: 'Edm.String',
          searchable: true,
          filterable: false,
          retrievable: true,
          analyzerName: 'en.microsoft'
        },
        {
          name: 'category',
          type: 'Edm.String',
          searchable: true,
          filterable: true,
          facetable: true,
          retrievable: true
        },
        {
          name: 'subcategory',
          type: 'Edm.String',
          searchable: true,
          filterable: true,
          facetable: true,
          retrievable: true
        },
        {
          name: 'brand',
          type: 'Edm.String',
          searchable: true,
          filterable: true,
          facetable: true,
          retrievable: true
        },
        {
          name: 'sku',
          type: 'Edm.String',
          searchable: true,
          filterable: true,
          retrievable: true
        },
        {
          name: 'price',
          type: 'Edm.Double',
          searchable: false,
          filterable: true,
          sortable: true,
          facetable: true,
          retrievable: true
        },
        {
          name: 'currency',
          type: 'Edm.String',
          searchable: false,
          filterable: true,
          retrievable: true
        },
        {
          name: 'unit',
          type: 'Edm.String',
          searchable: false,
          filterable: true,
          facetable: true,
          retrievable: true
        },
        {
          name: 'origin',
          type: 'Edm.String',
          searchable: true,
          filterable: true,
          facetable: true,
          retrievable: true
        },
        {
          name: 'certifications',
          type: 'Collection(Edm.String)',
          searchable: true,
          filterable: true,
          facetable: true,
          retrievable: true
        },
        {
          name: 'tags',
          type: 'Collection(Edm.String)',
          searchable: true,
          filterable: true,
          retrievable: true
        },
        {
          name: 'supplierName',
          type: 'Edm.String',
          searchable: true,
          filterable: true,
          facetable: true,
          retrievable: true
        },
        {
          name: 'supplierId',
          type: 'Edm.String',
          searchable: false,
          filterable: true,
          retrievable: true
        },
        {
          name: 'availability',
          type: 'Edm.String',
          searchable: false,
          filterable: true,
          facetable: true,
          retrievable: true
        },
        {
          name: 'minimumOrderQuantity',
          type: 'Edm.Int32',
          searchable: false,
          filterable: true,
          sortable: true,
          retrievable: true
        },
        {
          name: 'shelfLife',
          type: 'Edm.Int32',
          searchable: false,
          filterable: true,
          sortable: true,
          retrievable: true
        },
        {
          name: 'temperatureStorage',
          type: 'Edm.String',
          searchable: false,
          filterable: true,
          facetable: true,
          retrievable: true
        },
        {
          name: 'images',
          type: 'Collection(Edm.String)',
          searchable: false,
          filterable: false,
          retrievable: true
        },
        {
          name: 'rating',
          type: 'Edm.Double',
          searchable: false,
          filterable: true,
          sortable: true,
          retrievable: true
        },
        {
          name: 'reviewCount',
          type: 'Edm.Int32',
          searchable: false,
          filterable: true,
          sortable: true,
          retrievable: true
        },
        {
          name: 'isOrganic',
          type: 'Edm.Boolean',
          searchable: false,
          filterable: true,
          facetable: true,
          retrievable: true
        },
        {
          name: 'isGlutenFree',
          type: 'Edm.Boolean',
          searchable: false,
          filterable: true,
          facetable: true,
          retrievable: true
        },
        {
          name: 'isVegan',
          type: 'Edm.Boolean',
          searchable: false,
          filterable: true,
          facetable: true,
          retrievable: true
        },
        {
          name: 'createdAt',
          type: 'Edm.DateTimeOffset',
          searchable: false,
          filterable: true,
          sortable: true,
          retrievable: true
        },
        {
          name: 'updatedAt',
          type: 'Edm.DateTimeOffset',
          searchable: false,
          filterable: true,
          sortable: true,
          retrievable: true
        }
      ],
      suggesters: [
        {
          name: 'product-suggester',
          searchMode: 'analyzingInfixMatching',
          sourceFields: ['name', 'description', 'category', 'brand', 'tags']
        }
      ],
      scoringProfiles: [
        {
          name: 'relevance-boost',
          text: {
            weights: {
              name: 5,
              brand: 3,
              category: 2,
              description: 1
            }
          }
        }
      ]
    };

    console.log('🔧 Creating index with FoodXchange product schema...');
    await indexClient.createIndex(indexDefinition);

    console.log(`✅ Index '${indexName}' created successfully!`);

    // Add some sample data
    console.log('📦 Adding sample product data...');
    await addSampleData(endpoint, apiKey, indexName);

    return true;

  } catch (error: any) {
    console.error('❌ Failed to setup index:', error.message);
    return false;
  }
}

async function addSampleData(endpoint: string, apiKey: string, indexName: string) {
  try {
    const { SearchClient } = await import('@azure/search-documents');
    const searchClient = new SearchClient(
      endpoint,
      indexName,
      new AzureKeyCredential(apiKey)
    );

    const sampleProducts = [
      {
        id: '1',
        name: 'Organic Roma Tomatoes',
        description: 'Fresh organic roma tomatoes perfect for cooking and salads',
        category: 'Vegetables',
        subcategory: 'Tomatoes',
        brand: 'FreshFarms',
        sku: 'TOM-ORG-001',
        price: 2.99,
        currency: 'USD',
        unit: 'lb',
        origin: 'California, USA',
        certifications: ['USDA Organic', 'Non-GMO'],
        tags: ['organic', 'fresh', 'local', 'vegetable'],
        supplierName: 'FreshFarms Co.',
        supplierId: 'supplier_001',
        availability: 'in_stock',
        minimumOrderQuantity: 10,
        shelfLife: 7,
        temperatureStorage: 'refrigerated',
        images: [],
        rating: 4.5,
        reviewCount: 127,
        isOrganic: true,
        isGlutenFree: true,
        isVegan: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: '2',
        name: 'Premium Olive Oil',
        description: 'Extra virgin olive oil from Mediterranean olives',
        category: 'Oils & Vinegars',
        subcategory: 'Olive Oil',
        brand: 'Mediterranean Gold',
        sku: 'OIL-EVL-002',
        price: 15.99,
        currency: 'USD',
        unit: 'bottle',
        origin: 'Spain',
        certifications: ['EU Organic', 'DOP'],
        tags: ['premium', 'mediterranean', 'cooking', 'healthy'],
        supplierName: 'Mediterranean Imports',
        supplierId: 'supplier_002',
        availability: 'in_stock',
        minimumOrderQuantity: 6,
        shelfLife: 720,
        temperatureStorage: 'ambient',
        images: [],
        rating: 4.8,
        reviewCount: 89,
        isOrganic: true,
        isGlutenFree: true,
        isVegan: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: '3',
        name: 'Artisan Sourdough Bread',
        description: 'Handcrafted sourdough bread made with traditional methods',
        category: 'Bakery',
        subcategory: 'Bread',
        brand: 'Artisan Bakehouse',
        sku: 'BRD-SRD-003',
        price: 5.50,
        currency: 'USD',
        unit: 'loaf',
        origin: 'Local Bakery',
        certifications: ['Artisan Craft'],
        tags: ['artisan', 'sourdough', 'fresh', 'bakery'],
        supplierName: 'Local Artisan Bakery',
        supplierId: 'supplier_003',
        availability: 'in_stock',
        minimumOrderQuantity: 5,
        shelfLife: 3,
        temperatureStorage: 'ambient',
        images: [],
        rating: 4.7,
        reviewCount: 203,
        isOrganic: false,
        isGlutenFree: false,
        isVegan: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    await searchClient.uploadDocuments(sampleProducts);
    console.log(`✅ Added ${sampleProducts.length} sample products to the index`);

  } catch (error: any) {
    console.error('⚠️  Warning: Could not add sample data:', error.message);
  }
}

// Run the setup
setupProductsIndex()
  .then(success => {
    if (success) {
      console.log('\n🎉 Azure Search setup completed successfully!');
      console.log('You can now test searches with:');
      console.log('  npx ts-node src/scripts/test-azure-search-simple.ts');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  });
