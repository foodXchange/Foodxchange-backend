import axios from 'axios';
import { config } from '../config';
import { productionLogger } from '../utils/productionLogger';
import { redisClient } from '../utils/redis';

export interface TranslationResult {
  text: string;
  to: string;
  from?: string;
  detectedLanguage?: {
    language: string;
    score: number;
  };
}

export interface LanguageDetectionResult {
  language: string;
  score: number;
  isTranslationSupported: boolean;
  isTransliterationSupported: boolean;
}

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
}

export class TranslatorService {
  private static instance: TranslatorService;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly region: string;
  private supportedLanguages: Map<string, SupportedLanguage> = new Map();
  private readonly cacheExpiry = 3600; // 1 hour

  private constructor() {
    this.endpoint = config.azure?.translatorEndpoint || 'https://api.cognitive.microsofttranslator.com';
    this.apiKey = config.azure?.translatorKey || 'dummy-key';
    this.region = config.azure?.translatorRegion || 'global';
    this.initializeLanguages();
  }

  static getInstance(): TranslatorService {
    if (!TranslatorService.instance) {
      TranslatorService.instance = new TranslatorService();
    }
    return TranslatorService.instance;
  }

  private async initializeLanguages(): Promise<void> {
    // Initialize with common languages for food industry
    const languages: SupportedLanguage[] = [
      { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr' },
      { code: 'es', name: 'Spanish', nativeName: 'Español', direction: 'ltr' },
      { code: 'fr', name: 'French', nativeName: 'Français', direction: 'ltr' },
      { code: 'de', name: 'German', nativeName: 'Deutsch', direction: 'ltr' },
      { code: 'it', name: 'Italian', nativeName: 'Italiano', direction: 'ltr' },
      { code: 'pt', name: 'Portuguese', nativeName: 'Português', direction: 'ltr' },
      { code: 'zh-Hans', name: 'Chinese Simplified', nativeName: '中文(简体)', direction: 'ltr' },
      { code: 'zh-Hant', name: 'Chinese Traditional', nativeName: '中文(繁體)', direction: 'ltr' },
      { code: 'ja', name: 'Japanese', nativeName: '日本語', direction: 'ltr' },
      { code: 'ko', name: 'Korean', nativeName: '한국어', direction: 'ltr' },
      { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl' },
      { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', direction: 'ltr' },
      { code: 'ru', name: 'Russian', nativeName: 'Русский', direction: 'ltr' },
      { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', direction: 'ltr' },
      { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', direction: 'ltr' }
    ];

    languages.forEach(lang => this.supportedLanguages.set(lang.code, lang));
    productionLogger.info('Translator service initialized', {
      supportedLanguages: languages.length
    });
  }

  async translateText(
    text: string | string[],
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<TranslationResult[]> {
    try {
      // Check cache first
      const cacheKey = `translate:${sourceLanguage || 'auto'}:${targetLanguage}:${
        Array.isArray(text) ? text.join('|') : text
      }`;
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const response = await axios.post(
        `${this.endpoint}/translate`,
        Array.isArray(text) ? text.map(t => ({ text: t })) : [{ text }],
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.apiKey,
            'Ocp-Apim-Subscription-Region': this.region,
            'Content-Type': 'application/json'
          },
          params: {
            'api-version': '3.0',
            to: targetLanguage,
            ...(sourceLanguage && { from: sourceLanguage })
          }
        }
      );

      const results: TranslationResult[] = response.data.map((item: any) => ({
        text: item.translations[0].text,
        to: item.translations[0].to,
        from: item.detectedLanguage?.language,
        detectedLanguage: item.detectedLanguage
      }));

      // Cache the results
      await redisClient.setex(cacheKey, this.cacheExpiry, JSON.stringify(results));

      productionLogger.info('Text translated', {
        sourceLanguage: results[0].from || sourceLanguage,
        targetLanguage,
        textCount: results.length
      });

      return results;
    } catch (error) {
      productionLogger.error('Translation failed', { error, targetLanguage });
      throw error;
    }
  }

  async detectLanguage(text: string | string[]): Promise<LanguageDetectionResult[]> {
    try {
      const response = await axios.post(
        `${this.endpoint}/detect`,
        Array.isArray(text) ? text.map(t => ({ text: t })) : [{ text }],
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.apiKey,
            'Ocp-Apim-Subscription-Region': this.region,
            'Content-Type': 'application/json'
          },
          params: {
            'api-version': '3.0'
          }
        }
      );

      const results: LanguageDetectionResult[] = response.data.map((item: any) => ({
        language: item.language,
        score: item.score,
        isTranslationSupported: item.isTranslationSupported,
        isTransliterationSupported: item.isTransliterationSupported
      }));

      productionLogger.info('Language detected', {
        detectedLanguages: results.map(r => r.language),
        confidence: results.map(r => r.score)
      });

      return results;
    } catch (error) {
      productionLogger.error('Language detection failed', { error });
      throw error;
    }
  }

  async translateDocument(
    documentUrl: string,
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<string> {
    try {
      // In production, implement document translation
      // For now, return a placeholder
      productionLogger.info('Document translation requested', {
        documentUrl,
        targetLanguage,
        sourceLanguage
      });

      return `${documentUrl}?translated=${targetLanguage}`;
    } catch (error) {
      productionLogger.error('Document translation failed', { error });
      throw error;
    }
  }

  async batchTranslate(
    texts: { text: string; id: string }[],
    targetLanguages: string[],
    sourceLanguage?: string
  ): Promise<Map<string, Map<string, string>>> {
    try {
      const results = new Map<string, Map<string, string>>();

      // Initialize result structure
      texts.forEach(item => {
        results.set(item.id, new Map());
      });

      // Translate to each target language
      for (const targetLang of targetLanguages) {
        const translations = await this.translateText(
          texts.map(t => t.text),
          targetLang,
          sourceLanguage
        );

        translations.forEach((translation, index) => {
          const textId = texts[index].id;
          results.get(textId)?.set(targetLang, translation.text);
        });
      }

      productionLogger.info('Batch translation completed', {
        textCount: texts.length,
        languageCount: targetLanguages.length
      });

      return results;
    } catch (error) {
      productionLogger.error('Batch translation failed', { error });
      throw error;
    }
  }

  getSupportedLanguages(): SupportedLanguage[] {
    return Array.from(this.supportedLanguages.values());
  }

  isLanguageSupported(languageCode: string): boolean {
    return this.supportedLanguages.has(languageCode);
  }

  getLanguageInfo(languageCode: string): SupportedLanguage | undefined {
    return this.supportedLanguages.get(languageCode);
  }

  async translateForFoodIndustry(
    text: string,
    targetLanguage: string,
    context: 'menu' | 'ingredient' | 'recipe' | 'regulation' | 'general' = 'general'
  ): Promise<TranslationResult> {
    try {
      // Add context-specific glossary or terminology
      let enhancedText = text;
      const glossary = this.getFoodIndustryGlossary(context);

      // In production, use Azure Custom Translator with food industry training
      const results = await this.translateText(enhancedText, targetLanguage);
      
      // Apply post-processing for food-specific terms
      const processedResult = this.applyFoodTerminologyPostProcessing(
        results[0],
        context,
        targetLanguage
      );

      return processedResult;
    } catch (error) {
      productionLogger.error('Food industry translation failed', { error });
      throw error;
    }
  }

  private getFoodIndustryGlossary(context: string): Map<string, string> {
    const glossaries = {
      menu: new Map([
        ['appetizer', 'starter'],
        ['entree', 'main course'],
        ['dessert', 'sweet course']
      ]),
      ingredient: new Map([
        ['MSG', 'monosodium glutamate'],
        ['GMO', 'genetically modified organism'],
        ['organic', 'certified organic']
      ]),
      recipe: new Map([
        ['tbsp', 'tablespoon'],
        ['tsp', 'teaspoon'],
        ['oz', 'ounce']
      ]),
      regulation: new Map([
        ['FDA', 'Food and Drug Administration'],
        ['HACCP', 'Hazard Analysis Critical Control Points'],
        ['GFSI', 'Global Food Safety Initiative']
      ]),
      general: new Map()
    };

    return glossaries[context] || glossaries.general;
  }

  private applyFoodTerminologyPostProcessing(
    result: TranslationResult,
    context: string,
    targetLanguage: string
  ): TranslationResult {
    // Apply language and context-specific post-processing
    // This is a simplified example - in production, use more sophisticated rules
    
    if (context === 'regulation' && targetLanguage === 'es') {
      // Keep acronyms in regulatory context
      result.text = result.text.replace(/FDA/gi, 'FDA');
      result.text = result.text.replace(/HACCP/gi, 'HACCP');
    }

    return result;
  }

  async translateIngredientList(
    ingredients: string[],
    targetLanguage: string,
    includeAllergens: boolean = true
  ): Promise<Array<{ original: string; translated: string; allergens?: string[] }>> {
    try {
      const translations = await this.translateText(ingredients, targetLanguage);
      
      const results = ingredients.map((ingredient, index) => {
        const result: any = {
          original: ingredient,
          translated: translations[index].text
        };

        if (includeAllergens) {
          result.allergens = this.detectAllergens(ingredient);
        }

        return result;
      });

      return results;
    } catch (error) {
      productionLogger.error('Ingredient translation failed', { error });
      throw error;
    }
  }

  private detectAllergens(ingredient: string): string[] {
    const allergenKeywords = {
      'milk': ['milk', 'dairy', 'lactose', 'cheese', 'butter', 'cream', 'yogurt'],
      'eggs': ['egg', 'eggs', 'albumin', 'mayonnaise'],
      'fish': ['fish', 'salmon', 'tuna', 'cod', 'anchovies'],
      'shellfish': ['shrimp', 'crab', 'lobster', 'prawns', 'oyster'],
      'tree nuts': ['almond', 'cashew', 'walnut', 'pecan', 'pistachio'],
      'peanuts': ['peanut', 'groundnut'],
      'wheat': ['wheat', 'flour', 'gluten', 'bread'],
      'soy': ['soy', 'soybean', 'tofu', 'tempeh'],
      'sesame': ['sesame', 'tahini']
    };

    const detectedAllergens: string[] = [];
    const lowerIngredient = ingredient.toLowerCase();

    for (const [allergen, keywords] of Object.entries(allergenKeywords)) {
      if (keywords.some(keyword => lowerIngredient.includes(keyword))) {
        detectedAllergens.push(allergen);
      }
    }

    return detectedAllergens;
  }
}

export const translatorService = TranslatorService.getInstance();