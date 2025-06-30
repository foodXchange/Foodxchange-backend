// AI Services Configuration for FoodXchange
module.exports = {
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
        supplierMatching: require('./prompts/supplier-matching'),
        productAnalysis: require('./prompts/product-analysis'),
        documentProcessing: require('./prompts/document-processing'),
        customerSupport: require('./prompts/customer-support')
    },
    
    // AI Features Flags
    features: {
        enableSupplierMatching: true,
        enableProductAnalysis: true,
        enableDocumentAI: true,
        enableChatbot: true,
        enablePriceOptimization: true
    }
};
