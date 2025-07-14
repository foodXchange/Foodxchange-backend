#!/bin/bash

# API Test Script for FoodXchange Backend
# Run with: bash test-api.sh

API_BASE="http://localhost:5000/api"
TOKEN=""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}FoodXchange API Test Suite${NC}"
echo "=========================="
echo "API Base: $API_BASE"
echo ""

# Test health endpoint
echo -e "${BLUE}1. Testing Health Endpoint${NC}"
curl -s "$API_BASE/health" | jq '.' || echo "Health check failed"
echo ""

# Test authentication
echo -e "${BLUE}2. Testing Authentication${NC}"
echo "Testing registration..."
REGISTER_RESPONSE=$(curl -s -X POST "$API_BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User",
    "company": "Test Corp",
    "role": "buyer"
  }')
echo "$REGISTER_RESPONSE" | jq '.' || echo "$REGISTER_RESPONSE"
echo ""

echo "Testing login..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }')
echo "$LOGIN_RESPONSE" | jq '.' || echo "$LOGIN_RESPONSE"

# Extract token if available
TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.token' 2>/dev/null || echo "")
if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  echo -e "${GREEN}✓ Got auth token${NC}"
else
  echo -e "${YELLOW}⚠ No auth token received${NC}"
fi
echo ""

# Test products
echo -e "${BLUE}3. Testing Products${NC}"
echo "GET /products"
curl -s "$API_BASE/products" | jq '.' || echo "Failed"
echo ""

echo "GET /products/categories"
curl -s "$API_BASE/products/categories" | jq '.' || echo "Failed"
echo ""

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  echo "POST /products (with auth)"
  curl -s -X POST "$API_BASE/products" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{
      "name": "Test Product",
      "price": 100,
      "category": "Vegetables",
      "unit": "kg"
    }' | jq '.' || echo "Failed"
fi
echo ""

# Test RFQs
echo -e "${BLUE}4. Testing RFQs${NC}"
echo "GET /rfq"
curl -s "$API_BASE/rfq" | jq '.' || echo "Failed"
echo ""

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  echo "POST /rfq (with auth)"
  curl -s -X POST "$API_BASE/rfq" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{
      "title": "Need 100kg Tomatoes",
      "category": "Vegetables",
      "quantity": 100,
      "unit": "kg"
    }' | jq '.' || echo "Failed"
fi
echo ""

# Test Orders
echo -e "${BLUE}5. Testing Orders${NC}"
if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  echo "GET /orders (with auth)"
  curl -s "$API_BASE/orders" \
    -H "Authorization: Bearer $TOKEN" | jq '.' || echo "Failed"
  
  echo ""
  echo "GET /orders/analytics (with auth)"
  curl -s "$API_BASE/orders/analytics?period=30d" \
    -H "Authorization: Bearer $TOKEN" | jq '.' || echo "Failed"
else
  echo -e "${YELLOW}Skipping order tests (no auth token)${NC}"
fi
echo ""

# Test AI endpoints
echo -e "${BLUE}6. Testing AI Endpoints${NC}"
if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  echo "POST /ai/analyze-product-image"
  curl -s -X POST "$API_BASE/ai/analyze-product-image" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{
      "imageUrl": "https://example.com/product.jpg",
      "productType": "vegetable"
    }' | jq '.' || echo "Failed"
  
  echo ""
  echo "POST /ai/pricing-suggestion"
  curl -s -X POST "$API_BASE/ai/pricing-suggestion" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{
      "productName": "Tomatoes",
      "category": "Vegetables",
      "quantity": 100
    }' | jq '.' || echo "Failed"
else
  echo -e "${YELLOW}Skipping AI tests (no auth token)${NC}"
fi
echo ""

# Test other endpoints
echo -e "${BLUE}7. Testing Other Endpoints${NC}"
echo "GET /suppliers"
curl -s "$API_BASE/suppliers" | jq '.' || echo "Failed"
echo ""

echo "POST /compliance/check"
curl -s -X POST "$API_BASE/compliance/check" \
  -H "Content-Type: application/json" \
  -d '{"test": true}' | jq '.' || echo "Failed"
echo ""

echo -e "${GREEN}✅ Test suite completed!${NC}"
echo ""
echo "Summary:"
echo "- Health endpoint: Check the response above"
echo "- Auth endpoints: Check if registration/login work"
echo "- Product endpoints: Should list products"
echo "- RFQ endpoints: Should list RFQs"
echo "- Order endpoints: Requires authentication"
echo "- AI endpoints: Requires authentication and Azure setup"