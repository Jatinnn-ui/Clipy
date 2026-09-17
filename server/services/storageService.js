'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const dataFile = path.join(root, 'uploads', 'clips.json');
const dirs = ['uploads', 'temp', 'output'].map(name => path.join(root, name));

function ensureDirectories() { dirs.forEach(dir => fs.mkdirSync(dir, { recursive: true })); if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, '[]\n'); }
function read() { ensureDirectories(); try { const value = JSON.parse(fs.readFileSync(dataFile, 'utf8')); return Array.isArray(value) ? value : []; } catch { return []; } }
function write(clips) { const temporary = `${dataFile}.${process.pid}.tmp`; fs.writeFileSync(temporary, JSON.stringify(clips, null, 2)); fs.renameSync(temporary, dataFile); }
function createClip(clip) { const clips = read(); clips.unshift({ ...clip, status: 'queued', progress: 0, step: 'Queued', videoPath: null, error: null, createdAt: new Date().toISOString() }); write(clips); return clips[0]; }
function getClip(id) { return read().find(clip => clip.id === id); }
function updateClip(id, changes) { const clips = read(); const index = clips.findIndex(clip => clip.id === id); if (index < 0) return null; clips[index] = { ...clips[index], ...changes, updatedAt: new Date().toISOString() }; write(clips); return clips[index]; }
function listClips() { return read().map(publicClip); }
function publicClip(clip) { const { videoPath, ...metadata } = clip; return { ...metadata, videoUrl: clip.status === 'completed' && videoPath ? `/output/${path.basename(videoPath)}` : null }; }
function clipTempDir(id) { const directory = path.join(root, 'temp', id); if (!directory.startsWith(path.join(root, 'temp'))) throw new Error('Invalid clip path.'); fs.mkdirSync(directory, { recursive: true }); return directory; }
function cleanupTemp(id) { const directory = path.join(root, 'temp', id); if (directory.startsWith(path.join(root, 'temp'))) fs.rmSync(directory, { recursive: true, force: true }); }
module.exports = { ensureDirectories, createClip, getClip, updateClip, listClips, publicClip, clipTempDir, cleanupTemp, root };
