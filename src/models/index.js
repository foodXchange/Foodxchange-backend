
const User = require('./User');
const Project = require('./Project');
const Proposal = require('./Proposal');
const Notification = require('./notification');
const Product = require('./Product'); // ADD THIS LINE
const database = require('./db');
const elasticsearch = require('./elasticsearch');
const redis = require('./redis');
module.exports = {
  User,
  Project,
  Proposal,
  Notification,
  Product 

