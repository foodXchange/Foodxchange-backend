// Secure Configuration Loader for FoodXchange
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

class SecureConfig {
    constructor() {
        this.isProduction = process.env.NODE_ENV === 'production';
        this.useKeyVault = process.env.USE_KEY_VAULT === 'true';
        this.secrets = null;
    }

    async loadSecrets() {
        if (this.secrets) {
            return this.secrets;
        }

        if (this.useKeyVault && this.isProduction) {
            // Production: Use Azure Key Vault
            console.log('Loading secrets from Azure Key Vault...');
            const credential = new DefaultAzureCredential();
            const vaultName = process.env.KEY_VAULT_NAME;
            const client = new SecretClient(
                `https://${vaultName}.vault.azure.net`,
                credential
            );

            this.secrets = {
                openAIKey: await this.getSecret(client, 'OpenAIKey'),
                textAnalyticsKey: await this.getSecret(client, 'TextAnalyticsKey'),
                formRecognizerKey: await this.getSecret(client, 'FormRecognizerKey'),
                searchKey: await this.getSecret(client, 'SearchKey')
            };
        } else {
            // Development: Use environment variables
            console.log('Loading secrets from environment variables...');
            this.secrets = {
                openAIKey: process.env.AZURE_OPENAI_KEY,
                textAnalyticsKey: process.env.AZURE_TEXT_ANALYTICS_KEY,
                formRecognizerKey: process.env.AZURE_FORM_RECOGNIZER_KEY,
                searchKey: process.env.AZURE_SEARCH_KEY
            };
        }

        return this.secrets;
    }

    async getSecret(client, secretName) {
        try {
            const secret = await client.getSecret(secretName);
            return secret.value;
        } catch (error) {
            console.error(`Failed to retrieve secret ${secretName}:`, error.message);
            throw error;
        }
    }

    // Helper method to get endpoints
    getEndpoints() {
        return {
            openAI: process.env.AZURE_OPENAI_ENDPOINT,
            textAnalytics: process.env.AZURE_TEXT_ANALYTICS_ENDPOINT,
            formRecognizer: process.env.AZURE_FORM_RECOGNIZER_ENDPOINT,
            search: process.env.AZURE_SEARCH_ENDPOINT
        };
    }
}

module.exports = new SecureConfig();
