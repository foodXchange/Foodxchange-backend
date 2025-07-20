import { Router } from 'express';

import { UserController } from '../../../controllers/user/UserController';
import { asyncHandler } from '../../../core/errors';
import { protect } from '../../../middleware/auth';
import { responseFormatterMiddleware } from '../../../middleware/responseFormatter';
import { validate } from '../../../middleware/validation';

const router = Router();
const userController = new UserController();

// Apply middleware
router.use(responseFormatterMiddleware);
router.use(protect); // All user routes require authentication

/**
 * @swagger
 * /api/v1/users/profile:
 *   get:
 *     summary: Get user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 */
router.get('/profile',
  asyncHandler(userController.getProfile.bind(userController))
);

/**
 * @swagger
 * /api/v1/users/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phone:
 *                 type: string
 *               bio:
 *                 type: string
 *               avatar:
 *                 type: string
 *               website:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.put('/profile',
  validate.userUpdate,
  asyncHandler(userController.updateProfile.bind(userController))
);

/**
 * @swagger
 * /api/v1/users/profile/completion:
 *   get:
 *     summary: Get profile completion status
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile completion status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     completionPercentage:
 *                       type: number
 *                       example: 60
 *                     missingFields:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ['companySize', 'industry', 'phone']
 *                     nextStep:
 *                       type: string
 *                       example: 'company-details'
 *                     onboardingStep:
 *                       type: string
 *                       example: 'profile-completion'
 *       401:
 *         description: Unauthorized
 */
router.get('/profile/completion',
  asyncHandler(userController.getProfileCompletion.bind(userController))
);

/**
 * @swagger
 * /api/v1/users/company:
 *   put:
 *     summary: Update company details
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - companyName
 *               - companySize
 *               - industry
 *             properties:
 *               companyName:
 *                 type: string
 *                 example: 'Demo Foods Inc'
 *               companySize:
 *                 type: string
 *                 enum: ['1-10', '11-50', '50-200', '200+']
 *                 example: '50-200'
 *               industry:
 *                 type: string
 *                 example: 'Food Import'
 *               businessType:
 *                 type: string
 *                 enum: ['restaurant', 'distributor', 'manufacturer', 'retailer', 'other']
 *               website:
 *                 type: string
 *                 example: 'https://example.com'
 *               description:
 *                 type: string
 *               address:
 *                 type: object
 *                 properties:
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   zipCode:
 *                     type: string
 *                   country:
 *                     type: string
 *     responses:
 *       200:
 *         description: Company details updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.put('/company',
  validate.companyUpdate,
  asyncHandler(userController.updateCompany.bind(userController))
);

/**
 * @swagger
 * /api/v1/users/company:
 *   get:
 *     summary: Get company details
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Company details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Company'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Company not found
 */
router.get('/company',
  asyncHandler(userController.getCompany.bind(userController))
);

/**
 * @swagger
 * /api/v1/users/password:
 *   put:
 *     summary: Change password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *               confirmPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized or invalid current password
 */
router.put('/password',
  validate.userChangePassword,
  asyncHandler(userController.changePassword.bind(userController))
);

/**
 * @swagger
 * /api/v1/users/documents:
 *   post:
 *     summary: Upload verification document
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: ['business_license', 'tax_certificate', 'insurance', 'certification', 'other']
 *               document:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Document uploaded successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/documents',
  asyncHandler(userController.uploadDocument.bind(userController))
);

/**
 * @swagger
 * /api/v1/users/documents:
 *   get:
 *     summary: Get user documents
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Documents retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                       url:
 *                         type: string
 *                       uploadedAt:
 *                         type: string
 *                         format: date-time
 *                       verified:
 *                         type: boolean
 *       401:
 *         description: Unauthorized
 */
router.get('/documents',
  asyncHandler(userController.getDocuments.bind(userController))
);

/**
 * @swagger
 * /api/v1/users/preferences:
 *   put:
 *     summary: Update user preferences
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notifications:
 *                 type: object
 *                 properties:
 *                   email:
 *                     type: boolean
 *                   sms:
 *                     type: boolean
 *                   push:
 *                     type: boolean
 *               language:
 *                 type: string
 *               timezone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.put('/preferences',
  asyncHandler(userController.updatePreferences.bind(userController))
);

export default router;
