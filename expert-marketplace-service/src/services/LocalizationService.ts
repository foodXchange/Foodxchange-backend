import { Logger } from '../utils/logger';
import { advancedCacheService } from './AdvancedCacheService';

const logger = new Logger('LocalizationService');

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  region: string[];
  isRTL: boolean;
  dateFormat: string;
  numberFormat: string;
  currencyFormat: string;
  enabled: boolean;
}

export interface LocalizationKey {
  key: string;
  context: string;
  defaultText: string;
  translations: Record<string, string>;
  placeholders?: string[];
  category: 'ui' | 'email' | 'notification' | 'compliance' | 'industry';
}

export interface CultureSettings {
  language: string;
  region: string;
  timezone: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
  numberFormat: {
    decimal: string;
    thousands: string;
    currency: string;
  };
  workingHours: {
    start: string;
    end: string;
    workingDays: number[];
  };
  holidays: string[];
}

export interface TranslationRequest {
  texts: string[];
  fromLanguage: string;
  toLanguage: string;
  context?: string;
  industry?: string;
}

export class LocalizationService {
  private supportedLanguages: Map<string, SupportedLanguage> = new Map();
  private translations: Map<string, LocalizationKey> = new Map();
  private cultureSettings: Map<string, CultureSettings> = new Map();

  constructor() {
    this.loadSupportedLanguages();
    this.loadTranslations();
    this.loadCultureSettings();
  }

  private loadSupportedLanguages(): void {
    const languages: SupportedLanguage[] = [
      {
        code: 'en',
        name: 'English',
        nativeName: 'English',
        region: ['US', 'GB', 'CA', 'AU'],
        isRTL: false,
        dateFormat: 'MM/DD/YYYY',
        numberFormat: '1,234.56',
        currencyFormat: '$1,234.56',
        enabled: true
      },
      {
        code: 'es',
        name: 'Spanish',
        nativeName: 'Español',
        region: ['ES', 'MX', 'AR', 'CO', 'PE', 'CL'],
        isRTL: false,
        dateFormat: 'DD/MM/YYYY',
        numberFormat: '1.234,56',
        currencyFormat: '1.234,56 €',
        enabled: true
      },
      {
        code: 'fr',
        name: 'French',
        nativeName: 'Français',
        region: ['FR', 'CA', 'BE', 'CH'],
        isRTL: false,
        dateFormat: 'DD/MM/YYYY',
        numberFormat: '1 234,56',
        currencyFormat: '1 234,56 €',
        enabled: true
      },
      {
        code: 'de',
        name: 'German',
        nativeName: 'Deutsch',
        region: ['DE', 'AT', 'CH'],
        isRTL: false,
        dateFormat: 'DD.MM.YYYY',
        numberFormat: '1.234,56',
        currencyFormat: '1.234,56 €',
        enabled: true
      },
      {
        code: 'zh',
        name: 'Chinese (Simplified)',
        nativeName: '简体中文',
        region: ['CN', 'SG'],
        isRTL: false,
        dateFormat: 'YYYY/MM/DD',
        numberFormat: '1,234.56',
        currencyFormat: '¥1,234.56',
        enabled: true
      },
      {
        code: 'ja',
        name: 'Japanese',
        nativeName: '日本語',
        region: ['JP'],
        isRTL: false,
        dateFormat: 'YYYY/MM/DD',
        numberFormat: '1,234.56',
        currencyFormat: '¥1,234',
        enabled: true
      },
      {
        code: 'ko',
        name: 'Korean',
        nativeName: '한국어',
        region: ['KR'],
        isRTL: false,
        dateFormat: 'YYYY.MM.DD',
        numberFormat: '1,234.56',
        currencyFormat: '₩1,234',
        enabled: true
      },
      {
        code: 'ar',
        name: 'Arabic',
        nativeName: 'العربية',
        region: ['SA', 'AE', 'EG', 'JO', 'LB'],
        isRTL: true,
        dateFormat: 'DD/MM/YYYY',
        numberFormat: '1,234.56',
        currencyFormat: '1,234.56 ر.س',
        enabled: true
      },
      {
        code: 'pt',
        name: 'Portuguese',
        nativeName: 'Português',
        region: ['BR', 'PT'],
        isRTL: false,
        dateFormat: 'DD/MM/YYYY',
        numberFormat: '1.234,56',
        currencyFormat: 'R$ 1.234,56',
        enabled: true
      },
      {
        code: 'ru',
        name: 'Russian',
        nativeName: 'Русский',
        region: ['RU', 'BY', 'KZ'],
        isRTL: false,
        dateFormat: 'DD.MM.YYYY',
        numberFormat: '1 234,56',
        currencyFormat: '1 234,56 ₽',
        enabled: true
      },
      {
        code: 'hi',
        name: 'Hindi',
        nativeName: 'हिन्दी',
        region: ['IN'],
        isRTL: false,
        dateFormat: 'DD/MM/YYYY',
        numberFormat: '1,23,456.78',
        currencyFormat: '₹1,23,456.78',
        enabled: true
      },
      {
        code: 'it',
        name: 'Italian',
        nativeName: 'Italiano',
        region: ['IT', 'CH'],
        isRTL: false,
        dateFormat: 'DD/MM/YYYY',
        numberFormat: '1.234,56',
        currencyFormat: '1.234,56 €',
        enabled: true
      },
      {
        code: 'nl',
        name: 'Dutch',
        nativeName: 'Nederlands',
        region: ['NL', 'BE'],
        isRTL: false,
        dateFormat: 'DD-MM-YYYY',
        numberFormat: '1.234,56',
        currencyFormat: '€ 1.234,56',
        enabled: true
      },
      {
        code: 'pl',
        name: 'Polish',
        nativeName: 'Polski',
        region: ['PL'],
        isRTL: false,
        dateFormat: 'DD.MM.YYYY',
        numberFormat: '1 234,56',
        currencyFormat: '1 234,56 zł',
        enabled: true
      },
      {
        code: 'tr',
        name: 'Turkish',
        nativeName: 'Türkçe',
        region: ['TR'],
        isRTL: false,
        dateFormat: 'DD.MM.YYYY',
        numberFormat: '1.234,56',
        currencyFormat: '1.234,56 ₺',
        enabled: true
      }
    ];

    languages.forEach(lang => {
      this.supportedLanguages.set(lang.code, lang);
    });

    logger.info(`Loaded ${languages.length} supported languages`);
  }

  private loadTranslations(): void {
    const translations: LocalizationKey[] = [
      // UI Translations
      {
        key: 'navigation.dashboard',
        context: 'Main navigation menu',
        defaultText: 'Dashboard',
        category: 'ui',
        translations: {
          es: 'Panel de Control',
          fr: 'Tableau de Bord',
          de: 'Dashboard',
          zh: '仪表板',
          ja: 'ダッシュボード',
          ko: '대시보드',
          ar: 'لوحة القيادة',
          pt: 'Painel',
          ru: 'Панель управления',
          hi: 'डैशबोर्ड',
          it: 'Cruscotto',
          nl: 'Dashboard',
          pl: 'Panel główny',
          tr: 'Gösterge Paneli'
        }
      },
      {
        key: 'expert.profile.title',
        context: 'Expert profile page title',
        defaultText: 'Expert Profile',
        category: 'ui',
        translations: {
          es: 'Perfil del Experto',
          fr: 'Profil d\'Expert',
          de: 'Expertenprofil',
          zh: '专家档案',
          ja: 'エキスパートプロフィール',
          ko: '전문가 프로필',
          ar: 'ملف الخبير',
          pt: 'Perfil do Especialista',
          ru: 'Профиль эксперта',
          hi: 'विशेषज्ञ प्रोफ़ाइल',
          it: 'Profilo Esperto',
          nl: 'Expert Profiel',
          pl: 'Profil Eksperta',
          tr: 'Uzman Profili'
        }
      },
      
      // Food Industry Specific Translations
      {
        key: 'industry.dairy.title',
        context: 'Dairy industry category',
        defaultText: 'Dairy Products',
        category: 'industry',
        translations: {
          es: 'Productos Lácteos',
          fr: 'Produits Laitiers',
          de: 'Milchprodukte',
          zh: '乳制品',
          ja: '乳製品',
          ko: '유제품',
          ar: 'منتجات الألبان',
          pt: 'Produtos Lácteos',
          ru: 'Молочные продукты',
          hi: 'डेयरी उत्पाद',
          it: 'Prodotti Caseari',
          nl: 'Zuivelproducten',
          pl: 'Produkty Mleczne',
          tr: 'Süt Ürünleri'
        }
      },
      {
        key: 'compliance.haccp.title',
        context: 'HACCP compliance standard',
        defaultText: 'Hazard Analysis Critical Control Points',
        category: 'compliance',
        translations: {
          es: 'Análisis de Peligros y Puntos Críticos de Control',
          fr: 'Analyse des Dangers et Points Critiques pour leur Maîtrise',
          de: 'Gefahrenanalyse und kritische Kontrollpunkte',
          zh: '危害分析关键控制点',
          ja: '危害分析重要管理点',
          ko: '위해요소 중점관리기준',
          ar: 'تحليل المخاطر ونقاط التحكم الحرجة',
          pt: 'Análise de Perigos e Pontos Críticos de Controle',
          ru: 'Анализ опасностей и критические контрольные точки',
          hi: 'खतरा विश्लेषण महत्वपूर्ण नियंत्रण बिंदु',
          it: 'Analisi dei Pericoli e Punti Critici di Controllo',
          nl: 'Gevarenanalyse en Kritieke Beheerspunten',
          pl: 'Analiza Zagrożeń i Krytyczne Punkty Kontroli',
          tr: 'Tehlike Analizi Kritik Kontrol Noktaları'
        }
      },

      // Email Notifications
      {
        key: 'email.expert.booking.subject',
        context: 'Expert booking email subject',
        defaultText: 'New Booking Request - {clientName}',
        category: 'email',
        placeholders: ['clientName'],
        translations: {
          es: 'Nueva Solicitud de Reserva - {clientName}',
          fr: 'Nouvelle Demande de Réservation - {clientName}',
          de: 'Neue Buchungsanfrage - {clientName}',
          zh: '新预订请求 - {clientName}',
          ja: '新しい予約リクエスト - {clientName}',
          ko: '새 예약 요청 - {clientName}',
          ar: 'طلب حجز جديد - {clientName}',
          pt: 'Nova Solicitação de Reserva - {clientName}',
          ru: 'Новый запрос на бронирование - {clientName}',
          hi: 'नई बुकिंग का अनुरोध - {clientName}',
          it: 'Nuova Richiesta di Prenotazione - {clientName}',
          nl: 'Nieuwe Boekingsaanvraag - {clientName}',
          pl: 'Nowe Żądanie Rezerwacji - {clientName}',
          tr: 'Yeni Rezervasyon Talebi - {clientName}'
        }
      },

      // System Messages
      {
        key: 'system.maintenance.message',
        context: 'System maintenance notification',
        defaultText: 'System maintenance scheduled for {date} from {startTime} to {endTime}',
        category: 'notification',
        placeholders: ['date', 'startTime', 'endTime'],
        translations: {
          es: 'Mantenimiento del sistema programado para {date} de {startTime} a {endTime}',
          fr: 'Maintenance système prévue le {date} de {startTime} à {endTime}',
          de: 'Systemwartung geplant für {date} von {startTime} bis {endTime}',
          zh: '系统维护计划于{date}从{startTime}到{endTime}',
          ja: 'システムメンテナンスが{date}の{startTime}から{endTime}まで予定されています',
          ko: '{date} {startTime}부터 {endTime}까지 시스템 유지보수 예정',
          ar: 'صيانة النظام مجدولة في {date} من {startTime} إلى {endTime}',
          pt: 'Manutenção do sistema agendada para {date} das {startTime} às {endTime}',
          ru: 'Техническое обслуживание системы запланировано на {date} с {startTime} до {endTime}',
          hi: '{date} को {startTime} से {endTime} तक सिस्टम रखरखाव निर्धारित',
          it: 'Manutenzione sistema programmata per {date} dalle {startTime} alle {endTime}',
          nl: 'Systeemonderhoud gepland voor {date} van {startTime} tot {endTime}',
          pl: 'Konserwacja systemu zaplanowana na {date} od {startTime} do {endTime}',
          tr: '{date} tarihinde {startTime} - {endTime} arası sistem bakımı planlandı'
        }
      }
    ];

    translations.forEach(translation => {
      this.translations.set(translation.key, translation);
    });

    logger.info(`Loaded ${translations.length} translation keys`);
  }

  private loadCultureSettings(): void {
    const cultures: CultureSettings[] = [
      {
        language: 'en',
        region: 'US',
        timezone: 'America/New_York',
        dateFormat: 'MM/DD/YYYY',
        timeFormat: '12h',
        numberFormat: { decimal: '.', thousands: ',', currency: '$' },
        workingHours: { start: '09:00', end: '17:00', workingDays: [1, 2, 3, 4, 5] },
        holidays: ['2024-01-01', '2024-07-04', '2024-12-25']
      },
      {
        language: 'es',
        region: 'ES',
        timezone: 'Europe/Madrid',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '24h',
        numberFormat: { decimal: ',', thousands: '.', currency: '€' },
        workingHours: { start: '09:00', end: '18:00', workingDays: [1, 2, 3, 4, 5] },
        holidays: ['2024-01-01', '2024-01-06', '2024-12-25']
      },
      {
        language: 'zh',
        region: 'CN',
        timezone: 'Asia/Shanghai',
        dateFormat: 'YYYY/MM/DD',
        timeFormat: '24h',
        numberFormat: { decimal: '.', thousands: ',', currency: '¥' },
        workingHours: { start: '09:00', end: '18:00', workingDays: [1, 2, 3, 4, 5] },
        holidays: ['2024-01-01', '2024-02-10', '2024-10-01']
      },
      {
        language: 'ar',
        region: 'SA',
        timezone: 'Asia/Riyadh',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '12h',
        numberFormat: { decimal: '.', thousands: ',', currency: 'ر.س' },
        workingHours: { start: '08:00', end: '16:00', workingDays: [0, 1, 2, 3, 4] }, // Sunday-Thursday
        holidays: ['2024-09-23', '2024-05-01']
      }
    ];

    cultures.forEach(culture => {
      const key = `${culture.language}-${culture.region}`;
      this.cultureSettings.set(key, culture);
    });

    logger.info(`Loaded ${cultures.length} culture settings`);
  }

  /**
   * Get translated text for a key
   */
  async translate(
    key: string, 
    language: string = 'en', 
    placeholders?: Record<string, string>
  ): Promise<string> {
    try {
      const cacheKey = `translation:${key}:${language}`;
      const cached = await advancedCacheService.get<string>(cacheKey);
      
      if (cached) {
        return this.replacePlaceholders(cached, placeholders);
      }

      const translation = this.translations.get(key);
      if (!translation) {
        logger.warn(`Translation key not found: ${key}`);
        return key;
      }

      let text = translation.translations[language] || translation.defaultText;
      
      // Replace placeholders
      if (placeholders) {
        text = this.replacePlaceholders(text, placeholders);
      }

      // Cache for 24 hours
      await advancedCacheService.set(cacheKey, text, {
        ttl: 86400,
        tags: ['translations', language]
      });

      return text;
    } catch (error) {
      logger.error('Translation error:', error);
      return key;
    }
  }

  /**
   * Get multiple translations at once
   */
  async translateBatch(
    keys: string[], 
    language: string = 'en',
    placeholders?: Record<string, Record<string, string>>
  ): Promise<Record<string, string>> {
    try {
      const translations: Record<string, string> = {};
      
      for (const key of keys) {
        const keyPlaceholders = placeholders?.[key];
        translations[key] = await this.translate(key, language, keyPlaceholders);
      }

      return translations;
    } catch (error) {
      logger.error('Batch translation error:', error);
      return {};
    }
  }

  /**
   * Auto-detect language from text
   */
  async detectLanguage(text: string): Promise<string> {
    try {
      // Mock implementation - in production, use Azure Cognitive Services or Google Translate
      const languagePatterns = {
        'zh': /[\u4e00-\u9fff]/,
        'ja': /[\u3040-\u309f\u30a0-\u30ff]/,
        'ko': /[\uac00-\ud7af]/,
        'ar': /[\u0600-\u06ff]/,
        'ru': /[\u0400-\u04ff]/,
        'hi': /[\u0900-\u097f]/
      };

      for (const [lang, pattern] of Object.entries(languagePatterns)) {
        if (pattern.test(text)) {
          return lang;
        }
      }

      // Default to English for Latin scripts
      return 'en';
    } catch (error) {
      logger.error('Language detection error:', error);
      return 'en';
    }
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): SupportedLanguage[] {
    return Array.from(this.supportedLanguages.values())
      .filter(lang => lang.enabled)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get culture settings for language and region
   */
  getCultureSettings(language: string, region?: string): CultureSettings | null {
    const key = region ? `${language}-${region}` : language;
    return this.cultureSettings.get(key) || this.cultureSettings.get(language) || null;
  }

  /**
   * Format number according to locale
   */
  formatNumber(
    value: number, 
    language: string, 
    type: 'decimal' | 'currency' | 'percentage' = 'decimal',
    options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
  ): string {
    try {
      const locale = this.getLocaleFromLanguage(language);
      const formatOptions: Intl.NumberFormatOptions = {
        style: type === 'currency' ? 'currency' : type === 'percentage' ? 'percent' : 'decimal',
        ...options
      };

      if (type === 'currency') {
        const culture = this.getCultureSettings(language);
        formatOptions.currency = this.getCurrencyCode(culture?.numberFormat.currency || '$');
      }

      return new Intl.NumberFormat(locale, formatOptions).format(value);
    } catch (error) {
      logger.error('Number formatting error:', error);
      return value.toString();
    }
  }

  /**
   * Format date according to locale
   */
  formatDate(
    date: Date, 
    language: string, 
    format: 'short' | 'medium' | 'long' | 'full' = 'medium'
  ): string {
    try {
      const locale = this.getLocaleFromLanguage(language);
      const options: Intl.DateTimeFormatOptions = {
        dateStyle: format
      };

      return new Intl.DateTimeFormat(locale, options).format(date);
    } catch (error) {
      logger.error('Date formatting error:', error);
      return date.toISOString().split('T')[0];
    }
  }

  /**
   * Format time according to locale
   */
  formatTime(
    date: Date, 
    language: string, 
    use24Hour?: boolean
  ): string {
    try {
      const locale = this.getLocaleFromLanguage(language);
      const culture = this.getCultureSettings(language);
      const hour12 = use24Hour !== undefined ? !use24Hour : culture?.timeFormat === '12h';

      const options: Intl.DateTimeFormatOptions = {
        hour: '2-digit',
        minute: '2-digit',
        hour12
      };

      return new Intl.DateTimeFormat(locale, options).format(date);
    } catch (error) {
      logger.error('Time formatting error:', error);
      return date.toTimeString().slice(0, 5);
    }
  }

  /**
   * Get localized industry categories
   */
  async getLocalizedIndustryCategories(language: string = 'en'): Promise<Record<string, string>> {
    try {
      const cacheKey = `industry_categories:${language}`;
      const cached = await advancedCacheService.get<Record<string, string>>(cacheKey);
      
      if (cached) return cached;

      const industries = [
        'dairy', 'meat_poultry', 'beverages', 'bakery_confectionery',
        'fruits_vegetables', 'supplements_nutraceuticals', 'food_safety',
        'quality_assurance', 'regulatory_compliance', 'packaging'
      ];

      const localizedIndustries: Record<string, string> = {};
      
      for (const industry of industries) {
        const key = `industry.${industry}.title`;
        localizedIndustries[industry] = await this.translate(key, language);
      }

      // Cache for 4 hours
      await advancedCacheService.set(cacheKey, localizedIndustries, {
        ttl: 14400,
        tags: ['translations', 'industries', language]
      });

      return localizedIndustries;
    } catch (error) {
      logger.error('Industry localization error:', error);
      return {};
    }
  }

  /**
   * Get localized compliance standards
   */
  async getLocalizedComplianceStandards(language: string = 'en'): Promise<Record<string, string>> {
    try {
      const standards = ['haccp', 'fda_fsma', 'brc', 'sqf', 'ifs', 'iso_22000'];
      const localizedStandards: Record<string, string> = {};
      
      for (const standard of standards) {
        const key = `compliance.${standard}.title`;
        localizedStandards[standard] = await this.translate(key, language);
      }

      return localizedStandards;
    } catch (error) {
      logger.error('Compliance standards localization error:', error);
      return {};
    }
  }

  /**
   * Validate if language is supported
   */
  isLanguageSupported(language: string): boolean {
    const lang = this.supportedLanguages.get(language);
    return lang !== undefined && lang.enabled;
  }

  /**
   * Get user's preferred language from headers or settings
   */
  detectUserLanguage(acceptLanguageHeader?: string, userPreference?: string): string {
    // User preference takes priority
    if (userPreference && this.isLanguageSupported(userPreference)) {
      return userPreference;
    }

    // Parse Accept-Language header
    if (acceptLanguageHeader) {
      const languages = acceptLanguageHeader
        .split(',')
        .map(lang => lang.split(';')[0].trim().toLowerCase())
        .map(lang => lang.split('-')[0]); // Get base language code

      for (const lang of languages) {
        if (this.isLanguageSupported(lang)) {
          return lang;
        }
      }
    }

    // Default to English
    return 'en';
  }

  // Private helper methods

  private replacePlaceholders(text: string, placeholders?: Record<string, string>): string {
    if (!placeholders) return text;

    let result = text;
    for (const [key, value] of Object.entries(placeholders)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  private getLocaleFromLanguage(language: string): string {
    const languageMap: Record<string, string> = {
      'en': 'en-US',
      'es': 'es-ES',
      'fr': 'fr-FR',
      'de': 'de-DE',
      'zh': 'zh-CN',
      'ja': 'ja-JP',
      'ko': 'ko-KR',
      'ar': 'ar-SA',
      'pt': 'pt-BR',
      'ru': 'ru-RU',
      'hi': 'hi-IN',
      'it': 'it-IT',
      'nl': 'nl-NL',
      'pl': 'pl-PL',
      'tr': 'tr-TR'
    };

    return languageMap[language] || 'en-US';
  }

  private getCurrencyCode(symbol: string): string {
    const currencyMap: Record<string, string> = {
      '$': 'USD',
      '€': 'EUR',
      '¥': 'JPY',
      '£': 'GBP',
      '₩': 'KRW',
      'ر.س': 'SAR',
      'R$': 'BRL',
      '₽': 'RUB',
      '₹': 'INR',
      'zł': 'PLN',
      '₺': 'TRY'
    };

    return currencyMap[symbol] || 'USD';
  }

  /**
   * Add new translation key
   */
  async addTranslation(key: string, translations: LocalizationKey): Promise<void> {
    this.translations.set(key, translations);
    
    // Invalidate cache for this key
    for (const lang of Object.keys(translations.translations)) {
      await advancedCacheService.delete(`translation:${key}:${lang}`);
    }

    logger.info('Translation added', { key });
  }

  /**
   * Update existing translation
   */
  async updateTranslation(key: string, language: string, text: string): Promise<void> {
    const existing = this.translations.get(key);
    if (existing) {
      existing.translations[language] = text;
      this.translations.set(key, existing);
      
      // Invalidate cache
      await advancedCacheService.delete(`translation:${key}:${language}`);
      
      logger.info('Translation updated', { key, language });
    }
  }

  /**
   * Export translations for external translation services
   */
  exportTranslations(category?: string): Record<string, LocalizationKey> {
    const exported: Record<string, LocalizationKey> = {};
    
    for (const [key, translation] of this.translations.entries()) {
      if (!category || translation.category === category) {
        exported[key] = translation;
      }
    }

    return exported;
  }

  /**
   * Import translations from external source
   */
  async importTranslations(translations: Record<string, LocalizationKey>): Promise<void> {
    for (const [key, translation] of Object.entries(translations)) {
      await this.addTranslation(key, translation);
    }

    logger.info(`Imported ${Object.keys(translations).length} translations`);
  }
}

export const localizationService = new LocalizationService();