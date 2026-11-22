const router = require('express').Router();
const c = require('../controllers/patientController');
const h = require('../middleware/asyncHandler');

router.route('/').get(h(c.list)).post(h(c.create));
router.route('/:id').get(h(c.get)).put(h(c.replace)).patch(h(c.patch)).delete(h(c.remove));

module.exports = router;
