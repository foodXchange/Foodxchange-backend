import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../../models/User';
import { Types } from 'mongoose';

export const createMockRequest = (overrides: Partial<Request> = {}): Partial<Request> => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  user: undefined,
  ...overrides,
});

export const createMockResponse = (): Partial<Response> => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
  };
  return res;
};

export const createMockNext = () => jest.fn();

export const createTestUser = async (overrides: Partial<any> = {}) => {
  const userData = {
    email: 'test@example.com',
    password: 'hashedpassword123',
    firstName: 'Test',
    lastName: 'User',
    role: 'buyer',
    isEmailVerified: true,
    accountStatus: 'active',
    ...overrides,
  };

  const user = new User(userData);
  await user.save();
  return user;
};

export const createTestJWT = (userId: string | Types.ObjectId) => {
  return jwt.sign({ _id: userId }, process.env.JWT_SECRET || 'test-secret', {
    expiresIn: '1h',
  });
};

export const createAuthenticatedRequest = async (userOverrides: Partial<any> = {}) => {
  const user = await createTestUser(userOverrides);
  const token = createTestJWT(user._id);
  
  return {
    user,
    token,
    request: createMockRequest({
      headers: { authorization: `Bearer ${token}` },
      user: user,
    }),
  };
};

export const expectValidationError = (response: any, field?: string) => {
  expect(response.status).toHaveBeenCalledWith(400);
  expect(response.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'VAL_001',
        message: expect.stringContaining('Validation failed'),
      }),
    })
  );
  
  if (field) {
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          validationErrors: expect.arrayContaining([
            expect.objectContaining({
              field: field,
            }),
          ]),
        }),
      })
    );
  }
};

export const expectNotFoundError = (response: any, resource: string) => {
  expect(response.status).toHaveBeenCalledWith(404);
  expect(response.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'BUS_001',
        message: expect.stringContaining(`${resource} not found`),
      }),
    })
  );
};

export const expectAuthError = (response: any) => {
  expect(response.status).toHaveBeenCalledWith(401);
  expect(response.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: expect.stringMatching(/AUTH_\d+/),
      }),
    })
  );
};

export const expectSuccessResponse = (response: any, data?: any) => {
  expect(response.status).toHaveBeenCalledWith(200);
  expect(response.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
      data: data || expect.anything(),
    })
  );
};

export const generateObjectId = () => new Types.ObjectId();

export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  expire: jest.fn(),
  setex: jest.fn(),
  flushall: jest.fn(),
};

export const mockAzureService = {
  analyzeDocument: jest.fn(),
  processImage: jest.fn(),
  extractText: jest.fn(),
  recognizeForm: jest.fn(),
};