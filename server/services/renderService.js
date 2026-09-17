'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { subtitleScript } = require('./captionService');
const { resolveExecutable } = require('./executableService');
const dimensions = { '9:16': { width: 1080, height: 1920 }, '16:9': { width: 1920, height: 1080 }, '1:1': { width: 1080, height: 1080 } };
const missingFfmpegMessage = 'FFmpeg is not installed or is not available on PATH.';
function runMediaTool(command, args, failureMessage = `${command} failed.`) {
  return resolveExecutable(command).then(executable => new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    let stderr = '';
    child.stderr?.on('data', value => { stderr += value; });
    child.on('error', error => reject(error.code === 'ENOENT' ? new Error(missingFfmpegMessage) : error));
    child.on('close', code => code === 0 ? resolve({ stderr }) : reject(new Error(`${failureMessage}${stderr ? ` ${stderr.slice(-600)}` : ''}`)));
  }));
}
async function verifyFfmpegAvailable() {
  await runMediaTool('ffmpeg', ['-version'], 'FFmpeg check failed.');
  await runMediaTool('ffprobe', ['-version'], 'FFprobe check failed.');
}
async function probeDuration(source) {
  const lines = [];
  const executable = await resolveExecutable('ffprobe');
  await new Promise((resolve, reject) => {
    const child = spawn(executable, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', source], { windowsHide: true });
    child.stdout.on('data', value => lines.push(value));
    child.on('error', error => reject(error.code === 'ENOENT' ? new Error(missingFfmpegMessage) : error));
    child.on('close', code => code === 0 ? resolve() : reject(new Error('ffprobe could not read the source video.')));
  });
  return Number(lines.join('').trim());
}
async function render({ sourcePath, words, clip, directory, outputPath }) { const size = dimensions[clip.aspectRatio]; const subtitles = path.join(directory, 'captions.ass'); fs.writeFileSync(subtitles, subtitleScript(words, clip, size)); const escaped = subtitles.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'"); const filter = `scale=${size.width}:${size.height}:force_original_aspect_ratio=increase,crop=${size.width}:${size.height},subtitles='${escaped}'`;
  await runMediaTool('ffmpeg', ['-y', '-ss', String(clip.startTime), '-to', String(clip.endTime), '-i', sourcePath, '-vf', filter, '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', process.env.FFMPEG_PRESET || 'veryfast', '-crf', process.env.FFMPEG_CRF || '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputPath], 'FFmpeg rendering failed.');
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1024) throw new Error('FFmpeg did not produce a valid MP4.');
}
module.exports = { probeDuration, render, dimensions, verifyFfmpegAvailable, runMediaTool, missingFfmpegMessage };
