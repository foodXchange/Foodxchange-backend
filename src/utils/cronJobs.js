const cron = require('node-cron');
const Project = require('../models/Project');
const Notification = require('../models/notification');
const emailService = require('../services/email/emailService');
const searchIndexer = require('../search/searchIndexer');

// Run every day at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Running daily tasks...');
  
  // Expire old projects
  await Project.expireOldProjects();
  
  // Notify about expiring projects (3 days before)
  const expiringProjects = await Project.find({
    status: 'active',
    deadline: {
      $gte: new Date(),
      $lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    }
  });
  
  for (const project of expiringProjects) {
    await NotificationService.notifyProjectExpiring(project);
  }
});

module.exports = {};