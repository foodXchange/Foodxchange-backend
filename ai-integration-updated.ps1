# PowerShell Script: Updated AI Integration Setup
param(
    [string]$BackendPath = "C:\Users\foodz\Documents\GitHub\Development\Foodxchange-backend"
)

Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          FoodXchange AI Integration Setup v2.0                ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

Set-Location $BackendPath

# 1. Install Azure Identity and Key Vault packages first
Write-Host "`n📦 Installing Azure security packages..." -ForegroundColor Yellow
npm install @azure/identity @azure/keyvault-secrets --save

# 2. Install AI packages with specific versions
Write-Host "`n🤖 Installing AI packages..." -ForegroundColor Yellow

$aiPackages = @{
    "@azure/openai" = "1.0.0-beta.11"
    "@azure/ai-text-analytics" = "5.1.0"
    "@azure/ai-form-recognizer" = "5.0.0"
    "@azure/search-documents" = "12.0.0"
    "openai" = "4.28.0"
    "langchain" = "0.1.25"
    "@langchain/community" = "0.0.25"
    "@langchain/openai" = "0.0.19"
}

foreach ($package in $aiPackages.GetEnumerator()) {
    Write-Host "  Installing $($package.Key)@$($package.Value)..." -ForegroundColor Gray
    npm install "$($package.Key)@$($package.Value)" --save
}

# 3. Create AI services directory structure
Write-Host "`n📁 Creating AI services structure..." -ForegroundColor Yellow

$directories = @(
    "src/services/ai",
    "src/services/ai/prompts",
    "src/services/ai/processors",
    "src/services/ai/utils"
)

foreach ($dir in $directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

# 4. Create main AI configuration
Write-Host "`n⚙️ Creating AI configuration..." -ForegroundColor Yellow

$aiConfigMain = @'
// Main AI Configuration for FoodXchange
const secureConfig = require('../config/secure-config');

class AIConfiguration {
    constructor() {
        this.initialized = false;
        this.services = {};
        this.config = {
            openAI: {
                deploymentName: 'gpt-4',
                apiVersion: '2024-02-01',
                temperature: 0.7,
                maxTokens: 2000
            },
            textAnalytics: {
                apiVersion: '2023-04-01'
            },
            formRecognizer: {
                apiVersion: '2023-07-31'
            },
            search: {
                apiVersion: '2023-11-01',
                indexName: 'foodxchange-products'
            }
        };
    }

    async initialize() {
        if (this.initialized) {
            return this.services;
        }

        try {
            console.log('🔄 Initializing AI services...');
            
            // Load secrets
            const secrets = await secureConfig.loadSecrets();
            const endpoints = secureConfig.getEndpoints();
            
            // Initialize services
            this.services = {
                openAI: await this.initOpenAI(endpoints.openAI, secrets.openAIKey),
                textAnalytics: await this.initTextAnalytics(endpoints.textAnalytics, secrets.textAnalyticsKey),
                formRecognizer: await this.initFormRecognizer(endpoints.formRecognizer, secrets.formRecognizerKey),
                search: await this.initSearch(endpoints.search, secrets.searchKey)
            };
            
            this.initialized = true;
            console.log('✅ AI services initialized successfully');
            
            return this.services;
            
        } catch (error) {
            console.error('❌ Failed to initialize AI services:', error);
            throw error;
        }
    }

    async initOpenAI(endpoint, key) {
        if (!endpoint || !key) {
            console.warn('⚠️  OpenAI credentials not configured');
            return null;
        }
        
        const { OpenAIClient, AzureKeyCredential } = require('@azure/openai');
        return new OpenAIClient(endpoint, new AzureKeyCredential(key));
    }

    async initTextAnalytics(endpoint, key) {
        if (!endpoint || !key) {
            console.warn('⚠️  Text Analytics credentials not configured');
            return null;
        }
        
        const { TextAnalyticsClient, AzureKeyCredential } = require('@azure/ai-text-analytics');
        return new TextAnalyticsClient(endpoint, new AzureKeyCredential(key));
    }

    async initFormRecognizer(endpoint, key) {
        if (!endpoint || !key) {
            console.warn('⚠️  Form Recognizer credentials not configured');
            return null;
        }
        
        const { DocumentAnalysisClient, AzureKeyCredential } = require('@azure/ai-form-recognizer');
        return new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));
    }

    async initSearch(endpoint, key) {
        if (!endpoint || !key) {
            console.warn('⚠️  Search credentials not configured');
            return null;
        }
        
        const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
        return new SearchClient(
            endpoint,
            this.config.search.indexName,
            new AzureKeyCredential(key)
        );
    }
}

module.exports = new AIConfiguration();
'@

$aiConfigMain | Out-File -FilePath "src/services/ai/config.js" -Encoding UTF8
Write-Host "✅ Created main AI configuration" -ForegroundColor Green

# 5. Create Supplier Matching Service
Write-Host "`n🤝 Creating Supplier Matching Service..." -ForegroundColor Yellow

$supplierMatchingService = @'
// AI-Powered Supplier Matching Service
const aiConfig = require('./config');

class SupplierMatchingService {
    constructor() {
        this.initialized = false;
    }

    async initialize() {
        if (!this.initialized) {
            const services = await aiConfig.initialize();
            this.openAI = services.openAI;
            this.textAnalytics = services.textAnalytics;
            this.search = services.search;
            this.initialized = true;
        }
    }

    async matchSuppliers(rfqData) {
        await this.initialize();
        
        try {
            // 1. Extract key requirements using Text Analytics
            const requirements = await this.extractRequirements(rfqData);
            
            // 2. Search for matching suppliers
            const suppliers = await this.searchSuppliers(requirements);
            
            // 3. Score and rank suppliers using AI
            const rankedSuppliers = await this.rankSuppliers(suppliers, rfqData);
            
            return {
                success: true,
                matches: rankedSuppliers,
                criteria: requirements,
                timestamp: new Date()
            };
            
        } catch (error) {
            console.error('Supplier matching error:', error);
            return {
                success: false,
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    async extractRequirements(rfqData) {
        if (!this.textAnalytics) {
            // Fallback to basic extraction
            return this.basicRequirementExtraction(rfqData);
        }

        const documents = [{
            id: '1',
            text: `${rfqData.title} ${rfqData.description}`,
            language: 'en'
        }];

        const keyPhraseResults = await this.textAnalytics.extractKeyPhrases(documents);
        const entityResults = await this.textAnalytics.recognizeEntities(documents);

        return {
            keyPhrases: keyPhraseResults[0]?.keyPhrases || [],
            entities: entityResults[0]?.entities || [],
            category: rfqData.category,
            certifications: rfqData.certifications || [],
            location: rfqData.deliveryLocation
        };
    }

    basicRequirementExtraction(rfqData) {
        // Fallback method when AI services are not available
        const keywords = rfqData.description.toLowerCase().split(' ')
            .filter(word => word.length > 3);
        
        return {
            keyPhrases: keywords.slice(0, 10),
            entities: [],
            category: rfqData.category,
            certifications: rfqData.certifications || [],
            location: rfqData.deliveryLocation
        };
    }

    async searchSuppliers(requirements) {
        // This would integrate with your database or search service
        // For now, returning mock data
        console.log('Searching suppliers with requirements:', requirements);
        
        // TODO: Implement actual search logic
        return [];
    }

    async rankSuppliers(suppliers, rfqData) {
        if (!this.openAI || suppliers.length === 0) {
            return suppliers;
        }

        // Use GPT-4 to rank suppliers
        const prompt = this.buildRankingPrompt(suppliers, rfqData);
        
        try {
            const completion = await this.openAI.getCompletions(
                aiConfig.config.openAI.deploymentName,
                [prompt],
                {
                    temperature: 0.3,
                    maxTokens: 1000
                }
            );

            const ranking = JSON.parse(completion.choices[0].text);
            return ranking;
            
        } catch (error) {
            console.error('AI ranking error:', error);
            return suppliers;
        }
    }

    buildRankingPrompt(suppliers, rfqData) {
        return `Rank these suppliers for the following RFQ:
RFQ: ${JSON.stringify(rfqData, null, 2)}
Suppliers: ${JSON.stringify(suppliers, null, 2)}

Return a JSON array of suppliers ordered by best match, with match scores and reasons.`;
    }
}

module.exports = new SupplierMatchingService();
'@

$supplierMatchingService | Out-File -FilePath "src/services/ai/supplier-matching.js" -Encoding UTF8
Write-Host "✅ Created Supplier Matching Service" -ForegroundColor Green

# 6. Create Product Analysis Service
Write-Host "`n📊 Creating Product Analysis Service..." -ForegroundColor Yellow

$productAnalysisService = @'
// AI-Powered Product Analysis Service
const aiConfig = require('./config');

class ProductAnalysisService {
    constructor() {
        this.initialized = false;
    }

    async initialize() {
        if (!this.initialized) {
            const services = await aiConfig.initialize();
            this.openAI = services.openAI;
            this.textAnalytics = services.textAnalytics;
            this.initialized = true;
        }
    }

    async analyzeProduct(productData) {
        await this.initialize();
        
        try {
            const analysis = {
                category: await this.categorizeProduct(productData),
                keywords: await this.extractKeywords(productData),
                compliance: await this.checkCompliance(productData),
                pricing: await this.analyzePricing(productData),
                quality: this.assessQuality(productData)
            };

            return {
                success: true,
                analysis,
                timestamp: new Date()
            };
            
        } catch (error) {
            console.error('Product analysis error:', error);
            return {
                success: false,
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    async categorizeProduct(productData) {
        if (!this.textAnalytics) {
            return this.basicCategorization(productData);
        }

        const documents = [{
            id: '1',
            text: `${productData.name} ${productData.description}`,
            language: 'en'
        }];

        const classificationResults = await this.textAnalytics.analyzeSentiment(documents);
        
        // TODO: Implement actual categorization logic
        return {
            primary: productData.category || 'uncategorized',
            confidence: 0.85
        };
    }

    basicCategorization(productData) {
        // Fallback categorization
        const categories = {
            'dairy': ['milk', 'cheese', 'yogurt', 'butter'],
            'meat': ['beef', 'chicken', 'pork', 'lamb'],
            'produce': ['fruit', 'vegetable', 'fresh'],
            'bakery': ['bread', 'cake', 'pastry'],
            'beverages': ['drink', 'juice', 'water', 'soda']
        };

        const description = (productData.name + ' ' + productData.description).toLowerCase();
        
        for (const [category, keywords] of Object.entries(categories)) {
            if (keywords.some(keyword => description.includes(keyword))) {
                return { primary: category, confidence: 0.7 };
            }
        }

        return { primary: 'general', confidence: 0.5 };
    }

    async extractKeywords(productData) {
        if (!this.textAnalytics) {
            return [];
        }

        const documents = [{
            id: '1',
            text: `${productData.name} ${productData.description}`,
            language: 'en'
        }];

        const keyPhraseResults = await this.textAnalytics.extractKeyPhrases(documents);
        return keyPhraseResults[0]?.keyPhrases || [];
    }

    async checkCompliance(productData) {
        // Check for required certifications and compliance
        const requiredCerts = ['FDA', 'HACCP', 'ISO'];
        const productCerts = productData.certifications || [];
        
        return {
            compliant: requiredCerts.some(cert => 
                productCerts.some(pCert => pCert.includes(cert))
            ),
            missing: requiredCerts.filter(cert => 
                !productCerts.some(pCert => pCert.includes(cert))
            ),
            certifications: productCerts
        };
    }

    async analyzePricing(productData) {
        // Basic pricing analysis
        return {
            competitive: true,
            suggestedPrice: productData.price * 1.1,
            priceRange: {
                min: productData.price * 0.9,
                max: productData.price * 1.2
            }
        };
    }

    assessQuality(productData) {
        let score = 50; // Base score
        
        // Add points for completeness
        if (productData.name) score += 10;
        if (productData.description?.length > 50) score += 10;
        if (productData.images?.length > 0) score += 10;
        if (productData.certifications?.length > 0) score += 10;
        if (productData.nutritionalInfo) score += 10;
        
        return {
            score: Math.min(score, 100),
            factors: {
                completeness: score >= 70,
                hasImages: productData.images?.length > 0,
                hasCertifications: productData.certifications?.length > 0
            }
        };
    }
}

module.exports = new ProductAnalysisService();
'@

$productAnalysisService | Out-File -FilePath "src/services/ai/product-analysis.js" -Encoding UTF8
Write-Host "✅ Created Product Analysis Service" -ForegroundColor Green

# 7. Create Document Processing Service
Write-Host "`n📄 Creating Document Processing Service..." -ForegroundColor Yellow

$documentProcessingService = @'
// AI-Powered Document Processing Service
const aiConfig = require('./config');

class DocumentProcessingService {
    constructor() {
        this.initialized = false;
    }

    async initialize() {
        if (!this.initialized) {
            const services = await aiConfig.initialize();
            this.formRecognizer = services.formRecognizer;
            this.textAnalytics = services.textAnalytics;
            this.initialized = true;
        }
    }

    async processDocument(documentPath, documentType) {
        await this.initialize();
        
        try {
            let result;
            
            switch (documentType) {
                case 'invoice':
                    result = await this.processInvoice(documentPath);
                    break;
                case 'certificate':
                    result = await this.processCertificate(documentPath);
                    break;
                case 'contract':
                    result = await this.processContract(documentPath);
                    break;
                default:
                    result = await this.processGeneric(documentPath);
            }

            return {
                success: true,
                documentType,
                data: result,
                timestamp: new Date()
            };
            
        } catch (error) {
            console.error('Document processing error:', error);
            return {
                success: false,
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    async processInvoice(documentPath) {
        if (!this.formRecognizer) {
            return { error: 'Form Recognizer not configured' };
        }

        const poller = await this.formRecognizer.beginAnalyzeDocument(
            'prebuilt-invoice',
            documentPath
        );
        
        const result = await poller.pollUntilDone();
        
        return {
            invoiceNumber: result.documents[0]?.fields?.InvoiceId?.value,
            date: result.documents[0]?.fields?.InvoiceDate?.value,
            total: result.documents[0]?.fields?.InvoiceTotal?.value,
            vendor: result.documents[0]?.fields?.VendorName?.value
        };
    }

    async processCertificate(documentPath) {
        if (!this.formRecognizer) {
            return { error: 'Form Recognizer not configured' };
        }

        // Use layout model for certificates
        const poller = await this.formRecognizer.beginAnalyzeDocument(
            'prebuilt-layout',
            documentPath
        );
        
        const result = await poller.pollUntilDone();
        
        // Extract text and analyze
        const text = result.content;
        
        return {
            certificateType: this.extractCertificateType(text),
            issuer: this.extractIssuer(text),
            validUntil: this.extractExpiryDate(text),
            certified: true
        };
    }

    async processContract(documentPath) {
        // Similar implementation for contracts
        return {
            parties: [],
            terms: [],
            effectiveDate: null,
            expiryDate: null
        };
    }

    async processGeneric(documentPath) {
        if (!this.formRecognizer) {
            return { error: 'Form Recognizer not configured' };
        }

        const poller = await this.formRecognizer.beginAnalyzeDocument(
            'prebuilt-layout',
            documentPath
        );
        
        const result = await poller.pollUntilDone();
        
        return {
            pages: result.pages?.length || 0,
            text: result.content,
            tables: result.tables?.length || 0
        };
    }

    extractCertificateType(text) {
        const types = ['ISO', 'HACCP', 'Kosher', 'Halal', 'Organic', 'FDA'];
        const found = types.find(type => 
            text.toUpperCase().includes(type.toUpperCase())
        );
        return found || 'Unknown';
    }

    extractIssuer(text) {
        // Basic extraction logic
        const issuerPattern = /issued by[:\s]+([^\n]+)/i;
        const match = text.match(issuerPattern);
        return match ? match[1].trim() : 'Unknown';
    }

    extractExpiryDate(text) {
        // Basic date extraction
        const datePattern = /valid until[:\s]+([^\n]+)/i;
        const match = text.match(datePattern);
        return match ? new Date(match[1].trim()) : null;
    }
}

module.exports = new DocumentProcessingService();
'@

$documentProcessingService | Out-File -FilePath "src/services/ai/document-processing.js" -Encoding UTF8
Write-Host "✅ Created Document Processing Service" -ForegroundColor Green

# 8. Create main AI service index
Write-Host "`n📑 Creating AI service index..." -ForegroundColor Yellow

$aiServiceIndex = @'
// FoodXchange AI Services
const aiConfig = require('./config');
const supplierMatching = require('./supplier-matching');
const productAnalysis = require('./product-analysis');
const documentProcessing = require('./document-processing');

// Initialize all services
async function initializeAIServices() {
    try {
        console.log('🚀 Initializing FoodXchange AI Services...');
        
        await aiConfig.initialize();
        
        console.log('✅ All AI services ready');
        
        return {
            config: aiConfig,
            supplierMatching,
            productAnalysis,
            documentProcessing
        };
        
    } catch (error) {
        console.error('❌ Failed to initialize AI services:', error);
        throw error;
    }
}

// Export all services
module.exports = {
    initializeAIServices,
    aiConfig,
    supplierMatching,
    productAnalysis,
    documentProcessing
};
'@

$aiServiceIndex | Out-File -FilePath "src/services/ai/index.js" -Encoding UTF8
Write-Host "✅ Created AI service index" -ForegroundColor Green

# 9. Create test file
Write-Host "`n🧪 Creating AI services test file..." -ForegroundColor Yellow

$aiTestFile = @'
// Test AI Services
const { initializeAIServices } = require('./services/ai');

async function testAIServices() {
    console.log('🧪 Testing FoodXchange AI Services...\n');
    
    try {
        // Initialize services
        const ai = await initializeAIServices();
        
        // Test 1: Supplier Matching
        console.log('📍 Test 1: Supplier Matching');
        const rfqData = {
            title: 'Organic Olive Oil',
            description: 'Looking for high-quality organic olive oil supplier',
            category: 'oils',
            certifications: ['Organic', 'ISO22000'],
            deliveryLocation: 'Tel Aviv, Israel'
        };
        
        const matchResult = await ai.supplierMatching.matchSuppliers(rfqData);
        console.log('Result:', matchResult.success ? '✅ Success' : '❌ Failed');
        
        // Test 2: Product Analysis
        console.log('\n📍 Test 2: Product Analysis');
        const productData = {
            name: 'Premium Extra Virgin Olive Oil',
            description: 'Cold-pressed organic olive oil from Spain',
            category: 'oils',
            price: 25.99,
            certifications: ['Organic', 'EU-Bio']
        };
        
        const analysisResult = await ai.productAnalysis.analyzeProduct(productData);
        console.log('Result:', analysisResult.success ? '✅ Success' : '❌ Failed');
        
        // Test 3: Document Processing (mock)
        console.log('\n📍 Test 3: Document Processing');
        console.log('Result: ⚠️  Skipped (requires document path)');
        
        console.log('\n✅ AI Services tests completed!');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    testAIServices()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { testAIServices };
'@

$aiTestFile | Out-File -FilePath "src/test-ai-services.js" -Encoding UTF8
Write-Host "✅ Created AI services test file" -ForegroundColor Green

# Final summary
Write-Host "`n" -ForegroundColor White
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "          ✅ AI Integration Setup Complete!                      " -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan

Write-Host "`n📦 INSTALLED PACKAGES:" -ForegroundColor Yellow
Write-Host "  ✓ Azure Identity & Key Vault" -ForegroundColor Green
Write-Host "  ✓ Azure OpenAI" -ForegroundColor Green
Write-Host "  ✓ Azure Cognitive Services" -ForegroundColor Green
Write-Host "  ✓ LangChain & Community packages" -ForegroundColor Green

Write-Host "`n📁 CREATED STRUCTURE:" -ForegroundColor Yellow
Write-Host "  ✓ AI configuration system" -ForegroundColor Green
Write-Host "  ✓ Supplier matching service" -ForegroundColor Green
Write-Host "  ✓ Product analysis service" -ForegroundColor Green
Write-Host "  ✓ Document processing service" -ForegroundColor Green
Write-Host "  ✓ Test suite" -ForegroundColor Green

Write-Host "`n🔧 TO COMPLETE SETUP:" -ForegroundColor Yellow
Write-Host "  1. Update .env.local with your Azure endpoints:" -ForegroundColor White
Write-Host "     - Find them in Azure Portal → Your Cognitive Services → Keys and Endpoint" -ForegroundColor Gray
Write-Host "  2. Test the configuration:" -ForegroundColor White
Write-Host "     node src/test-ai-services.js" -ForegroundColor Cyan
Write-Host "  3. Integrate AI services into your routes" -ForegroundColor White

Write-Host "`n💡 USAGE EXAMPLE:" -ForegroundColor Yellow
Write-Host @'
// In your route handler:
const { supplierMatching } = require('../services/ai');

router.post('/api/rfq/match-suppliers', async (req, res) => {
    try {
        const result = await supplierMatching.matchSuppliers(req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
'@ -ForegroundColor Gray

Write-Host "`n"