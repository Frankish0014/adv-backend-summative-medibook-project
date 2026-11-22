const router = require('express').Router();
const c = require('../controllers/reportController');
const h = require('../middleware/asyncHandler');

router.get('/doctors', h(c.doctors));
router.get('/busy-days', h(c.busyDays));

module.exports = router;
