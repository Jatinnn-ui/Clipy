'use strict';

function createGroups(words) {
  const groups = []; let current = [];
  for (const word of words) {
    const pause = current.length && word.start - current.at(-1).end > .55;
    if (pause || current.length >= 4 || (current.length >= 2 && current.reduce((length, item) => length + item.word.length, 0) + word.word.length > 24)) { groups.push(current); current = []; }
    current.push(word);
  }
  if (current.length) groups.push(current);
  return groups;
}
function assTime(seconds) { const centiseconds = Math.max(0, Math.round(seconds * 100)); return `${Math.floor(centiseconds / 360000)}:${String(Math.floor(centiseconds / 6000) % 60).padStart(2, '0')}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`; }
function esc(value) { return String(value).replace(/[\\{}]/g, '\\$&').replace(/\n/g, '\\N'); }
function subtitleScript(words, clip, dimensions) {
  const { width, height } = dimensions; const settings = clip.settings || {}; const y = settings.position === 'top' ? Math.round(height * .2) : settings.position === 'center' ? Math.round(height * .5) : Math.round(height * .76);
  const fontSize = Math.round(Math.max(18, Math.min(80, settings.fontSize || 52)) * width / 1080); const style = clip.captionStyle;
  const dynamic = style === 'dynamic', highlight = style === 'highlight', cinematic = style === 'cinematic';
  const primary = dynamic ? '&H86EDC3&' : '&HFFFFFF&';
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Caption,Arial,${fontSize},${primary},&H00FFFFFF,&H00101010,&H80000000,${settings.fontWeight >= 700 ? -1 : 0},${cinematic ? -1 : 0},0,0,100,100,0,0,1,${style === 'minimal' ? 1 : 3},2,5,5,5,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n`;
  const events = createGroups(words).map(group => {
    const start = group[0].start; const end = group.at(-1).end + .08;
    const text = group.map((item, index) => {
      const before = Math.max(0, Math.round((item.start - start) * 100)); const duration = Math.max(1, Math.round((item.end - item.start) * 100));
      const active = dynamic ? `{\\k${duration}\\fscx110\\fscy110}` : highlight ? `{\\k${duration}\\c&H162015&\\3c&H86EDC3&}` : `{\\k${duration}}`;
      return `${index ? ' ' : ''}{\\k${before}}${active}${esc(item.word.toUpperCase())}{\\r}`;
    }).join('');
    const motion = settings.animation !== false && (dynamic || cinematic) ? '\\fad(80,100)\\t(0,120,\\fscx105\\fscy105)' : '';
    return `Dialogue: 0,${assTime(start)},${assTime(end)},Caption,,0,0,0,,{\\an5\\pos(${Math.round(width / 2)},${y})${motion}}${text}`;
  });
  return header + events.join('\n') + '\n';
}
module.exports = { createGroups, subtitleScript };
