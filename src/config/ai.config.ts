// AI Services Configuration for FoodXchange
const aiConfig = {
  // Azure OpenAI Configuration
  azureOpenAI: {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_KEY,
    deploymentName: 'gpt-4',
    apiVersion: '2024-02-01'
  },

  // LangChain Configuration
  langchain: {
    temperature: 0.7,
    maxTokens: 2000,
    topP: 0.95,
    frequencyPenalty: 0,
    presencePenalty: 0
  },

  // Prompt Templates
  prompts: {
    // RFQ Analysis Template
    rfqAnalysis: `
      Analyze the following RFQ request and provide:
      1. Key requirements summary
      2. Technical specifications
      3. Quality standards
      4. Delivery requirements
      5. Budget considerations
      
      RFQ Details:
      {rfqDetails}
    `,

    // Supplier Matching Template
    supplierMatching: `
      Based on the following requirements, match and rank suppliers:
      
      Requirements:
      {requirements}
      
      Available Suppliers:
      {suppliers}
      
      Provide a ranked list with match scores and reasons.
    `,

    // Product Classification Template
    productClassification: `
      Classify the following food product:
      
      Product Information:
      {productInfo}
      
      Provide:
      1. Category and subcategory
      2. Dietary classifications
      3. Allergen information
      4. Certification requirements
    `,

    // Quality Assessment Template
    qualityAssessment: `
      Assess the quality standards for:
      
      Product: {productName}
      Supplier: {supplierInfo}
      Requirements: {qualityRequirements}
      
      Provide a detailed quality assessment report.
    `
  },

  // Feature Flags
  features: {
    rfqAnalysis: true,
    supplierMatching: true,
    productClassification: true,
    qualityAssessment: true,
    documentProcessing: true,
    marketInsights: false,
    pricePrediction: false
  },

  // Cache Configuration
  cache: {
    enabled: true,
    ttl: 3600, // 1 hour
    maxSize: 100 // MB
  },

  // Rate Limiting
  rateLimit: {
    maxRequests: 100,
    windowMs: 60000 // 1 minute
  }
};

export default aiConfig;