'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const definitions = {
  'yt-dlp': { env: 'YTDLP_PATH', winName: 'yt-dlp.exe' },
  ffmpeg: { env: 'FFMPEG_PATH', winName: 'ffmpeg.exe' },
  ffprobe: { env: 'FFPROBE_PATH', winName: 'ffprobe.exe' }
};

function canRun(command) {
  return new Promise(resolve => {
    const child = spawn(command, ['--version'], { windowsHide: true });
    child.on('error', () => resolve(false));
    child.on('close', code => resolve(code === 0));
  });
}

async function resolveExecutable(name) {
  const definition = definitions[name];
  if (!definition) throw new Error(`Unknown executable: ${name}`);
  const candidates = [];
  if (process.env[definition.env]) candidates.push(process.env[definition.env]);
  candidates.push(name);
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', definition.winName));
  for (const candidate of [...new Set(candidates)]) {
    if (path.isAbsolute(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
      continue;
    }
    if (await canRun(candidate)) return candidate;
  }
  throw new Error(`${name} is not installed or could not be resolved.`);
}

module.exports = { resolveExecutable };
