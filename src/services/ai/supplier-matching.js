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
