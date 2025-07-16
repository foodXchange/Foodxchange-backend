# FoodXchange Backend Codex Context

Node.js + Express backend for FoodXchange B2B food sourcing platform.

## Tech Stack
- Node.js + Express
- JSON Web Token (JWT) Auth
- WebSocket for real-time collaboration (planned)
- GitHub Actions CI/CD
- MongoDB or similar (assumed)

## Key APIs
- `/auth` - Authentication
- `/rfqs` - Request for Quotation logic
- `/products`, `/orders`, `/suppliers` - Core commerce APIs
- `/compliance`, `/logistics`, `/validation` - Safety, shipping, error checking

## Folder Structure
- `src/models/` - Data schemas (converted to ES modules)
- `src/routes/` - API endpoints
- `server.ts` or `index.js` - Main entry point
