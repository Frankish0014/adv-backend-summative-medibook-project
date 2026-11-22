const router = require('express').Router();
const c = require('../controllers/appointmentController');
const h = require('../middleware/asyncHandler');

router.post('/', h(c.book));                // book
router.get('/:id', h(c.get));
router.delete('/:id', h(c.cancel));         // cancel (+ refund in the response)

module.exports = router;
