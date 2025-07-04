// Models Index - Central export for all models
const User = require('./User');
const Company = require('./Company');
const Product = require('./Product');
const Category = require('./Category');
const RFQ = require('./RFQ');
const Order = require('./Order');
const Review = require('./Review');
const { Conversation, Message } = require('./Conversation');
const AnalyticsEvent = require('./AnalyticsEvent');
const Notification = require('./Notification');

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
