// File: server.js - Main FoodXchange Server Entry Point
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = require('./src/app');
const WebSocketService = require('./src/services/websocket/websocket-service');

const PORT = process.env.PORT || 5000;
const WS_PORT = process.env.WS_PORT || 3001;

// Start Express server
const server = app.listen(PORT, () => {
  console.log(`🚀 FoodXchange API Server running on port ${PORT}`);
  console.log(`📡 API Base URL: http://localhost:${PORT}/api`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Start WebSocket server
const wsService = new WebSocketService(WS_PORT);
wsService.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ HTTP server closed');
    wsService.stop();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ HTTP server closed');
    wsService.stop();
    process.exit(0);
  });
});

module.exports = { server, wsService };
