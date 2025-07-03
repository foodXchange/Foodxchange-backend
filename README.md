# FoodXchange Backend API

Multi-sided B2B food commerce platform backend with real-time WebSocket support.

## 🚀 Features

- **RESTful API** - Complete food commerce API endpoints
- **Real-time WebSocket** - Live collaboration and updates
- **Compliance System** - Automated regulatory checking
- **Authentication** - JWT-based user authentication
- **Rate Limiting** - API protection and throttling
- **Error Handling** - Comprehensive error management

## 📁 Project Structure

```
Foodxchange-backend/
├── src/
│   ├── api/
│   │   ├── routes/          # API route handlers
│   │   ├── controllers/     # Business logic
│   │   ├── middleware/      # Custom middleware
│   │   └── validators/      # Input validation
│   ├── services/
│   │   ├── auth/           # Authentication service
│   │   ├── compliance/     # Compliance checking
│   │   ├── notifications/  # Notification system
│   │   └── websocket/      # Real-time WebSocket service
│   ├── models/             # Database models
│   ├── config/             # Configuration files
│   ├── utils/              # Utility functions
│   └── app.js              # Express app setup
├── tests/                  # Test files
├── docs/                   # API documentation
├── server.js               # Main server entry point
├── package.json
├── .env.example
└── README.md
```

## 🛠️ Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
4. Update `.env` with your configuration

## 🚀 Usage

### Development Mode
```bash
# Start API server only
npm run dev

# Start WebSocket server only
npm run websocket

# Start both servers
npm run dev:full
```

### Production Mode
```bash
npm start
```

## 📡 WebSocket Events

The WebSocket server supports real-time events:

- `join_rfq` - Join RFQ collaboration room
- `rfq_status_update` - Update RFQ status
- `collaboration_message` - Send chat messages
- `typing_indicator` - Show typing status
- `compliance_check_request` - Request compliance check

## 🔗 API Endpoints

- `GET /api` - API information
- `GET /health` - Health check
- `POST /api/auth/login` - User login
- `GET /api/rfqs` - Get RFQs
- `POST /api/rfqs` - Create RFQ
- `POST /api/compliance/check` - Run compliance check

## 🌐 URLs

- **API Server**: http://localhost:5000
- **WebSocket**: ws://localhost:3001/ws
- **Health Check**: http://localhost:5000/health

## 🧪 Testing

```bash
npm test
npm run test:watch
```

## 📝 License

MIT License - see LICENSE file for details.
