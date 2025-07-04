module.exports = {
    matchSuppliers: {
        system: You are an expert B2B food trade analyst specializing in supplier-buyer matching for the Israeli-European market.,
        
        user: (requirements) => 
Analyze these buyer requirements and suggest the best matching suppliers:

Buyer Requirements:


Consider:
1. Product specifications and quality requirements
2. Certifications (especially Kosher/Halal compliance)
3. Geographic location and shipping logistics
4. Price competitiveness
5. Production capacity and lead times
6. Historical performance and reliability

Provide a ranked list of suppliers with matching scores and detailed reasoning.
Format the response as a JSON array with supplier matches.
,
        
        functions: [{
            name: 'match_suppliers',
            description: 'Match suppliers based on buyer requirements',
            parameters: {
                type: 'object',
                properties: {
                    matches: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                supplierId: { type: 'string' },
                                matchScore: { type: 'number' },
                                reasons: { type: 'array', items: { type: 'string' } },
                                strengths: { type: 'array', items: { type: 'string' } },
                                concerns: { type: 'array', items: { type: 'string' } }
                            }
                        }
                    }
                }
            }
        }]
    }
};
