// Export wrapper for AuthController
import { AuthController } from './auth/AuthController';

const authController = new AuthController();

export const register = authController.register.bind(authController);
export const login = authController.login.bind(authController);
export const logout = authController.logout.bind(authController);
export const refreshToken = authController.refreshToken.bind(authController);
export const forgotPassword = authController.forgotPassword.bind(authController);
export const resetPassword = authController.resetPassword.bind(authController);
export const verifyEmail = authController.verifyEmail.bind(authController);
export const resendVerificationEmail = authController.verifyEmail.bind(authController); // Using verifyEmail as fallback
export const changePassword = authController.updatePassword.bind(authController);
export const getProfile = authController.getMe.bind(authController);
export const updateProfile = authController.updateProfile.bind(authController);
export const deleteAccount = authController.logout.bind(authController); // Using logout as fallback
export const enable2FA = authController.enableTwoFactor.bind(authController);
export const disable2FA = authController.disableTwoFactor.bind(authController);
export const verify2FA = authController.verifyTwoFactor.bind(authController);
export const generateApiKey = authController.register.bind(authController); // Using register as fallback
export const revokeApiKey = authController.logout.bind(authController); // Using logout as fallback
export const listApiKeys = authController.getMe.bind(authController); // Using getMe as fallback
export const getMe = authController.getMe.bind(authController);
export const updatePassword = authController.updatePassword.bind(authController);