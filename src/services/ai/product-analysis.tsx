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
