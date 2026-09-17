'use strict';

// Clipy frontend preview: no download, transcription, or rendering is simulated.
const $ = id => document.getElementById(id);
const DRAFT_KEY = 'clipy.drafts.v1';
const PREF_KEY = 'clipy.preferences.v1';
const captions = [
  [['GREAT', 'THINGS'], ['TAKE', 'TIME.']],
  [['TAKE', 'THE'], ['SCENIC', 'ROUTE.']],
  [['A', 'LITTLE'], ['MORE', 'PERSPECTIVE.']],
  [['MAKE', 'EVERY'], ['MOMENT', 'COUNT.']]
];
let style = 'dynamic';
let elapsed = 0;
let playing = false;
let frame = 0;
let previousFrame = 0;
let lastWord = '';
let editingId = null;
let pendingDelete = null;
let toastTimer;
let statusTimer;
let activeClipId = null;

function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { notify('Browser storage is unavailable or full. Your draft was not saved.'); return false; }
}
function getDrafts() {
  const drafts = readLocal(DRAFT_KEY, []);
  return Array.isArray(drafts) ? drafts.filter(d => d && typeof d.id === 'string' && /^[\w-]{11}$/.test(d.videoId) && Number.isFinite(d.start) && Number.isFinite(d.end)) : [];
}
function parseYouTubeURL(raw) {
  try {
    const url = new URL(raw.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    let id = null;
    if (host === 'youtu.be') id = url.pathname.split('/')[1];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else if (/^\/(shorts|embed|live)\//.test(url.pathname)) id = url.pathname.split('/')[2];
    }
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
function parseTimestamp(raw) {
  const value = String(raw).trim();
  if (!/^\d{1,3}:\d{2}(:\d{2})?$/.test(value)) return null;
  const parts = value.split(':').map(Number);
  if (parts.at(-1) > 59 || (parts.length === 3 && parts[1] > 59)) return null;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return (h ? `${String(h).padStart(2, '0')}:` : '') + `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function notify(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function setError(id, message, input) {
  $(id).textContent = message;
  $(id).hidden = !message;
  if (input) $(input).setAttribute('aria-invalid', Boolean(message));
}
function validateURL(showError = true) {
  const id = parseYouTubeURL($('youtube-url').value);
  if (showError) setError('url-error', id ? '' : 'Enter a valid YouTube URL, such as youtube.com/watch?v=…', 'youtube-url');
  $('source-info').hidden = !id;
  $('url-hint').hidden = Boolean(id);
  if (id) {
    const src = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
    if ($('source-thumbnail').getAttribute('src') !== src) {
      $('source-thumbnail').hidden = false;
      $('source-thumbnail').src = src;
    }
    $('video-id').textContent = `YouTube · ${id} · Availability not verified`;
  }
  return id;
}
function validateTimes() {
  const start = parseTimestamp($('start-time').value);
  const end = parseTimestamp($('end-time').value);
  let message = '';
  if (start === null || end === null) message = 'Use MM:SS or HH:MM:SS, for example 01:25 or 01:02:15.';
  else if (end <= start) message = 'End time must be greater than start time.';
  setError('time-error', message);
  $('start-time').setAttribute('aria-invalid', start === null);
  $('end-time').setAttribute('aria-invalid', Boolean(message));
  $('duration-badge').textContent = message ? 'Check your times' : `${end - start} sec clip`;
  return !message;
}
function setStyle(value) {
  if (!['dynamic', 'minimal', 'highlight', 'cinematic'].includes(value)) return;
  style = value;
  $('video-preview').dataset.style = value;
  $('editor-style').value = value;
  document.querySelectorAll('.style-option').forEach(button => {
    const selected = button.dataset.style === value;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', selected);
  });
}
function setPosition(value) {
  if (!['bottom', 'center', 'top'].includes(value)) return;
  $('video-preview').dataset.position = value;
  $('caption-position').value = value;
  $('editor-position').value = value;
}
function updateCustomization() {
  $('caption-overlay').style.fontSize = `${$('font-size').value}px`;
  $('caption-overlay').style.fontWeight = $('font-weight').value;
  $('font-size-value').textContent = `${$('font-size').value} px`;
  $('video-preview').classList.toggle('no-motion', !$('animation-enabled').checked);
  $('video-preview').classList.toggle('no-highlight', !$('highlight-enabled').checked);
}
function renderCaptions(force = false) {
  const phraseIndex = Math.min(3, Math.floor(elapsed / 3));
  const wordIndex = Math.min(3, Math.floor((elapsed % 3) / .75));
  const key = `${phraseIndex}:${wordIndex}`;
  if (!force && key === lastWord) return;
  lastWord = key;
  const fragment = document.createDocumentFragment();
  captions[phraseIndex].forEach((words, line) => {
    const span = document.createElement('span');
    words.forEach((word, i) => {
      if (i) span.append(' ');
      const token = document.createElement('b');
      token.textContent = word;
      token.style.fontWeight = 'inherit';
      if (line * 2 + i === wordIndex) token.className = 'active-word';
      span.append(token);
    });
    fragment.append(span);
  });
  $('caption-overlay').replaceChildren(fragment);
  // Long phrases stay inside the caption safe area, including larger font settings.
  requestAnimationFrame(() => {
    const overlay = $('caption-overlay');
    overlay.style.transform = '';
    const widest = Math.max(...[...overlay.children].map(line => line.scrollWidth));
    if (widest > overlay.clientWidth && overlay.clientWidth) overlay.style.transform = `scale(${overlay.clientWidth / widest})`;
  });
}
function updateTimeline() {
  $('preview-timeline').value = elapsed;
  $('preview-time').firstChild.textContent = `0:${String(Math.floor(elapsed)).padStart(2, '0')} `;
}
function setPlaying(value) {
  playing = value;
  $('video-preview').classList.toggle('playing', value);
  const label = value ? 'Pause caption animation' : 'Play caption animation';
  [$('play-toggle'), $('preview-play')].forEach(button => {
    button.setAttribute('aria-label', label);
    if (value) button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke-width="4"/></svg>';
    else button.innerHTML = '<svg aria-hidden="true"><use href="#i-play"/></svg>';
  });
  cancelAnimationFrame(frame);
  if (value) {
    if (elapsed >= 12) elapsed = 0;
    previousFrame = performance.now();
    frame = requestAnimationFrame(tick);
  }
}
function tick(now) {
  if (!playing) return;
  elapsed += Math.min((now - previousFrame) / 1000, .1);
  previousFrame = now;
  if (elapsed >= 12) elapsed = 0;
  updateTimeline();
  renderCaptions();
  frame = requestAnimationFrame(tick);
}
function openDialog(id) { $(id).showModal(); }
function currentSettings() {
  return {
    style, position: $('caption-position').value, aspectRatio: $('aspect-ratio').value,
    fontSize: Number($('font-size').value), fontWeight: $('font-weight').value,
    animation: $('animation-enabled').checked, highlight: $('highlight-enabled').checked
  };
}
function applySettings(settings = {}) {
  setStyle(settings.style || 'dynamic');
  setPosition(settings.position || 'bottom');
  $('aspect-ratio').value = ['9:16', '16:9', '1:1'].includes(settings.aspectRatio) ? settings.aspectRatio : '9:16';
  $('font-size').value = Math.min(38, Math.max(18, Number(settings.fontSize) || 30));
  $('font-weight').value = ['500', '700', '800'].includes(settings.fontWeight) ? settings.fontWeight : '800';
  $('animation-enabled').checked = settings.animation !== false;
  $('highlight-enabled').checked = settings.highlight !== false;
  updateCustomization();
  updateAspect();
}
function updateAspect() {
  const ratio = $('aspect-ratio').value;
  const preview = $('video-preview');
  preview.style.aspectRatio = ratio.replace(':', ' / ');
  preview.style.width = ratio === '9:16' ? '' : '100%';
  preview.style.maxWidth = ratio === '9:16' ? '' : '330px';
  renderCaptions(true);
}
function updateCount() {
  const count = getDrafts().length;
  $('draft-count').textContent = count;
  $('draft-count').hidden = !count;
}
function saveDraft() {
  const videoId = validateURL();
  if (!videoId || !validateTimes()) return;
  const drafts = getDrafts();
  const existing = drafts.find(d => d.id === editingId);
  const id = existing?.id || (globalThis.crypto?.randomUUID?.() || `draft-${Date.now()}`);
  const draft = {
    id, videoId, url: $('youtube-url').value.trim(), start: parseTimestamp($('start-time').value),
    end: parseTimestamp($('end-time').value), settings: currentSettings(),
    createdAt: existing?.createdAt || new Date().toISOString(), status: 'draft'
  };
  const next = drafts.filter(d => d.id !== id);
  next.unshift(draft);
  if (!writeLocal(DRAFT_KEY, next)) return;
  editingId = id;
  updateCount();
  $('processing-dialog').close();
  notify('Draft saved to My Clips. No video has been rendered.');
}
async function renderLibrary() {
  const grid = $('clips-grid');
  grid.replaceChildren();
  let clips = [];
  try { clips = await fetch('/api/clips').then(response => response.ok ? response.json() : Promise.reject()); }
  catch { $('library-notice').textContent = 'Clip history is unavailable until the Clipy server is running.'; }
  const drafts = getDrafts();
  if (!clips.length && !drafts.length) {
    grid.innerHTML = '<div class="empty-library"><svg><use href="#i-folder"/></svg><h2>A little room for great moments.</h2><p>Your saved clip drafts will live here. Start with a video and find your first moment.</p><a href="index.html">Create your first clip →</a></div>';
    return;
  }
  [...clips, ...drafts].forEach(draft => {
    const card = document.createElement('article');
    card.className = 'draft-card';
    const thumb = document.createElement('div');
    thumb.className = 'draft-thumb';
    const image = document.createElement('img');
    image.src = `https://i.ytimg.com/vi/${draft.videoId || parseYouTubeURL(draft.sourceUrl)}/mqdefault.jpg`;
    image.alt = 'Source YouTube video thumbnail';
    image.loading = 'lazy';
    image.onerror = () => { image.hidden = true; };
    const status = document.createElement('span');
    status.textContent = draft.status === 'completed' ? 'READY · MP4' : draft.status === 'failed' ? 'FAILED' : draft.status ? draft.status.replace('_', ' ').toUpperCase() : 'DRAFT · NOT RENDERED';
    thumb.append(image, status);
    const body = document.createElement('div');
    body.className = 'draft-body';
    const title = document.createElement('h2');
    const start = draft.startTime ?? draft.start, end = draft.endTime ?? draft.end;
    title.textContent = `Moment ${formatTime(start)} – ${formatTime(end)}`;
    const metadata = document.createElement('p');
    metadata.textContent = `${end - start} sec · ${draft.aspectRatio || draft.settings?.aspectRatio || '9:16'} · ${draft.captionStyle || draft.settings?.style || 'dynamic'}`;
    const date = document.createElement('p');
    date.textContent = new Date(draft.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const actions = document.createElement('div');
    actions.className = 'draft-actions';
    (draft.videoUrl ? ['Preview', 'Export'] : draft.id && !draft.videoId ? ['Preview'] : ['Preview', 'Edit', 'Delete']).forEach(action => {
      const button = document.createElement('button');
      button.textContent = action;
      button.addEventListener('click', () => {
        if (action === 'Export') { location.href = draft.videoUrl; }
        else if (action === 'Delete') { pendingDelete = draft.id; openDialog('delete-dialog'); }
        else if (draft.videoUrl) { showCompletedClip(draft); }
        else location.href = `index.html?draft=${encodeURIComponent(draft.id)}&preview=1`;
      });
      actions.append(button);
    });
    body.append(title, metadata, date, actions);
    card.append(thumb, body);
    grid.append(card);
  });
}

function showCompletedClip(clip) {
  activeClipId = clip.id;
  const preview = $('video-preview');
  const existing = preview.querySelector('video');
  if (existing) existing.remove();
  const video = document.createElement('video');
  video.src = clip.videoUrl; video.controls = true; video.playsInline = true; video.className = 'preview-image';
  preview.prepend(video); $('preview-disclosure').textContent = 'Generated Clipy video — captions are burned into the MP4.';
  $('export-button').href = clip.videoUrl; $('export-button').hidden = false;
  preview.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function renderActiveSettings() {
  updateCustomization();
  renderCaptions(true);
  if (!activeClipId) { notify('Preview updated. Create a clip before rendering MP4 changes.'); return; }
  openDialog('processing-dialog');
  setProcessingStatus({ status: 'queued', progress: 0, step: 'Queued for re-render' });
  try {
    const settings = currentSettings();
    const response = await fetch(`/api/clips/${encodeURIComponent(activeClipId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aspectRatio: settings.aspectRatio, captionStyle: settings.style, settings })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to re-render this clip.');
    activeClipId = result.clipId;
    pollClip(activeClipId);
  } catch (error) { setProcessingStatus({ status: 'failed', step: 'Could not re-render clip', error: error.message }); }
}

function setProcessingStatus(job) {
  const setText = (id, value) => { const element = $(id); if (element) element.textContent = value; };
  setText('processing-eyebrow', job.status === 'failed' ? 'PROCESSING FAILED' : job.status === 'completed' ? 'CLIP READY' : 'PROCESSING');
  setText('processing-title', job.status === 'completed' ? 'Your clip is ready.' : job.status === 'failed' ? 'We could not create this clip.' : job.step);
  setText('processing-description', job.error || (job.status === 'completed' ? 'Your MP4 has been rendered and is ready to preview or export.' : `${job.progress}% complete. This reflects the real processing job.`));
  const steps = $('processing-steps');
  if (steps) steps.innerHTML = `<li class="${job.status === 'completed' ? 'complete' : job.status === 'failed' ? 'blocked' : ''}"><span>${job.status === 'completed' ? '✓' : job.status === 'failed' ? '!' : '○'}</span>${job.step}</li>`;
  setText('processing-note', job.status === 'failed' ? 'No MP4 was generated. Check the setup message above and try again.' : 'Only an actual rendered MP4 can be exported.');
}

async function pollClip(id) {
  clearTimeout(statusTimer);
  try {
    const response = await fetch(`/api/clips/${encodeURIComponent(id)}/status`); const job = await response.json();
    if (!response.ok) throw new Error(job.error || 'Unable to read processing status.');
    setProcessingStatus(job);
    if (job.status === 'completed') { const clip = await fetch(`/api/clips/${encodeURIComponent(id)}`).then(response => response.json()); showCompletedClip(clip); return; }
    if (job.status !== 'failed') statusTimer = setTimeout(() => pollClip(id), 1200);
  } catch (error) { setProcessingStatus({ status: 'failed', step: 'Connection failed', error: error.message }); }
}

// Navigation uses regular static pages; both load the same small application.
const libraryMode = location.pathname.endsWith('/clips.html');
$('create-page').hidden = libraryMode;
$('clips-page').hidden = !libraryMode;
$('create-nav').classList.toggle('active', !libraryMode);
$('clips-nav').classList.toggle('active', libraryMode);
$(libraryMode ? 'clips-nav' : 'create-nav').setAttribute('aria-current', 'page');
if (libraryMode) { document.title = 'My Clips — Clipy'; renderLibrary(); }
updateCount();

$('youtube-url').addEventListener('change', () => validateURL());
$('youtube-url').addEventListener('input', () => { setError('url-error', '', 'youtube-url'); validateURL(false); });
$('source-thumbnail').addEventListener('error', () => { $('source-thumbnail').hidden = true; });
['start-time', 'end-time'].forEach(id => $(id).addEventListener('input', validateTimes));
$('paste-button').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    $('youtube-url').value = text;
    validateURL();
  } catch { notify('Paste with Ctrl+V, ⌘V, or touch and hold the URL field.'); $('youtube-url').focus(); }
});
document.querySelectorAll('.style-option').forEach(button => button.addEventListener('click', () => setStyle(button.dataset.style)));
$('caption-position').addEventListener('change', event => setPosition(event.target.value));
$('aspect-ratio').addEventListener('change', updateAspect);
$('editor-style').addEventListener('change', event => setStyle(event.target.value));
$('editor-position').addEventListener('change', event => setPosition(event.target.value));
['font-size', 'font-weight', 'animation-enabled', 'highlight-enabled'].forEach(id => $(id).addEventListener('input', () => { updateCustomization(); renderCaptions(true); }));
$('edit-preview-button').addEventListener('click', () => openDialog('editor-dialog'));
$('render-settings').addEventListener('click', renderActiveSettings);
$('settings-button').addEventListener('click', () => openDialog('settings-dialog'));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
}));
$('clip-form').addEventListener('submit', async event => {
  event.preventDefault();
  const validURL = validateURL();
  const validTime = validateTimes();
  const authorized = $('authorized').checked;
  setError('permission-error', authorized ? '' : 'Please confirm that you own this content or have permission to use it.', 'authorized');
  if (!validURL) { $('youtube-url').focus(); return; }
  if (!validTime) { $('end-time').focus(); return; }
  if (!authorized) { $('authorized').focus(); return; }
  setPlaying(false); $('create-button').disabled = true; openDialog('processing-dialog');
  setProcessingStatus({ status: 'queued', progress: 0, step: 'Creating processing job' });
  try {
    const response = await fetch('/api/clips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceUrl: $('youtube-url').value.trim(), startTime: parseTimestamp($('start-time').value), endTime: parseTimestamp($('end-time').value), aspectRatio: $('aspect-ratio').value, captionStyle: style, settings: currentSettings() }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Unable to create the clip.');
    activeClipId = result.clipId; pollClip(activeClipId);
  } catch (error) { setProcessingStatus({ status: 'failed', step: 'Could not create job', error: error.message }); }
  finally { $('create-button').disabled = false; }
});
$('authorized').addEventListener('change', () => setError('permission-error', '', 'authorized'));
$('save-draft').addEventListener('click', saveDraft);
[$('play-toggle'), $('preview-play')].forEach(button => button.addEventListener('click', () => setPlaying(!playing)));
$('preview-timeline').addEventListener('input', event => { elapsed = Number(event.target.value); updateTimeline(); renderCaptions(true); });
$('sound-info').addEventListener('click', () => notify('This caption design preview has no audio.'));
document.addEventListener('visibilitychange', () => { if (document.hidden) setPlaying(false); });
const preferences = readLocal(PREF_KEY, {});
$('reduce-motion').checked = Boolean(preferences.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches);
document.body.classList.toggle('reduce-motion', $('reduce-motion').checked);
$('reduce-motion').addEventListener('change', () => {
  document.body.classList.toggle('reduce-motion', $('reduce-motion').checked);
  writeLocal(PREF_KEY, { reduceMotion: $('reduce-motion').checked });
});
$('clear-drafts').addEventListener('click', () => {
  if (!getDrafts().length) { notify('There are no local drafts to clear.'); return; }
  pendingDelete = 'all';
  $('settings-dialog').close();
  $('delete-dialog').querySelector('h2').textContent = 'Delete all local drafts?';
  openDialog('delete-dialog');
});
$('confirm-delete').addEventListener('click', () => {
  const next = pendingDelete === 'all' ? [] : getDrafts().filter(draft => draft.id !== pendingDelete);
  if (!writeLocal(DRAFT_KEY, next)) return;
  $('delete-dialog').close();
  $('delete-dialog').querySelector('h2').textContent = 'Delete this draft?';
  updateCount();
  if (libraryMode) renderLibrary();
  notify(pendingDelete === 'all' ? 'Local drafts cleared.' : 'Draft deleted.');
  pendingDelete = null;
});

const params = new URLSearchParams(location.search);
if (!libraryMode && params.has('draft')) {
  const draft = getDrafts().find(item => item.id === params.get('draft'));
  if (draft) {
    editingId = draft.id;
    $('youtube-url').value = draft.url;
    $('start-time').value = formatTime(draft.start);
    $('end-time').value = formatTime(draft.end);
    applySettings(draft.settings);
    validateURL();
    validateTimes();
    // Permission is intentionally not assumed when reopening a saved draft.
    notify('Draft loaded. Preview shows sample captions, not a rendered clip.');
    if (params.get('preview') === '1') {
      requestAnimationFrame(() => { $('video-preview').scrollIntoView({ block: 'center' }); setPlaying(true); });
    }
  } else notify('This draft wasn’t found in this browser.');
}

// Pure validation functions exposed for the included browser tests.
window.ClipyValidation = Object.freeze({ parseYouTubeURL, parseTimestamp, formatTime });
