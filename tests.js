'use strict';
const iframe = document.getElementById('application');
const output = document.getElementById('results');
const messages = [];
let passed = 0;
let failed = 0;
function check(condition, name) {
  messages.push(`${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (condition) passed++; else failed++;
  console[condition ? 'log' : 'error'](`${condition ? 'PASS' : 'FAIL'} ${name}`);
  output.textContent = messages.join('\n');
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function navigate(path) {
  await new Promise(resolve => { iframe.onload = resolve; iframe.src = path; });
}
async function run() {
  const savedDrafts = localStorage.getItem('clipy.drafts.v1');
  try {
    localStorage.setItem('clipy.drafts.v1', '[]');
    let doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    const api = win.ClipyValidation;
    const id = 'dQw4w9WgXcQ';
    check(Boolean(api), 'Frontend initializes');
    check(api.parseYouTubeURL(`https://www.youtube.com/watch?v=${id}`) === id, 'Watch URL accepted');
    check(api.parseYouTubeURL(`https://youtu.be/${id}?t=10`) === id, 'Short URL accepted');
    check(api.parseYouTubeURL(`https://www.youtube.com/shorts/${id}`) === id, 'Shorts URL accepted');
    check(api.parseYouTubeURL(`https://youtube.com/live/${id}`) === id, 'Live URL accepted');
    check(api.parseYouTubeURL(`https://youtube.com.attacker.test/watch?v=${id}`) === null, 'Lookalike domain rejected');
    check(api.parseYouTubeURL(`https://youtube.com@attacker.test/watch?v=${id}`) === null, 'URL credential trick rejected');
    check(api.parseYouTubeURL('javascript:alert(1)') === null, 'Script URL rejected');
    check(api.parseYouTubeURL('https://youtube.com/watch?v=abc') === null, 'Invalid video ID rejected');
    check(api.parseTimestamp('00:30') === 30, '00:30 timestamp');
    check(api.parseTimestamp('1:25') === 85, '1:25 timestamp');
    check(api.parseTimestamp('01:02:15') === 3735, '01:02:15 timestamp');
    check(api.parseTimestamp('1:60') === null && api.parseTimestamp('-1:20') === null, 'Invalid seconds and negative timestamps rejected');
    check(api.parseTimestamp('01:62:15') === null && api.parseTimestamp('abc') === null, 'Invalid minutes and text rejected');
    check(api.formatTime(3735) === '01:02:15', 'Hour timestamp round-trip');
    const get = id => doc.getElementById(id);
    const submit = () => get('clip-form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    submit();
    check(!get('url-error').hidden && !get('processing-dialog').open, 'Empty URL blocks creation with inline error');
    get('youtube-url').value = `https://www.youtube.com/watch?v=${id}`;
    get('start-time').value = '00:30';
    get('end-time').value = '00:20';
    submit();
    check(get('time-error').textContent === 'End time must be greater than start time.', 'Reversed range error');
    get('start-time').value = '00:00';
    get('end-time').value = '00:30';
    submit();
    check(!get('permission-error').hidden && !get('processing-dialog').open, 'Permission required before proceeding');
    get('authorized').checked = true;
    submit();
    check(get('processing-dialog').open && get('processing-dialog').textContent.includes('No video has been downloaded'), 'Valid input shows truthful backend-unavailable dialog');
    get('save-draft').click();
    check(!get('processing-dialog').open && JSON.parse(localStorage.getItem('clipy.drafts.v1')).length === 1, 'Save local draft without pretending to render');
    doc.querySelector('[data-style="highlight"]').click();
    check(get('video-preview').dataset.style === 'highlight', 'Caption preset updates preview');
    get('caption-position').value = 'top';
    get('caption-position').dispatchEvent(new win.Event('change'));
    check(get('video-preview').dataset.position === 'top', 'Caption position updates');
    get('aspect-ratio').value = '1:1';
    get('aspect-ratio').dispatchEvent(new win.Event('change'));
    check(get('video-preview').style.aspectRatio === '1 / 1', 'Aspect ratio updates');
    get('edit-preview-button').click();
    check(get('editor-dialog').open, 'Caption editor opens');
    get('editor-dialog').querySelector('[data-close]').click();
    check(!get('editor-dialog').open, 'Caption editor closes');
    get('settings-button').click();
    check(get('settings-dialog').open, 'Settings opens');
    get('settings-dialog').querySelector('[data-close]').click();
    get('preview-timeline').value = '8';
    get('preview-timeline').dispatchEvent(new win.Event('input'));
    check(get('preview-time').textContent.includes('0:08') && get('caption-overlay').textContent.includes('PERSPECTIVE.'), 'Timeline seeks sample caption phrases');
    get('play-toggle').click();
    await pause(200);
    check(get('video-preview').classList.contains('playing'), 'Caption animation plays');
    get('play-toggle').click();
    check(!get('video-preview').classList.contains('playing'), 'Caption animation pauses');
    check(get('clips-nav').getAttribute('href') === 'clips.html' && get('create-nav').getAttribute('href') === 'index.html', 'Navigation targets valid static pages');
    await navigate('clips.html');
    doc = iframe.contentDocument;
    check(!get('clips-page').hidden && get('create-page').hidden, 'My Clips route displays library');
    check(doc.querySelectorAll('.draft-card').length === 1, 'Saved draft appears in library');
    check(doc.querySelector('.draft-card').textContent.includes('NOT RENDERED'), 'Draft clearly labeled not rendered');
    doc.querySelector('.draft-actions button:last-child').click();
    check(get('delete-dialog').open, 'Deletion requires confirmation');
    get('confirm-delete').click();
    check(doc.querySelectorAll('.draft-card').length === 0 && Boolean(doc.querySelector('.empty-library')), 'Delete refreshes library empty state');
    check(JSON.parse(localStorage.getItem('clipy.drafts.v1')).length === 0, 'Deletion persists');
  } catch (error) { check(false, `Unexpected test error: ${error.message}`); }
  finally {
    if (savedDrafts === null) localStorage.removeItem('clipy.drafts.v1');
    else localStorage.setItem('clipy.drafts.v1', savedDrafts);
    const summary = `${passed} passed, ${failed} failed`;
    output.textContent += `\n\n${summary}`;
    output.dataset.complete = 'true';
    console.log(`CLIPY TEST SUMMARY: ${summary}`);
  }
}
iframe.addEventListener('load', run, { once: true });
