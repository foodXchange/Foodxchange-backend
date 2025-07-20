import { Router } from 'express';

import { i18nController } from '../controllers/I18nController';
import { authenticateToken } from '../middleware/auth';
import i18nMiddleware from '../middleware/i18n';
import { validateRequest } from '../middleware/validation';
import { i18nValidationRules } from '../validators/i18nValidators';

const router = Router();

// Language information routes (public)
router.get('/languages', i18nController.getSupportedLanguages);
router.get('/languages/:code', i18nController.getLanguageInfo);

// Translation routes (public)
router.get('/translations/:namespace/:language', i18nController.getTranslations);
router.post('/translate',
  validateRequest(i18nValidationRules.translate),
  i18nController.translateKey
);
router.post('/translate/bulk',
  validateRequest(i18nValidationRules.translateBulk),
  i18nController.translateBulk
);

// User preference routes (authenticated)
router.use(authenticateToken);

router.get('/preferences',
  i18nController.getUserPreferences
);

router.put('/preferences',
  validateRequest(i18nValidationRules.updatePreferences),
  i18nMiddleware.languagePreference(),
  i18nController.updateUserPreferences
);

// Company preference routes (authenticated)
router.get('/company/preferences',
  i18nController.getCompanyPreferences
);

router.put('/company/preferences',
  validateRequest(i18nValidationRules.updateCompanyPreferences),
  i18nController.updateCompanyPreferences
);

// Localization utilities
router.post('/format/currency',
  validateRequest(i18nValidationRules.formatCurrency),
  i18nController.formatCurrency
);

router.post('/format/date',
  validateRequest(i18nValidationRules.formatDate),
  i18nController.formatDate
);

router.post('/format/number',
  validateRequest(i18nValidationRules.formatNumber),
  i18nController.formatNumber
);

// Content localization
router.post('/localize',
  validateRequest(i18nValidationRules.localizeContent),
  i18nController.localizeContent
);

// Template translation
router.post('/templates/email',
  validateRequest(i18nValidationRules.translateTemplate),
  i18nController.translateEmailTemplate
);

router.post('/templates/notification',
  validateRequest(i18nValidationRules.translateTemplate),
  i18nController.translateNotificationTemplate
);

// Regional settings
router.get('/regional/:language',
  i18nController.getRegionalSettings
);

// Statistics and analytics (admin routes would go here)
router.get('/stats/usage',
  i18nController.getLanguageUsageStats
);

router.get('/stats/missing',
  i18nController.getMissingTranslations
);

export default router;
