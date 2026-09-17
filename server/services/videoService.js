'use strict';

const path = require('path');
const storage = require('./storageService');
const { getProcessableSource } = require('./videoSourceService');
const { probeDuration, render, runMediaTool, verifyFfmpegAvailable } = require('./renderService');
const { transcribe } = require('./transcriptionService');
function clipRelativeWords(words, duration) {
  return words
    .map(word => ({ ...word, start: Math.max(0, Number(word.start)), end: Math.min(duration, Number(word.end)) }))
    .filter(word => word.word && word.end > word.start && word.start < duration);
}
async function processClip(id) {
  let workingDirectory;
  try {
    const clip = storage.getClip(id); if (!clip) return;
    storage.updateClip(id, { status: 'preparing', progress: 8, step: 'Downloading source', error: null });
    workingDirectory = storage.clipTempDir(id);
    const source = await getProcessableSource(clip, workingDirectory);
    await verifyFfmpegAvailable();
    const sourceDuration = await probeDuration(source.path);
    const processingClip = source.clipRelative ? { ...clip, startTime: 0, endTime: clip.endTime - clip.startTime } : clip;
    if (!Number.isFinite(sourceDuration) || processingClip.endTime > sourceDuration + 1) throw new Error('The selected timestamps are outside the source video.');
    const audioPath = path.join(workingDirectory, 'audio.mp3');
    storage.updateClip(id, { status: 'extracting', progress: 25, step: 'Extracting selected audio' });
    await runMediaTool('ffmpeg', ['-y', '-ss', String(processingClip.startTime), '-to', String(processingClip.endTime), '-i', source.path, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', audioPath], 'FFmpeg could not extract the selected audio.');
    storage.updateClip(id, { status: 'transcribing', progress: 48, step: 'Transcribing audio word by word' });
    // Transcript timestamps are always clip-relative. The audio sent to transcription is already trimmed, and fixture words use the same 0-based clip timeline.
    const rawWords = await transcribe(audioPath, source); const words = clipRelativeWords(rawWords, clip.endTime - clip.startTime);
    if (!words.length) throw new Error('No spoken words were found in the selected range.');
    storage.updateClip(id, { status: 'generating_captions', progress: 64, step: 'Building balanced captions' });
    const outputPath = path.join(storage.root, 'output', `${id}.mp4`);
    storage.updateClip(id, { status: 'rendering', progress: 76, step: 'Rendering captions and MP4' });
    await render({ sourcePath: source.path, words, clip: processingClip, directory: workingDirectory, outputPath });
    storage.updateClip(id, { status: 'completed', progress: 100, step: 'Completed', duration: clip.endTime - clip.startTime, videoPath: outputPath, error: null });
  } catch (error) { storage.updateClip(id, { status: 'failed', progress: 0, step: 'Failed', error: error.message || 'Video processing failed.' }); }
  finally { if (workingDirectory) storage.cleanupTemp(id); }
}
module.exports = { processClip, clipRelativeWords };
