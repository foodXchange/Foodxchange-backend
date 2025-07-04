const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');

// Placeholder controllers - we'll implement these next
const getRequests = async (req, res) => {
  res.json({ message: 'Get all requests' });
};

const createRequest = async (req, res) => {
  res.json({ message: 'Create request' });
};

const getRequestById = async (req, res) => {
  res.json({ message: 'Get request by ID' });
};

const updateRequest = async (req, res) => {
  res.json({ message: 'Update request' });
};

const deleteRequest = async (req, res) => {
  res.json({ message: 'Delete request' });
};

// Routes
router.route('/')
  .get(protect, getRequests)
  .post(protect, createRequest);

router.route('/:id')
  .get(protect, getRequestById)
  .put(protect, updateRequest)
  .delete(protect, admin, deleteRequest);

module.exports = router;
