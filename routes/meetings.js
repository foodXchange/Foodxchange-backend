const express = require('express');
const router = express.Router();
const Meeting = require('../models/meetings/MeetingModel');
const authMiddleware = require('../middleware/auth');
const { sendMeetingInvite, sendMeetingReminder } = require('../services/emailService');

// Get user meetings
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, type, startDate, endDate } = req.query;
    
    const query = {
      $or: [
        { organizer: req.user._id },
        { 'participants.user': req.user._id }
      ]
    };
    
    if (status) query.status = status;
    if (type) query.type = type;
    if (startDate || endDate) {
      query.scheduledAt = {};
      if (startDate) query.scheduledAt.$gte = new Date(startDate);
      if (endDate) query.scheduledAt.$lte = new Date(endDate);
    }
    
    const meetings = await Meeting.find(query)
      .populate('organizer', 'name email company')
      .populate('participants.user', 'name email company')
      .populate('products', 'name category')
      .sort({ scheduledAt: -1 });
    
    res.json(meetings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Schedule a new meeting
router.post('/', authMiddleware, async (req, res) => {
  try {
    const meeting = new Meeting({
      organizer: req.user._id,
      ...req.body,
      meetingUrl: generateMeetingUrl() // Generate unique meeting URL
    });
    
    await meeting.save();
    
    // Send invitations to participants
    for (const participant of meeting.participants) {
      await sendMeetingInvite(participant.user, meeting);
    }
    
    res.status(201).json(meeting);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update meeting
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }
    
    if (meeting.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    Object.assign(meeting, req.body);
    await meeting.save();
    
    res.json(meeting);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add meeting notes
router.post('/:id/notes', authMiddleware, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }
    
    meeting.notes.push({
      author: req.user._id,
      content: req.body.content
    });
    
    await meeting.save();
    res.json(meeting);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Submit meeting outcome
router.post('/:id/outcome', authMiddleware, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }
    
    meeting.outcome = req.body;
    meeting.status = 'completed';
    await meeting.save();
    
    res.json(meeting);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get available time slots
router.get('/slots', authMiddleware, async (req, res) => {
  try {
    const { date, duration = 30 } = req.query;
    const targetDate = new Date(date);
    
    // Get all meetings for the day
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
    
    const existingMeetings = await Meeting.find({
      scheduledAt: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: 'cancelled' }
    });
    
    // Generate available slots (simplified logic)
    const slots = [];
    const workStart = 9; // 9 AM
    const workEnd = 17; // 5 PM
    
    for (let hour = workStart; hour < workEnd; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const slotTime = new Date(targetDate);
        slotTime.setHours(hour, minute, 0, 0);
        
        // Check if slot is available
        const isAvailable = !existingMeetings.some(meeting => {
          const meetingEnd = new Date(meeting.scheduledAt.getTime() + meeting.duration * 60000);
          return slotTime >= meeting.scheduledAt && slotTime < meetingEnd;
        });
        
        if (isAvailable) {
          slots.push({
            time: slotTime,
            available: true
          });
        }
      }
    }
    
    res.json(slots);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

function generateMeetingUrl() {
  return `https://meet.foodxchange.com/${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = router;
