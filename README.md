# FoodXchange Backend API

## Setup Instructions

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create .env file:
   ```bash
   cp .env.example .env
   ```

3. Update .env with your configuration

4. Start MongoDB locally or use MongoDB Atlas

5. Run the server:
   ```bash
   npm run dev
   ```

## API Endpoints

- GET /api/health - Health check
- More endpoints to be added...

## Project Structure

```
backend-project/
├── src/
│   ├── config/         # Configuration files
│   ├── controllers/    # Route controllers
│   ├── middleware/     # Custom middleware
│   ├── models/         # Database models
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   ├── utils/          # Utility functions
│   └── server.js       # Entry point
├── tests/              # Test files
├── docs/               # API documentation
└── scripts/            # Utility scripts
```
