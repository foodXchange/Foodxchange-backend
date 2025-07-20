// Models Index - Central export for all models
const AnalyticsEvent = require('./AnalyticsEvent');
const Category = require('./Category');
const Company = require('./Company');
const { Conversation, Message } = require('./Conversation');
const Notification = require('./Notification');
const Order = require('./Order');
const Product = require('./Product');
const Review = require('./Review');
const RFQ = require('./RFQ');
const User = require('./User');

module.exports = {
  User,
  Company,
  Product,
  Category,
  RFQ,
  Order,
  Review,
  Conversation,
  Message,
  AnalyticsEvent,
  Notification
};
