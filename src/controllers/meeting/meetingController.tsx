const Meeting = require('../models/meeting/Meeting');
const User = require('../models/User');
const emailService = require('../services/emailService');
const { v4: uuidv4 } = require('uuid');

exports.scheduleMeeting = async (req, res) => {
  try {
    const { participantIds, type, title, description, scheduledAt, duration, products } = req.body;
    
    // Create meeting
    const meeting = new Meeting({
      organizer: req.user._id,
      participants: participantIds.map(id => ({ user: id })),
      type,
      title,
      description,
      scheduledAt,
      duration,
      products,
      roomId: uuidv4() // Generate unique room ID for video calls
    });

    await meeting.save();
    
    // Send invitations
    const participants = await User.find({ _id: { $in: participantIds } });
    participants.forEach(participant => {
      emailService.sendMeetingInvitation(participant.email, meeting);
    });

    res.status(201).json({
      success: true,
      meeting: await meeting.populate('participants.user organizer products')
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateMeetingStatus = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { status, cancelledReason } = req.body;

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }

    // Only organizer can update
    if (meeting.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    meeting.status = status;
    if (status === 'cancelled') {
      meeting.cancelledReason = cancelledReason;
      
      // Notify participants
      const participants = await User.find({ 
        _id: { $in: meeting.participants.map(p => p.user) } 
      });
      participants.forEach(participant => {
        emailService.sendMeetingCancellation(participant.email, meeting);
      });
    }

    await meeting.save();
    res.json({ success: true, meeting });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.joinMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    const meeting = await Meeting.findById(meetingId).populate('participants.user');
    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }

    // Check if user is participant
    const isParticipant = meeting.participants.some(
      p => p.user._id.toString() === req.user._id.toString()
    );
    
    if (!isParticipant && meeting.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    // Update participant status
    const participantIndex = meeting.participants.findIndex(
      p => p.user._id.toString() === req.user._id.toString()
    );
    
    if (participantIndex !== -1) {
      meeting.participants[participantIndex].status = 'attended';
      meeting.participants[participantIndex].joinedAt = new Date();
    }

    if (meeting.status === 'scheduled') {
      meeting.status = 'in_progress';
    }

    await meeting.save();

    res.json({ 
      success: true, 
      meeting,
      roomId: meeting.roomId,
      joinLink: meeting.joinLink
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.addMeetingNotes = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { content } = req.body;

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }

    meeting.notes.push({
      author: req.user._id,
      content
    });

    await meeting.save();
    res.json({ success: true, meeting });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.completeMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { outcome, actionItems } = req.body;

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({ success: false, error: 'Meeting not found' });
    }

    meeting.status = 'completed';
    meeting.outcome = outcome;
    meeting.actionItems = actionItems;

    // Update participant leave times
    meeting.participants.forEach(p => {
      if (p.status === 'attended' && !p.leftAt) {
        p.leftAt = new Date();
      }
    });

    await meeting.save();

    // Send follow-up emails with action items
    if (actionItems && actionItems.length > 0) {
      const assignedUsers = await User.find({ 
        _id: { $in: actionItems.map(item => item.assignedTo) } 
      });
      
      assignedUsers.forEach(user => {
        const userActionItems = actionItems.filter(
          item => item.assignedTo.toString() === user._id.toString()
        );
        emailService.sendActionItems(user.email, meeting, userActionItems);
      });
    }

    res.json({ success: true, meeting });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getUpcomingMeetings = async (req, res) => {
  try {
    const meetings = await Meeting.find({
      $or: [
        { organizer: req.user._id },
        { 'participants.user': req.user._id }
      ],
      scheduledAt: { $gte: new Date() },
      status: { $in: ['scheduled', 'in_progress'] }
    })
    .populate('organizer participants.user products')
    .sort({ scheduledAt: 1 });

    res.json({ success: true, meetings });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getMeetingHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const meetings = await Meeting.find({
      $or: [
        { organizer: req.user._id },
        { 'participants.user': req.user._id }
      ],
      status: 'completed'
    })
    .populate('organizer participants.user')
    .sort({ scheduledAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const total = await Meeting.countDocuments({
      $or: [
        { organizer: req.user._id },
        { 'participants.user': req.user._id }
      ],
      status: 'completed'
    });

    res.json({
      success: true,
      meetings,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
