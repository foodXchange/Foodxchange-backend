const router = require("express").Router();
const { auth, authorize } = require("../middleware/auth");

// GET all companies
router.get("/", auth, async (req, res) => {
  try {
    // Add logic here
    res.json({ message: "Companies endpoint" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
