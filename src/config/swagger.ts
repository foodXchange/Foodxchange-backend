import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';
import path from 'path';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'FoodXchange API',
    version: '1.0.0',
    description: 'B2B Food Marketplace API - Comprehensive documentation for the FoodXchange platform',
    contact: {
      name: 'FoodXchange Team',
      email: 'support@foodxchange.com',
    },
    license: {
      name: 'ISC',
      url: 'https://opensource.org/licenses/ISC',
    },
  },
  servers: [
    {
      url: process.env.BASE_URL || 'http://localhost:5000',
      description: 'Development server',
    },
    {
      url: 'https://api.foodxchange.com',
      description: 'Production server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false,
          },
          error: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                example: 'AUTH_001',
              },
              message: {
                type: 'string',
                example: 'Authentication failed',
              },
              details: {
                type: 'object',
                additionalProperties: true,
              },
            },
          },
          requestId: {
            type: 'string',
            example: '123e4567-e89b-12d3-a456-426614174000',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            example: '2024-01-01T12:00:00Z',
          },
        },
      },
      ValidationError: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false,
          },
          error: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                example: 'VAL_001',
              },
              message: {
                type: 'string',
                example: 'Validation failed',
              },
              validationErrors: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    field: {
                      type: 'string',
                      example: 'email',
                    },
                    message: {
                      type: 'string',
                      example: 'Invalid email format',
                    },
                    value: {
                      type: 'string',
                      example: 'invalid-email',
                    },
                  },
                },
              },
            },
          },
        },
      },
      SuccessResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          data: {
            type: 'object',
            additionalProperties: true,
          },
          meta: {
            type: 'object',
            properties: {
              version: {
                type: 'string',
                example: '1.0',
              },
              timestamp: {
                type: 'string',
                format: 'date-time',
                example: '2024-01-01T12:00:00Z',
              },
              requestId: {
                type: 'string',
                example: '123e4567-e89b-12d3-a456-426614174000',
              },
            },
          },
        },
      },
      PaginatedResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          data: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
            },
          },
          pagination: {
            type: 'object',
            properties: {
              page: {
                type: 'integer',
                example: 1,
              },
              limit: {
                type: 'integer',
                example: 20,
              },
              total: {
                type: 'integer',
                example: 100,
              },
              totalPages: {
                type: 'integer',
                example: 5,
              },
              hasNext: {
                type: 'boolean',
                example: true,
              },
              hasPrev: {
                type: 'boolean',
                example: false,
              },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          _id: {
            type: 'string',
            example: '64f8b5a2e4b0c6d8f9a1b2c3',
          },
          email: {
            type: 'string',
            format: 'email',
            example: 'user@example.com',
          },
          firstName: {
            type: 'string',
            example: 'John',
          },
          lastName: {
            type: 'string',
            example: 'Doe',
          },
          role: {
            type: 'string',
            enum: ['buyer', 'seller', 'admin', 'contractor', 'agent'],
            example: 'buyer',
          },
          accountStatus: {
            type: 'string',
            enum: ['active', 'inactive', 'pending', 'suspended'],
            example: 'active',
          },
          isEmailVerified: {
            type: 'boolean',
            example: true,
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            example: '2024-01-01T12:00:00Z',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            example: '2024-01-01T12:00:00Z',
          },
        },
      },
      Product: {
        type: 'object',
        properties: {
          _id: {
            type: 'string',
            example: '64f8b5a2e4b0c6d8f9a1b2c3',
          },
          name: {
            type: 'string',
            example: 'Organic Apples',
          },
          category: {
            type: 'string',
            example: 'Fresh Produce',
          },
          description: {
            type: 'string',
            example: 'Fresh organic apples from local farms',
          },
          price: {
            type: 'number',
            example: 2.99,
          },
          unit: {
            type: 'string',
            example: 'per lb',
          },
          availability: {
            type: 'object',
            properties: {
              inStock: {
                type: 'boolean',
                example: true,
              },
              quantity: {
                type: 'number',
                example: 1000,
              },
              minOrderQuantity: {
                type: 'number',
                example: 10,
              },
            },
          },
          seller: {
            type: 'string',
            example: '64f8b5a2e4b0c6d8f9a1b2c3',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            example: '2024-01-01T12:00:00Z',
          },
        },
      },
      Order: {
        type: 'object',
        properties: {
          _id: {
            type: 'string',
            example: '64f8b5a2e4b0c6d8f9a1b2c3',
          },
          orderNumber: {
            type: 'string',
            example: 'ORD-2024-001',
          },
          buyer: {
            type: 'string',
            example: '64f8b5a2e4b0c6d8f9a1b2c3',
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product: {
                  type: 'string',
                  example: '64f8b5a2e4b0c6d8f9a1b2c3',
                },
                quantity: {
                  type: 'number',
                  example: 50,
                },
                price: {
                  type: 'number',
                  example: 2.99,
                },
                total: {
                  type: 'number',
                  example: 149.50,
                },
              },
            },
          },
          status: {
            type: 'string',
            enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
            example: 'pending',
          },
          totalAmount: {
            type: 'number',
            example: 149.50,
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            example: '2024-01-01T12:00:00Z',
          },
        },
      },
    },
  },
  security: [
    {
      bearerAuth: [],
    },
  ],
  tags: [
    {
      name: 'Authentication',
      description: 'User authentication and authorization',
    },
    {
      name: 'Users',
      description: 'User management',
    },
    {
      name: 'Products',
      description: 'Product catalog management',
    },
    {
      name: 'Orders',
      description: 'Order management',
    },
    {
      name: 'RFQ',
      description: 'Request for Quote management',
    },
    {
      name: 'Compliance',
      description: 'Compliance and certification management',
    },
    {
      name: 'Recommendations',
      description: 'AI-powered recommendations',
    },
    {
      name: 'Agent',
      description: 'Agent management and operations',
    },
    {
      name: 'Health',
      description: 'Health check and monitoring',
    },
  ],
};

const options = {
  definition: swaggerDefinition,
  apis: [
    path.join(__dirname, '../routes/*.ts'),
    path.join(__dirname, '../api/routes/*.ts'),
    path.join(__dirname, '../controllers/*.ts'),
    path.join(__dirname, '../models/*.ts'),
  ],
};

const specs = swaggerJSDoc(options);

export const setupSwagger = (app: Express): void => {
  // Serve Swagger UI at /api-docs
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'FoodXchange API Documentation',
    swaggerOptions: {
      filter: true,
      showRequestHeaders: true,
      showCommonExtensions: true,
      displayOperationId: true,
    },
  }));

  // Serve JSON spec at /api-docs.json
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
};

export default specs;