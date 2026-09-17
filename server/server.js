'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { ensureDirectories } = require('./services/storageService');
const { verifyFfmpegAvailable, missingFfmpegMessage } = require('./services/renderService');
const clipsRouter = require('./routes/clips');

ensureDirectories();
verifyFfmpegAvailable().catch(() => console.warn(missingFfmpegMessage));
const app = express();
app.use(cors());
app.use(express.json({ limit: '32kb' }));
app.use('/output', express.static(path.join(__dirname, '..', 'output'), { fallthrough: false }));
app.use('/api/clips', clipsRouter);
app.use((request, response, next) => {
  if (request.path.endsWith('.html') || request.path.endsWith('.js')) response.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});
app.use(express.static(path.join(__dirname, '..')));
app.use((error, _request, response, _next) => {
  if (!error.expose) console.error(error);
  response.status(error.status || 500).json({ error: error.expose ? error.message : 'Something went wrong while processing this request.' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Clipy is running at http://localhost:${port}`));
