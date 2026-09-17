'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { resolveExecutable } = require('./executableService');
const MAX_DURATION = 180;
const styles = new Set(['dynamic', 'minimal', 'highlight', 'cinematic']);
const ratios = new Set(['9:16', '16:9', '1:1']);
function inputError(message) { const error = new Error(message); error.status = 400; error.expose = true; return error; }
function extractVideoId(raw) {
  try {
    const url = new URL(String(raw)); const host = url.hostname.toLowerCase(); let id;
    if (host === 'youtu.be') id = url.pathname.split('/')[1];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(shorts|embed|live)\//.test(url.pathname) ? url.pathname.split('/')[2] : null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
function validateRequest(body, options = {}) {
  const sourceUrl = String(body.sourceUrl || '').trim();
  if ((options.requireSource !== false || sourceUrl) && !extractVideoId(sourceUrl)) throw inputError('Enter a supported YouTube URL.');
  const startTime = Number(body.startTime), endTime = Number(body.endTime);
  if (!Number.isFinite(startTime) || startTime < 0) throw inputError('Start time must be zero or later.');
  if (!Number.isFinite(endTime) || endTime <= startTime) throw inputError('End time must be after start time.');
  if (endTime - startTime > MAX_DURATION) throw inputError(`Clips are limited to ${MAX_DURATION} seconds.`);
  const aspectRatio = body.aspectRatio || '9:16', captionStyle = body.captionStyle || body.style || 'dynamic';
  if (!ratios.has(aspectRatio)) throw inputError('Choose a supported aspect ratio.');
  if (!styles.has(captionStyle)) throw inputError('Choose a supported caption style.');
  const settings = body.settings || {};
  return { sourceUrl, startTime, endTime, aspectRatio, captionStyle, settings: { position: ['top', 'center', 'bottom'].includes(settings.position) ? settings.position : 'bottom', fontSize: Math.max(18, Math.min(80, Number(settings.fontSize) || 52)), fontWeight: [500, 700, 800].includes(Number(settings.fontWeight)) ? Number(settings.fontWeight) : 800, animation: settings.animation !== false, highlight: settings.highlight !== false } };
}
function getAuthorizedSource(clip) {
  const sourceDirectory = process.env.AUTHORIZED_SOURCE_DIR;
  if (!sourceDirectory) throw new Error('This video needs an authorized processable source. Configure a permitted source provider or provide the matching MP4 source file.');
  const directory = path.resolve(sourceDirectory); const source = path.join(directory, `${clip.videoId}.mp4`);
  if (!source.startsWith(directory + path.sep) || !fs.existsSync(source)) throw new Error(`Authorized source missing. Place ${clip.videoId}.mp4 in ${directory}, or configure a permitted source provider.`);
  const wordsPath = path.join(directory, `${clip.videoId}.words.json`);
  return { path: source, wordsPath: fs.existsSync(wordsPath) ? wordsPath : null };
}
function findAuthorizedSource(clip) {
  const sourceDirectory = process.env.AUTHORIZED_SOURCE_DIR;
  if (!sourceDirectory) return null;
  const directory = path.resolve(sourceDirectory); const source = path.join(directory, `${clip.videoId}.mp4`);
  if (!source.startsWith(directory + path.sep) || !fs.existsSync(source)) return null;
  const wordsPath = path.join(directory, `${clip.videoId}.words.json`);
  return { path: source, wordsPath: fs.existsSync(wordsPath) ? wordsPath : null };
}
function runYtdlp(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true }); let stderr = '';
    child.stderr.on('data', value => { stderr += value; });
    child.on('error', error => reject(error));
    child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr.slice(-800))));
  });
}
async function findYtdlp() {
  return resolveExecutable('yt-dlp');
}
async function verifyVideoFile(sourcePath) {
  const executable = await resolveExecutable('ffprobe');
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(sourcePath) || fs.statSync(sourcePath).size === 0) return reject(new Error('Downloaded source video is empty or missing.'));
    const child = spawn(executable, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', sourcePath], { windowsHide: true }); let output = ''; let stderr = '';
    child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { stderr += value; });
    child.on('error', error => reject(error.code === 'ENOENT' ? new Error('FFmpeg is not installed or is not available on PATH.') : error));
    child.on('close', code => code === 0 && output.trim() === 'video' ? resolve() : reject(new Error(stderr.trim() || 'Downloaded source has no video stream.')));
  });
}
async function getProcessableSource(clip, directory) {
  const authorizedSource = findAuthorizedSource(clip);
  if (authorizedSource) return authorizedSource;
  const executable = await findYtdlp();
  const outputPath = path.join(directory, `${clip.videoId}.mp4`);
  try {
    const ytdlpArgs = [
      '--no-playlist',
      '--extractor-args', 'youtube:player_client=ios,web_creator',
      '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      '--merge-output-format', 'mp4',
      '--download-sections', `*${clip.startTime}-${clip.endTime}`,
      '--concurrent-fragments', '4',
      '-f', 'bv*[height<=1080]+ba/b[height<=1080]',
      '-o', outputPath,
      clip.sourceUrl
    ];
    await runYtdlp(executable, ytdlpArgs);
    await verifyVideoFile(outputPath);
    const fixtureDirectory = process.env.AUTHORIZED_SOURCE_DIR ? path.resolve(process.env.AUTHORIZED_SOURCE_DIR) : null;
    const fixturePath = fixtureDirectory ? path.join(fixtureDirectory, `${clip.videoId}.words.json`) : null;
    return { path: outputPath, wordsPath: fixturePath && fs.existsSync(fixturePath) ? fixturePath : null, clipRelative: true };
  } catch (err) {
    console.error('yt-dlp / video source download failed:', err);
    throw new Error(`Could not obtain a processable video source from this YouTube URL. (${err.message || 'Unknown error'})`);
  }
}
module.exports = { validateRequest, extractVideoId, getAuthorizedSource, getProcessableSource, MAX_DURATION };
