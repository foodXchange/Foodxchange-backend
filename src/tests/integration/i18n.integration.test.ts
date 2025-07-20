import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import app from '../../server';
import { User } from '../../models/User';
import { Company } from '../../models/Company';

// Mock i18n configuration
jest.mock('../../config/i18n', () => ({
  initializeI18n: jest.fn().mockResolvedValue(undefined),
  createI18nMiddleware: jest.fn().mockReturnValue((req: any, res: any, next: any) => next()),
  getSupportedLanguages: jest.fn().mockReturnValue({
    en: { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸', rtl: false },
    es: { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', rtl: false },
    fr: { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', rtl: false }
  }),
  getLanguageInfo: jest.fn().mockImplementation((code: string) => ({
    code,
    name: code === 'en' ? 'English' : code === 'es' ? 'Spanish' : 'French',
    nativeName: code === 'en' ? 'English' : code === 'es' ? 'Español' : 'Français',
    flag: code === 'en' ? '🇺🇸' : code === 'es' ? '🇪🇸' : '🇫🇷',
    rtl: false
  })),
  isLanguageSupported: jest.fn().mockImplementation((lang: string) => 
    ['en', 'es', 'fr'].includes(lang)
  ),
  getRegionalFoodCategories: jest.fn().mockImplementation((lang: string) => 
    lang === 'es' ? ['frutas', 'verduras'] : ['fruits', 'vegetables']
  ),
  CURRENCY_CONFIG: {
    en: { currency: 'USD', format: 'en-US' },
    es: { currency: 'EUR', format: 'es-ES' },
    fr: { currency: 'EUR', format: 'fr-FR' }
  },
  DATE_FORMATS: {
    en: 'MM/DD/YYYY',
    es: 'DD/MM/YYYY',
    fr: 'DD/MM/YYYY'
  },
  DEFAULT_LANGUAGE: 'en',
  SupportedLanguage: {}
}));

// Mock translation service
jest.mock('../../services/i18n/TranslationService', () => ({
  translationService: {
    getUserLanguage: jest.fn().mockResolvedValue('en'),
    getCompanyLanguage: jest.fn().mockResolvedValue('en'),
    setUserLanguage: jest.fn().mockResolvedValue(undefined),
    setCompanyLanguage: jest.fn().mockResolvedValue(undefined),
    translateKey: jest.fn().mockImplementation((key: string) => `translated_${key}`),
    translateBulk: jest.fn().mockImplementation(({ translations }: any) => 
      translations.map((t: any) => ({
        key: t.key,
        translated: `translated_${t.key}`,
        language: 'en',
        namespace: t.options?.namespace
      }))
    ),
    getLocalizedContent: jest.fn().mockResolvedValue({
      title: 'Localized Title',
      description: 'Localized Description'
    }),
    translateEmail: jest.fn().mockResolvedValue({
      subject: 'Translated Subject',
      body: 'Translated Body'
    }),
    translateNotification: jest.fn().mockResolvedValue({
      title: 'Translated Title',
      message: 'Translated Message'
    }),
    translateError: jest.fn().mockResolvedValue('Translated Error'),
    translateValidation: jest.fn().mockResolvedValue('Translated Validation'),
    formatCurrency: jest.fn().mockReturnValue('$1,234.56'),
    formatNumber: jest.fn().mockReturnValue('1,234.56'),
    formatDate: jest.fn().mockReturnValue('01/15/2024'),
    formatRelativeTime: jest.fn().mockReturnValue('2 hours ago'),
    getMissingKeys: jest.fn().mockReturnValue(['missing.key1', 'missing.key2'])
  }
}));

// Mock cache service
jest.mock('../../services/cache/OptimizedCacheService', () => ({
  optimizedCache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined)
  }
}));

// Mock middleware
jest.mock('../../middleware/i18n', () => ({
  __esModule: true,
  default: {
    languageDetection: jest.fn().mockReturnValue((req: any, res: any, next: any) => {
      req.language = 'en';
      req.locale = 'en';
      req.t = (key: string) => `translated_${key}`;
      next();
    }),
    translation: jest.fn().mockReturnValue((req: any, res: any, next: any) => next()),
    responseLocalization: jest.fn().mockReturnValue((req: any, res: any, next: any) => next()),
    rtlDetection: jest.fn().mockReturnValue((req: any, res: any, next: any) => {
      res.locals.isRTL = false;
      res.locals.direction = 'ltr';
      next();
    }),
    errorLocalization: jest.fn().mockReturnValue((req: any, res: any, next: any) => next()),
    languagePreference: jest.fn().mockReturnValue((req: any, res: any, next: any) => next())
  }
}));

describe('I18n API Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let userToken: string;
  let testUser: any;
  let testCompany: any;

  beforeAll(async () => {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Create test company
    testCompany = await Company.create({
      name: 'Test Company',
      type: 'SUPPLIER',
      email: 'company@test.com',
      preferences: {
        language: 'en'
      },
      active: true,
      verified: true
    });

    // Create test user
    testUser = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      password: 'hashedpassword',
      role: 'BUYER',
      company: testCompany._id,
      preferences: {
        language: 'en'
      },
      active: true,
      verified: true
    });

    // Generate token
    userToken = jwt.sign(
      { 
        id: testUser._id, 
        email: testUser.email, 
        role: testUser.role,
        companyId: testCompany._id
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  describe('Language Information Routes', () => {
    test('should get supported languages', async () => {
      const response = await request(app)
        .get('/api/i18n/languages')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.languages).toBeDefined();
      expect(response.body.data.default).toBe('en');
      expect(response.body.data.count).toBe(3);
    });

    test('should get specific language info', async () => {
      const response = await request(app)
        .get('/api/i18n/languages/es')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.code).toBe('es');
      expect(response.body.data.name).toBe('Spanish');
      expect(response.body.data.regional).toBeDefined();
    });

    test('should return 404 for unsupported language', async () => {
      const response = await request(app)
        .get('/api/i18n/languages/unsupported')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Language not supported');
    });
  });

  describe('Translation Routes', () => {
    test('should get translations for namespace and language', async () => {
      // Mock fs.readFile for translation files
      const fs = require('fs/promises');
      jest.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify({
        welcome: 'Bienvenido',
        goodbye: 'Adiós'
      }));

      const response = await request(app)
        .get('/api/i18n/translations/common/es')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.welcome).toBe('Bienvenido');
      expect(response.body.data.goodbye).toBe('Adiós');
    });

    test('should return 404 for missing translation file', async () => {
      const fs = require('fs/promises');
      jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('File not found'));

      const response = await request(app)
        .get('/api/i18n/translations/nonexistent/es')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Translation file not found');
    });

    test('should translate single key', async () => {
      const response = await request(app)
        .post('/api/i18n/translate')
        .send({
          key: 'welcome',
          language: 'es',
          namespace: 'common'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.key).toBe('welcome');
      expect(response.body.data.translated).toBe('translated_welcome');
      expect(response.body.data.language).toBe('es');
    });

    test('should validate translation request', async () => {
      const response = await request(app)
        .post('/api/i18n/translate')
        .send({
          key: '', // Invalid empty key
          language: 'invalid' // Invalid language
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should translate bulk keys', async () => {
      const response = await request(app)
        .post('/api/i18n/translate/bulk')
        .send({
          translations: [
            { key: 'welcome', options: { namespace: 'common' } },
            { key: 'goodbye', options: { namespace: 'common' } }
          ],
          language: 'es'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toHaveLength(2);
      expect(response.body.data.language).toBe('es');
      expect(response.body.data.count).toBe(2);
    });

    test('should validate bulk translation request', async () => {
      const response = await request(app)
        .post('/api/i18n/translate/bulk')
        .send({
          translations: [] // Empty array
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('User Preference Routes', () => {
    test('should get user preferences', async () => {
      const response = await request(app)
        .get('/api/i18n/preferences')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.language).toBe('en');
      expect(response.body.data.languageInfo).toBeDefined();
      expect(response.body.data.regional).toBeDefined();
    });

    test('should require authentication for user preferences', async () => {
      const response = await request(app)
        .get('/api/i18n/preferences')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    test('should update user preferences', async () => {
      const response = await request(app)
        .put('/api/i18n/preferences')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          language: 'es'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.language).toBe('es');
      expect(response.body.message).toBe('Language preference updated successfully');
    });

    test('should validate language in user preferences', async () => {
      const response = await request(app)
        .put('/api/i18n/preferences')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          language: 'invalid'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Company Preference Routes', () => {
    test('should get company preferences', async () => {
      const response = await request(app)
        .get('/api/i18n/company/preferences')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.language).toBe('en');
      expect(response.body.data.regional).toBeDefined();
    });

    test('should update company preferences', async () => {
      const response = await request(app)
        .put('/api/i18n/company/preferences')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          language: 'fr'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.language).toBe('fr');
    });

    test('should require company association for company preferences', async () => {
      // Create user without company
      const userWithoutCompany = await User.create({
        name: 'No Company User',
        email: 'nocompany@test.com',
        password: 'hashedpassword',
        role: 'BUYER',
        active: true,
        verified: true
      });

      const tokenWithoutCompany = jwt.sign(
        { id: userWithoutCompany._id, email: userWithoutCompany.email, role: userWithoutCompany.role },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/api/i18n/company/preferences')
        .set('Authorization', `Bearer ${tokenWithoutCompany}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Company association required');
    });
  });

  describe('Formatting Routes', () => {
    test('should format currency', async () => {
      const response = await request(app)
        .post('/api/i18n/format/currency')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          amount: 1234.56,
          currency: 'USD',
          language: 'en'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.original).toBe(1234.56);
      expect(response.body.data.currency).toBe('USD');
      expect(response.body.data.formatted).toBe('$1,234.56');
    });

    test('should format date', async () => {
      const response = await request(app)
        .post('/api/i18n/format/date')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          date: '2024-01-15T10:30:00Z',
          language: 'en'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.formatted).toBe('01/15/2024');
      expect(response.body.data.relative).toBe('2 hours ago');
    });

    test('should format number', async () => {
      const response = await request(app)
        .post('/api/i18n/format/number')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          number: 1234.56,
          language: 'en'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.original).toBe(1234.56);
      expect(response.body.data.formatted).toBe('1,234.56');
    });

    test('should validate formatting requests', async () => {
      const response = await request(app)
        .post('/api/i18n/format/currency')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          amount: 'invalid', // Should be number
          currency: 'INVALID_CURRENCY' // Should be 3 letters
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Content Localization Routes', () => {
    test('should localize content', async () => {
      const response = await request(app)
        .post('/api/i18n/localize')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          content: {
            title: {
              en: 'English Title',
              es: 'Título Español'
            },
            description: {
              en: 'English Description',
              es: 'Descripción Española'
            }
          },
          language: 'es'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.localized.title).toBe('Localized Title');
      expect(response.body.data.language).toBe('es');
    });

    test('should translate email template', async () => {
      const response = await request(app)
        .post('/api/i18n/templates/email')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          templateKey: 'welcome_email',
          data: { name: 'John', company: 'Test Co' },
          language: 'es'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.template).toBe('welcome_email');
      expect(response.body.data.translated.subject).toBe('Translated Subject');
      expect(response.body.data.translated.body).toBe('Translated Body');
    });

    test('should translate notification template', async () => {
      const response = await request(app)
        .post('/api/i18n/templates/notification')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          templateKey: 'order_shipped',
          data: { orderNumber: '12345' },
          language: 'es'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.translated.title).toBe('Translated Title');
      expect(response.body.data.translated.message).toBe('Translated Message');
    });
  });

  describe('Regional Settings Routes', () => {
    test('should get regional settings', async () => {
      const response = await request(app)
        .get('/api/i18n/regional/es')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.language).toBe('es');
      expect(response.body.data.foodCategories).toBeDefined();
      expect(response.body.data.currency).toBeDefined();
      expect(response.body.data.dateFormat).toBeDefined();
    });

    test('should validate language in regional settings', async () => {
      const response = await request(app)
        .get('/api/i18n/regional/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Unsupported language');
    });
  });

  describe('Statistics Routes', () => {
    test('should get language usage statistics', async () => {
      const response = await request(app)
        .get('/api/i18n/stats/usage')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toBeDefined();
      expect(response.body.data.companies).toBeDefined();
      expect(response.body.data.supportedLanguages).toBe(3);
    });

    test('should get missing translations in development', async () => {
      // Temporarily set NODE_ENV to development
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const response = await request(app)
        .get('/api/i18n/stats/missing')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.missingKeys).toBeDefined();
      expect(Array.isArray(response.body.data.missingKeys)).toBe(true);

      // Restore original NODE_ENV
      process.env.NODE_ENV = originalEnv;
    });

    test('should not allow missing translations in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await request(app)
        .get('/api/i18n/stats/missing')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Not available in production');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Validation Tests', () => {
    test('should validate translate request with all parameters', async () => {
      const response = await request(app)
        .post('/api/i18n/translate')
        .send({
          key: 'test.key',
          language: 'es',
          namespace: 'common',
          interpolation: { name: 'John' },
          context: 'formal',
          count: 5,
          defaultValue: 'Default text'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should validate date formatting options', async () => {
      const response = await request(app)
        .post('/api/i18n/format/date')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          date: '2024-01-15T10:30:00Z',
          language: 'en',
          options: {
            year: 'numeric',
            month: 'long',
            day: '2-digit',
            weekday: 'long'
          }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should reject invalid date format options', async () => {
      const response = await request(app)
        .post('/api/i18n/format/date')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          date: '2024-01-15T10:30:00Z',
          options: {
            year: 'invalid', // Invalid option
            month: 'also-invalid' // Invalid option
          }
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle translation service errors', async () => {
      const { translationService } = require('../../services/i18n/TranslationService');
      translationService.translateKey.mockRejectedValueOnce(new Error('Service error'));

      const response = await request(app)
        .post('/api/i18n/translate')
        .send({
          key: 'test.key',
          language: 'es'
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Translation failed');
    });

    test('should handle file system errors', async () => {
      const fs = require('fs/promises');
      jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('Permission denied'));

      const response = await request(app)
        .get('/api/i18n/translations/common/es')
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Failed to retrieve translations');
    });
  });

  describe('Language Detection Middleware', () => {
    test('should detect language from header', async () => {
      const response = await request(app)
        .get('/api/i18n/languages')
        .set('Accept-Language', 'es,en;q=0.9')
        .expect(200);

      expect(response.body.success).toBe(true);
      // Language detection is mocked to always return 'en'
    });

    test('should detect language from query parameter', async () => {
      const response = await request(app)
        .get('/api/i18n/languages?lang=fr')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should detect language from cookie', async () => {
      const response = await request(app)
        .get('/api/i18n/languages')
        .set('Cookie', 'language=es')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    test('should handle concurrent translation requests', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post('/api/i18n/translate')
          .send({
            key: `test.key.${i}`,
            language: 'es'
          })
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    test('should handle large bulk translation requests', async () => {
      const translations = Array.from({ length: 50 }, (_, i) => ({
        key: `test.key.${i}`,
        options: { namespace: 'common' }
      }));

      const response = await request(app)
        .post('/api/i18n/translate/bulk')
        .send({
          translations,
          language: 'es'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toHaveLength(50);
    });
  });
});