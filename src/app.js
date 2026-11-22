const express = require('express');
const routes = require('./routes');
const feedback = require('./controllers/feedbackController');
const h = require('./middleware/asyncHandler');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/feedback', h(feedback.page));
app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
