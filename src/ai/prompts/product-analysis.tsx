export const productAnalysisPrompts = {
    analyzeProduct: {
        system: `You are a food industry expert specializing in product analysis, categorization, and compliance for international trade.`,
        
        user: (product: any) => `
Analyze this food product for the B2B marketplace:

Product Information:
${JSON.stringify(product, null, 2)}

Tasks:
1. Categorize the product accurately
2. Extract all nutritional information
3. Identify required certifications
4. Determine appropriate HS codes
5. Suggest SEO-optimized descriptions
6. Flag any compliance concerns
7. Recommend pricing strategy

Provide comprehensive analysis with actionable insights.`,
        
        outputFormat: {
            category: 'string',
            subcategory: 'string',
            nutritionalInfo: 'object',
            certifications: 'array',
            hsCode: 'string',
            description: 'object', // multilingual
            complianceFlags: 'array',
            pricingRecommendation: 'object'
        }
    }
};