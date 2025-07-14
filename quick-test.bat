@echo off
echo FoodXchange API Quick Test
echo ==========================
echo.

echo 1. Health Check:
curl http://localhost:5000/api/health
echo.
echo.

echo 2. Products (GET):
curl http://localhost:5000/api/products
echo.
echo.

echo 3. RFQ (GET):
curl http://localhost:5000/api/rfq
echo.
echo.

echo 4. Orders (GET):
curl http://localhost:5000/api/orders
echo.
echo.

echo 5. Suppliers (GET):
curl http://localhost:5000/api/suppliers
echo.
echo.

echo 6. Registration (POST):
curl -X POST http://localhost:5000/api/auth/register -H "Content-Type: application/json" -d "{\"email\":\"test@test.com\",\"password\":\"test123\"}"
echo.
echo.

echo ==========================
echo NOTE: The server is running with placeholder endpoints.
echo To use the new controllers, restart the server:
echo 1. Press Ctrl+C to stop the current server
echo 2. Run: npm run dev:simple
echo.
pause