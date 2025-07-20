import { Router } from 'express';

import { SSOController } from '../../../controllers/sso/SSOController';
import { asyncHandler } from '../../../core/errors';
import { responseFormatterMiddleware } from '../../../middleware/responseFormatter';
import { rateLimiters } from '../../../middleware/validation';

const router = Router();
const ssoController = new SSOController();

// Apply response formatter middleware
router.use(responseFormatterMiddleware);

/**
 * @swagger
 * /api/v1/sso/providers:
 *   get:
 *     summary: Get available SSO providers
 *     tags: [SSO]
 *     responses:
 *       200:
 *         description: Available SSO providers
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
 *                     providers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           displayName:
 *                             type: string
 *                           enabled:
 *                             type: boolean
 *                           icon:
 *                             type: string
 */
router.get('/providers',
  asyncHandler(ssoController.getProviders.bind(ssoController))
);

/**
 * @swagger
 * /api/v1/sso/google/auth:
 *   get:
 *     summary: Initiate Google SSO authentication
 *     tags: [SSO]
 *     parameters:
 *       - in: query
 *         name: redirect_uri
 *         schema:
 *           type: string
 *         description: Redirect URI after authentication
 *     responses:
 *       302:
 *         description: Redirect to Google OAuth
 *       400:
 *         description: Invalid request
 */
router.get('/google/auth',
  rateLimiters.auth,
  asyncHandler(ssoController.initiateGoogleAuth.bind(ssoController))
);

/**
 * @swagger
 * /api/v1/sso/google/callback:
 *   get:
 *     summary: Google SSO callback
 *     tags: [SSO]
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         required: true
 *         description: Authorization code from Google
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         required: true
 *         description: State parameter for security
 *     responses:
 *       200:
 *         description: Authentication successful
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
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                     user:
 *                       type: object
 *       400:
 *         description: Authentication failed
 */
router.get('/google/callback',
  rateLimiters.auth,
  asyncHandler(ssoController.handleGoogleCallback.bind(ssoController))
);

/**
 * @swagger
 * /api/v1/sso/microsoft/auth:
 *   get:
 *     summary: Initiate Microsoft SSO authentication
 *     tags: [SSO]
 *     parameters:
 *       - in: query
 *         name: redirect_uri
 *         schema:
 *           type: string
 *         description: Redirect URI after authentication
 *     responses:
 *       302:
 *         description: Redirect to Microsoft OAuth
 *       400:
 *         description: Invalid request
 */
router.get('/microsoft/auth',
  rateLimiters.auth,
  asyncHandler(ssoController.initiateMicrosoftAuth.bind(ssoController))
);

/**
 * @swagger
 * /api/v1/sso/microsoft/callback:
 *   get:
 *     summary: Microsoft SSO callback
 *     tags: [SSO]
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         required: true
 *         description: Authorization code from Microsoft
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         required: true
 *         description: State parameter for security
 *     responses:
 *       200:
 *         description: Authentication successful
 *       400:
 *         description: Authentication failed
 */
router.get('/microsoft/callback',
  rateLimiters.auth,
  asyncHandler(ssoController.handleMicrosoftCallback.bind(ssoController))
);

/**
 * @swagger
 * /api/v1/sso/linkedin/auth:
 *   get:
 *     summary: Initiate LinkedIn SSO authentication
 *     tags: [SSO]
 *     parameters:
 *       - in: query
 *         name: redirect_uri
 *         schema:
 *           type: string
 *         description: Redirect URI after authentication
 *     responses:
 *       302:
 *         description: Redirect to LinkedIn OAuth
 *       400:
 *         description: Invalid request
 */
router.get('/linkedin/auth',
  rateLimiters.auth,
  asyncHandler(ssoController.initiateLinkedInAuth.bind(ssoController))
);

/**
 * @swagger
 * /api/v1/sso/linkedin/callback:
 *   get:
 *     summary: LinkedIn SSO callback
 *     tags: [SSO]
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         required: true
 *         description: Authorization code from LinkedIn
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         required: true
 *         description: State parameter for security
 *     responses:
 *       200:
 *         description: Authentication successful
 *       400:
 *         description: Authentication failed
 */
router.get('/linkedin/callback',
  rateLimiters.auth,
  asyncHandler(ssoController.handleLinkedInCallback.bind(ssoController))
);

/**
 * @swagger
 * /api/v1/sso/saml/metadata:
 *   get:
 *     summary: Get SAML metadata
 *     tags: [SSO]
 *     responses:
 *       200:
 *         description: SAML metadata XML
 *         content:
 *           application/xml:
 *             schema:
 *               type: string
 */
router.get('/saml/metadata',
  asyncHandler(ssoController.getSAMLMetadata.bind(ssoController))
);

/**
 * @swagger
 * /api/v1/sso/saml/login:
 *   post:
 *     summary: Initiate SAML SSO login
 *     tags: [SSO]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               domain:
 *                 type: string
 *                 description: Company domain for SAML configuration
 *               redirect_uri:
 *                 type: string
 *                 description: Redirect URI after authentication
 *     responses:
 *       302:
 *         description: Redirect to SAML IdP
 *       400:
 *         description: Invalid request
 */
router.post('/saml/login',
  rateLimiters.auth,
  asyncHandler(ssoController.initiateSAMLLogin.bind(ssoController))
);

/**
 * @swagger
 * /api/v1/sso/saml/callback:
 *   post:
 *     summary: SAML SSO callback
 *     tags: [SSO]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               SAMLResponse:
 *                 type: string
 *                 description: SAML response from IdP
 *               RelayState:
 *                 type: string
 *                 description: Relay state for security
 *     responses:
 *       200:
 *         description: Authentication successful
 *       400:
 *         description: Authentication failed
 */
router.post('/saml/callback',
  rateLimiters.auth,
  asyncHandler(ssoController.handleSAMLCallback.bind(ssoController))
);

export default router;
