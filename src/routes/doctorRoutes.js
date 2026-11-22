const router = require('express').Router();
const c = require('../controllers/doctorController');
const h = require('../middleware/asyncHandler');

router.route('/').get(h(c.list)).post(h(c.create));
router.get('/:id/statistics', h(c.statistics));
router.route('/:id').get(h(c.get)).put(h(c.replace)).patch(h(c.patch)).delete(h(c.remove));

module.exports = router;
