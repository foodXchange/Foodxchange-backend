import jwt from 'jsonwebtoken';
import { protect, admin, authorize } from '../../../middleware/auth';
import { User } from '../../../models/User';
import { AuthenticationError, AuthorizationError } from '../../../core/errors';
import { createMockRequest, createMockResponse, createMockNext, createTestUser } from '../../helpers/testHelpers';

// Mock dependencies
jest.mock('../../../models/User');
jest.mock('jsonwebtoken');

const mockUser = User as jest.Mocked<typeof User>;
const mockJwt = jwt as jest.Mocked<typeof jwt>;

describe('Auth Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('protect middleware', () => {
    it('should authenticate user with valid token', async () => {
      const user = await createTestUser();
      const token = 'valid-token';
      const decodedToken = { _id: user._id };

      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      mockJwt.verify.mockReturnValue(decodedToken as any);
      mockUser.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(user),
      } as any);

      await protect(req as any, res as any, next);

      expect(mockJwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET || 'your-secret-key');
      expect(mockUser.findById).toHaveBeenCalledWith(user._id);
      expect(req.user).toBe(user);
      expect(next).toHaveBeenCalled();
    });

    it('should throw AuthenticationError for invalid token', async () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer invalid-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(protect(req as any, res as any, next)).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError when user not found', async () => {
      const token = 'valid-token';
      const decodedToken = { _id: 'nonexistent-user-id' };

      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      });
      const res = createMockResponse();
      const next = createMockNext();

      mockJwt.verify.mockReturnValue(decodedToken as any);
      mockUser.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      } as any);

      await expect(protect(req as any, res as any, next)).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError when no token provided', async () => {
      const req = createMockRequest({
        headers: {},
      });
      const res = createMockResponse();
      const next = createMockNext();

      await expect(protect(req as any, res as any, next)).rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError for malformed authorization header', async () => {
      const req = createMockRequest({
        headers: { authorization: 'InvalidHeader' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await expect(protect(req as any, res as any, next)).rejects.toThrow(AuthenticationError);
    });
  });

  describe('admin middleware', () => {
    it('should allow admin user to proceed', () => {
      const adminUser = { role: 'admin' };
      const req = createMockRequest({ user: adminUser });
      const res = createMockResponse();
      const next = createMockNext();

      admin(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });

    it('should throw AuthorizationError for non-admin user', () => {
      const regularUser = { role: 'buyer' };
      const req = createMockRequest({ user: regularUser });
      const res = createMockResponse();
      const next = createMockNext();

      expect(() => admin(req as any, res as any, next)).toThrow(AuthorizationError);
    });

    it('should throw AuthorizationError when no user', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      expect(() => admin(req as any, res as any, next)).toThrow(AuthorizationError);
    });
  });

  describe('authorize middleware', () => {
    it('should allow user with authorized role', () => {
      const user = { role: 'seller' };
      const req = createMockRequest({ user });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = authorize('seller', 'admin');
      middleware(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });

    it('should throw AuthorizationError for unauthorized role', () => {
      const user = { role: 'buyer' };
      const req = createMockRequest({ user });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = authorize('seller', 'admin');

      expect(() => middleware(req as any, res as any, next)).toThrow(AuthorizationError);
    });

    it('should throw AuthenticationError when no user', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = authorize('seller');

      expect(() => middleware(req as any, res as any, next)).toThrow(AuthenticationError);
    });

    it('should work with multiple roles', () => {
      const user = { role: 'admin' };
      const req = createMockRequest({ user });
      const res = createMockResponse();
      const next = createMockNext();

      const middleware = authorize('buyer', 'seller', 'admin');
      middleware(req as any, res as any, next);

      expect(next).toHaveBeenCalled();
    });
  });
});