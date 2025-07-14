# FoodXchange Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Prerequisites
- Node.js 18+ installed
- MongoDB running locally or MongoDB Atlas account
- Git installed

### Backend Setup (Current Directory)

1. **Clone and Install**
```bash
# You're already in the backend directory
npm install
```

2. **Configure Environment**
```bash
# Copy example environment file
copy .env.example .env

# Edit .env with your settings (especially MongoDB URI)
notepad .env
```

3. **Start Backend Server**
```bash
npm run dev
```

Backend will be available at: http://localhost:5000

### Frontend Setup (New Terminal)

1. **Open New Terminal**
```bash
# Navigate to frontend
cd C:\Users\foodz\Documents\GitHub\Development\FDX-frontend
```

2. **Install Dependencies**
```bash
npm install
```

3. **Configure Frontend Environment**
```bash
# Create .env file
echo VITE_API_URL=http://localhost:5000/api > .env
```

4. **Start Frontend Server**
```bash
npm run dev
```

Frontend will be available at: http://localhost:5173

## 🔗 Architecture Overview

```
FoodXchange System
├── Backend (Port 5000)
│   ├── Express + TypeScript
│   ├── MongoDB Database
│   ├── JWT Authentication
│   └── Azure AI Services
│
├── Frontend (Port 5173)
│   ├── React + TypeScript
│   ├── Vite Build Tool
│   ├── Tailwind CSS
│   └── API Client
│
└── Shared
    ├── TypeScript Types
    ├── API Contracts
    └── Utilities
```

## 📁 Project Structure

### Backend Key Directories
- `/src` - TypeScript source files
- `/controllers` - Request handlers
- `/models` - Database schemas
- `/routes` - API endpoints
- `/services` - Business logic
- `/middleware` - Express middleware
- `/shared` - Shared types with frontend

### Key Files Created
1. **ARCHITECTURE.md** - System design documentation
2. **FRONTEND_BACKEND_SYNC.md** - Integration guide
3. **shared/types/index.ts** - Shared TypeScript interfaces
4. **shared/api-client.ts** - Frontend API client template
5. **config/cors.config.ts** - CORS configuration
6. **.env.example** - Environment variables template

## 🔧 Available Scripts

### Backend Scripts
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Start production server
- `npm run test` - Run tests
- `npm run lint` - Lint code

### Common Tasks

#### Add New API Endpoint
1. Define types in `shared/types/index.ts`
2. Create route in `/routes`
3. Add controller in `/controllers`
4. Update API client in frontend

#### Test API
```bash
# Health check
curl http://localhost:5000/api/health

# With authentication
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/products
```

## 🛠 Troubleshooting

### Backend Issues

**MongoDB Connection Failed**
```bash
# Check if MongoDB is running
# For local MongoDB:
mongod --version

# Update MONGODB_URI in .env
```

**Port Already in Use**
```bash
# Change PORT in .env
PORT=5001
```

**TypeScript Errors**
```bash
# Check for type errors
npm run typecheck

# Fix common issues
npm run lint:fix
```

### Frontend Connection Issues

**CORS Errors**
- Ensure backend is running
- Check FRONTEND_URL in backend .env
- Verify VITE_API_URL in frontend .env

**Authentication Failed**
- Check JWT_SECRET is set in backend
- Ensure token is stored in localStorage
- Verify token expiration

## 📊 API Testing

### Using Thunder Client (VS Code)
1. Install Thunder Client extension
2. Import collection from `/docs/thunder-client-collection.json`
3. Set environment variables

### Using Postman
1. Import collection from `/docs/postman-collection.json`
2. Set up environment with:
   - `base_url`: http://localhost:5000
   - `token`: Your JWT token

## 🔐 Default Credentials

**Demo Account**
- Email: demo@foodxchange.com
- Password: demo123

**Admin Account**
- Email: admin@foodxchange.com
- Password: admin123

## 📝 Next Steps

1. **Explore API Endpoints**
   - Check `ARCHITECTURE.md` for full API documentation
   - Test endpoints using Thunder Client/Postman

2. **Implement Features**
   - Start with authentication flow
   - Add product management
   - Implement RFQ system

3. **Set Up AI Services**
   - Configure Azure credentials in .env
   - Test AI matching endpoints

4. **Deploy to Production**
   - Set up MongoDB Atlas
   - Configure production environment
   - Deploy to Azure/AWS/Heroku

## 🆘 Need Help?

1. Check existing documentation:
   - ARCHITECTURE.md
   - FRONTEND_BACKEND_SYNC.md
   - API endpoint list in routes

2. Common commands:
   ```bash
   # Check backend logs
   npm run dev
   
   # Run TypeScript compiler
   npm run build
   
   # Check for issues
   npm run lint
   ```

3. Debug tips:
   - Check browser console for frontend errors
   - Check terminal for backend errors
   - Verify .env configuration
   - Ensure all services are running

## 🎯 Quick Test

1. **Backend Health Check**
   ```bash
   curl http://localhost:5000/api/health
   ```

2. **Frontend-Backend Connection**
   - Open http://localhost:5173
   - Click "Test Backend API"
   - Should see successful response

Ready to build! 🚀