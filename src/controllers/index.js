// Export all controllers
const authController = require('./authController');
const userController = require('./userController');
const projectController = require('./projectController');
const proposalController = require('./proposalController');
const notificationController = require('./notificationController');
const searchController = require('./searchController');
const analyticsController = require('./analyticsController');
const adminController = require('./adminController');

module.exports = {
  authController,
  userController,
  projectController,
  proposalController,
  notificationController,
  searchController,
  analyticsController,
  adminController
};