'use strict';

const fs = require('fs');

async function transcribe(audioPath, source) {
  if (source.wordsPath) {
    const words = JSON.parse(fs.readFileSync(source.wordsPath, 'utf8'));
    if (!Array.isArray(words) || !words.every(word => typeof word.word === 'string' && Number.isFinite(word.start) && Number.isFinite(word.end))) throw new Error('The supplied word-timestamp file is invalid.');
    // Development fixtures are clip-relative: 0.00 is the start timestamp chosen for this clip, not the original source video.
    return words;
  }
  if (!process.env.TRANSCRIPTION_API_KEY) throw new Error('Transcription is not configured. Set TRANSCRIPTION_API_KEY, or provide an authorized <YouTube video ID>.words.json file with word timestamps for local development.');
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(audioPath)], { type: 'audio/mpeg' }), 'audio.mp3');
  form.append('model', process.env.TRANSCRIPTION_MODEL || 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  const response = await fetch(process.env.TRANSCRIPTION_URL || 'https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.TRANSCRIPTION_API_KEY}` }, body: form });
  if (!response.ok) throw new Error(`Transcription provider failed (${response.status}).`);
  const result = await response.json();
  const words = result.words?.map(item => ({ word: item.word.trim(), start: Number(item.start), end: Number(item.end) })).filter(item => item.word && Number.isFinite(item.start) && Number.isFinite(item.end));
  if (!words?.length) throw new Error('Transcription returned no word-level timestamps.');
  // Provider timestamps are clip-relative because the uploaded audio file contains only the selected clip.
  return words;
}
module.exports = { transcribe };
