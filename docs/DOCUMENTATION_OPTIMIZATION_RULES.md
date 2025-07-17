# Documentation Optimization Rules & Standards

## 🎯 Documentation Quality Standards

### **Coverage Requirements**
- **API Endpoints**: 100% coverage of implemented routes
- **Database Models**: All fields, relationships, and constraints documented
- **Business Logic**: Complete workflow documentation for core processes
- **Error Handling**: All error codes and recovery procedures documented
- **Code Examples**: Real, working examples from actual codebase

### **Quality Metrics**
- **Response Time**: <2 seconds to find any information
- **Completeness**: <5% implementation gaps
- **Accuracy**: Zero discrepancies between docs and code
- **Freshness**: <7 days between code changes and doc updates

## 🔄 Automated Documentation Rules

### **1. API Documentation Automation**

#### Code-First Documentation
```typescript
// Auto-generate API docs from route definitions
// Rule: Every route must have JSDoc comments

/**
 * @swagger
 * /api/rfq:
 *   post:
 *     summary: Create new RFQ
 *     tags: [RFQ]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateRFQDto'
 *     responses:
 *       201:
 *         description: RFQ created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RFQResponse'
 */
router.post('/rfq', authenticate, createRFQ);
```

#### Automated Validation Rules
```yaml
# .github/workflows/docs-validation.yml
name: Documentation Validation
on: [push, pull_request]

jobs:
  validate-docs:
    runs-on: ubuntu-latest
    steps:
      - name: Check API Documentation Coverage
        run: |
          # Ensure all routes have documentation
          npm run docs:validate-api-coverage
          
      - name: Validate Code Examples
        run: |
          # Test all code examples in documentation
          npm run docs:test-examples
          
      - name: Check Documentation Freshness
        run: |
          # Flag documentation older than 7 days from code changes
          npm run docs:check-freshness
```

### **2. Database Schema Documentation Automation**

#### Auto-generated Schema Docs
```typescript
// Rule: All Mongoose models must include schema documentation
const rfqSchema = new mongoose.Schema({
  /**
   * @description Unique RFQ identifier
   * @example "RFQ-123456"
   * @pattern ^RFQ-\d{6}$
   */
  rfqNumber: { 
    type: String, 
    required: true, 
    unique: true,
    match: /^RFQ-\d{6}$/
  },
  
  /**
   * @description RFQ title for quick identification
   * @example "Premium Organic Apples - 1000kg"
   * @minLength 10
   * @maxLength 100
   */
  title: { 
    type: String, 
    required: true,
    minlength: 10,
    maxlength: 100
  }
}, {
  // Auto-generate documentation from schema
  toJSON: { virtuals: true },
  id: false
});

// Generate documentation
rfqSchema.plugin(require('mongoose-schema-docs'));
```

### **3. Business Logic Documentation Rules**

#### Workflow Documentation Standards
```markdown
## Workflow Documentation Template

### Process: [Name]
**Trigger**: What initiates this process
**Actors**: Who is involved (roles/systems)
**Prerequisites**: Required conditions
**Success Criteria**: What defines success
**Failure Scenarios**: What can go wrong and how to handle

### Implementation Details
- **API Endpoints**: List all endpoints involved
- **Database Changes**: What data is created/modified
- **External Services**: What external calls are made
- **Notifications**: What notifications are sent

### Code Examples
[Include actual working code from the implementation]

### Testing
[Include test cases that validate this workflow]
```

## 📊 Documentation Quality Metrics

### **Automated Quality Checks**

#### 1. Coverage Metrics
```javascript
// scripts/docs-coverage.js
const coverage = {
  apiEndpoints: calculateAPIDocsCoverage(),
  databaseModels: calculateModelDocsCoverage(),
  businessLogic: calculateWorkflowDocsCoverage(),
  errorCodes: calculateErrorDocsCoverage()
};

// Minimum thresholds
const thresholds = {
  apiEndpoints: 95,
  databaseModels: 90,
  businessLogic: 85,
  errorCodes: 100
};

// Fail build if coverage below thresholds
```

#### 2. Freshness Checks
```javascript
// Check if documentation is outdated
const checkDocumentationFreshness = () => {
  const codeChanges = getGitChanges('src/', 7); // Last 7 days
  const docChanges = getGitChanges('docs/', 7);
  
  if (codeChanges.length > 0 && docChanges.length === 0) {
    throw new Error('Code changes detected without documentation updates');
  }
};
```

#### 3. Link Validation
```javascript
// Validate all internal and external links
const validateDocumentationLinks = async () => {
  const allLinks = extractLinksFromDocs();
  const brokenLinks = await checkLinkHealth(allLinks);
  
  if (brokenLinks.length > 0) {
    console.error('Broken links found:', brokenLinks);
    process.exit(1);
  }
};
```

## 🔧 Implementation Guidelines

### **1. Documentation-Driven Development (DDD)**

#### Rule: Document First, Code Second
```markdown
1. **Design Phase**: Create API documentation first
2. **Review Phase**: Validate documentation with stakeholders
3. **Implementation Phase**: Code to match documentation
4. **Testing Phase**: Validate implementation matches docs
5. **Deployment Phase**: Update docs with any changes
```

#### API-First Approach
```yaml
# openapi.yml - Single source of truth
openapi: 3.0.0
info:
  title: FoodXchange API
  version: 1.0.0
  
paths:
  /api/rfq:
    post:
      operationId: createRFQ
      summary: Create Request for Quote
      # Implementation must match this specification
```

### **2. Real-time Documentation Updates**

#### Git Hooks for Documentation
```bash
#!/bin/sh
# .git/hooks/pre-commit
# Automatically update documentation on code changes

# Check if API routes changed
if git diff --cached --name-only | grep -q "src/.*routes.*\.ts$"; then
  echo "API routes changed - updating documentation..."
  npm run docs:generate-api
  git add docs/api/
fi

# Check if models changed
if git diff --cached --name-only | grep -q "src/models/.*\.ts$"; then
  echo "Database models changed - updating schema docs..."
  npm run docs:generate-schema
  git add docs/architecture/database-schema.md
fi
```

#### Automated Documentation Generation
```javascript
// scripts/generate-docs.js
const generateAPIDocs = () => {
  // Extract routes from Express app
  const routes = extractRoutesFromApp();
  
  // Generate markdown documentation
  const docs = routes.map(route => ({
    method: route.method,
    path: route.path,
    description: extractJSDocDescription(route.handler),
    examples: extractCodeExamples(route.handler),
    responses: extractResponseSchemas(route.handler)
  }));
  
  writeFileSync('docs/api/generated.md', generateMarkdown(docs));
};
```

## 🎨 Documentation Standards

### **1. Code Example Standards**

#### All Examples Must Be:
- **Executable**: Copy-paste and run without modification
- **Current**: Based on latest codebase implementation
- **Complete**: Include all necessary imports and setup
- **Tested**: Verified through automated testing

#### Example Template:
```typescript
// ✅ Good Example
/**
 * Create a new RFQ with compliance validation
 * 
 * Prerequisites:
 * - User must be authenticated
 * - User must have 'buyer' role
 * - Company must be verified
 */

// Import required modules
import { createRFQ } from '../controllers/rfqController';
import { authenticate, requireRole } from '../middleware/auth';

// Complete working example
const rfqData = {
  title: "Premium Organic Apples - 1000kg",
  description: "High-quality organic apples for juice production",
  category: "64f5a8b9c123456789abcdef",
  requirements: {
    quantity: 1000,
    unit: "kg",
    deliveryDate: "2024-02-15T00:00:00Z",
    certifications: ["USDA Organic", "Non-GMO"]
  }
};

// API call with authentication
const response = await fetch('/api/rfq', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(rfqData)
});

const result = await response.json();
console.log('RFQ created:', result.data.rfqNumber);
```

### **2. Error Documentation Standards**

#### Complete Error Reference
```typescript
// Every error must be documented with:
interface ErrorDocumentation {
  code: string;           // Unique error code
  httpStatus: number;     // HTTP status code
  message: string;        // User-friendly message
  cause: string;          // Technical cause
  resolution: string;     // How to fix
  prevention: string;     // How to prevent
  example: object;        // Complete error response
  relatedErrors: string[]; // Related error codes
}

// Example error documentation
const RFQ_VALIDATION_ERROR = {
  code: 'RFQ_INVALID_DELIVERY_DATE',
  httpStatus: 400,
  message: 'Delivery date must be at least 7 days in the future',
  cause: 'Provided delivery date is too soon for supplier preparation',
  resolution: 'Provide a delivery date at least 7 days from now',
  prevention: 'Validate dates on frontend before submission',
  example: {
    success: false,
    error: {
      code: 'RFQ_INVALID_DELIVERY_DATE',
      message: 'Delivery date must be at least 7 days in the future',
      field: 'requirements.deliveryDate',
      provided: '2024-01-16T00:00:00Z',
      minimum: '2024-01-23T00:00:00Z'
    }
  },
  relatedErrors: ['RFQ_VALIDATION_ERROR', 'DATE_FORMAT_ERROR']
};
```

## 🚀 Automation Tools

### **1. Documentation Build Pipeline**

```yaml
# .github/workflows/docs-build.yml
name: Documentation Build and Deploy

on:
  push:
    branches: [main, develop]
    paths: ['src/**', 'docs/**']

jobs:
  build-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Generate API Documentation
        run: |
          npm install
          npm run docs:generate-api
          npm run docs:generate-schema
          npm run docs:validate
          
      - name: Build Documentation Site
        run: |
          npm run docs:build
          
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs-dist
```

### **2. Documentation Testing**

```javascript
// tests/docs.test.js
describe('Documentation Tests', () => {
  test('All API endpoints are documented', async () => {
    const routes = await getAPIRoutes();
    const docs = await getAPIDocs();
    
    routes.forEach(route => {
      expect(docs).toHaveProperty(`${route.method} ${route.path}`);
    });
  });
  
  test('All code examples are executable', async () => {
    const examples = await extractCodeExamples();
    
    for (const example of examples) {
      await expect(executeCodeExample(example)).resolves.not.toThrow();
    }
  });
  
  test('All links are valid', async () => {
    const links = await extractAllLinks();
    
    for (const link of links) {
      if (link.startsWith('http')) {
        await expect(fetch(link)).resolves.toHaveProperty('ok', true);
      } else {
        expect(fs.existsSync(link)).toBe(true);
      }
    }
  });
});
```

## 📈 Success Metrics

### **Key Performance Indicators (KPIs)**

1. **Developer Onboarding Time**: <30 minutes to first API call
2. **Documentation Coverage**: >95% of implemented features
3. **Information Retrieval Time**: <2 seconds to find any information
4. **Documentation Freshness**: <24 hours lag behind code changes
5. **Error Resolution Time**: <5 minutes with troubleshooting guides

### **Quality Gates**

```javascript
// Quality gates that must pass before deployment
const qualityGates = {
  documentationCoverage: {
    threshold: 95,
    current: () => calculateDocumentationCoverage()
  },
  
  linkValidation: {
    threshold: 0,
    current: () => countBrokenLinks()
  },
  
  exampleExecution: {
    threshold: 100,
    current: () => testAllCodeExamples()
  },
  
  freshnessScore: {
    threshold: 90,
    current: () => calculateFreshnessScore()
  }
};
```

## 🔮 Future Enhancements

### **1. AI-Powered Documentation**
- Auto-generate documentation from code comments
- Intelligent documentation suggestions
- Automated translation for international teams

### **2. Interactive Documentation**
- Live API testing within documentation
- Interactive code examples
- Real-time error simulation

### **3. Documentation Analytics**
- Track most-accessed documentation sections
- Identify knowledge gaps
- Optimize based on user behavior

These optimization rules ensure that FoodXchange documentation remains accurate, comprehensive, and valuable for all stakeholders while minimizing maintenance overhead through automation.