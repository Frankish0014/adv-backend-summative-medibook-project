const router = require('express').Router();
const c = require('../controllers/appointmentController');
const h = require('../middleware/asyncHandler');

router.post('/', h(c.joinWaitlist));

module.exports = router;
