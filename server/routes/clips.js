'use strict';

const express = require('express');
const crypto = require('crypto');
const storage = require('../services/storageService');
const { validateRequest, extractVideoId } = require('../services/videoSourceService');
const { processClip } = require('../services/videoService');
const router = express.Router();

router.post('/', (request, response, next) => {
  try {
    const input = validateRequest(request.body);
    const clip = storage.createClip({ id: crypto.randomUUID(), ...input, videoId: extractVideoId(input.sourceUrl) });
    response.status(202).json({ clipId: clip.id, status: clip.status });
    setImmediate(() => processClip(clip.id).catch(error => console.error(`Clip ${clip.id} failed`, error)));
  } catch (error) { next(error); }
});

router.get('/', (_request, response) => response.json(storage.listClips()));
router.get('/:id/status', (request, response) => {
  const clip = storage.getClip(request.params.id);
  if (!clip) return response.status(404).json({ error: 'Clip not found.' });
  response.json({ status: clip.status, progress: clip.progress, step: clip.step, error: clip.error || undefined });
});
router.get('/:id', (request, response) => {
  const clip = storage.getClip(request.params.id);
  if (!clip) return response.status(404).json({ error: 'Clip not found.' });
  response.json(storage.publicClip(clip));
});
router.patch('/:id', (request, response, next) => {
  try {
    const clip = storage.getClip(request.params.id);
    if (!clip) return response.status(404).json({ error: 'Clip not found.' });
    const updates = validateRequest({ ...clip, ...request.body }, { requireSource: false });
    const updated = storage.updateClip(clip.id, { ...updates, status: 'queued', progress: 0, step: 'Queued for re-render', error: null, videoPath: null });
    response.status(202).json({ clipId: updated.id, status: updated.status });
    setImmediate(() => processClip(updated.id).catch(error => console.error(`Clip ${updated.id} failed`, error)));
  } catch (error) { next(error); }
});

module.exports = router;
