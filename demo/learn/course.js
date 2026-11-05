/* ============================================================================
   PLANNING & CONTROLS COURSE (Stratum 4D Learn) — course.js
   Router, renderers, level reviews, final assessment, certificate.
   Adapted from Planner's Guild with the game layer removed: no XP, ranks,
   hearts, streaks or badges. Progress is lessons read and answers given.

   ENGINE OVERVIEW
     S          the entire save state — one object, one localStorage key
     save()     persists S; every storage call is wrapped in try/catch and the
                app runs fully in memory if storage is unavailable
     award(n)   the single entry point for XP. Handles rank-up, streak and badges
     go(route)  the router. Routes are strings: 'home', 'lesson:L4', 'boss:B2'
     M          measurable behaviour counters that badges are computed from.
                Badges are NEVER awarded for time spent — only for demonstrated
                skill, so every counter here records a correct action.
   ========================================================================== */

var KEY = 'stratum.learn.course.v1';
var MEM = null;           // in-memory fallback when localStorage is blocked

function blank(){
  return {
    v:1, xp:0, name:'',
    read:{}, ans:{}, widgets:{}, defects:{}, seqs:{}, decisions:{}, drills:{},
    bosses:{}, master:{done:false, best:0},
    badges:[], streak:{n:0, last:''}, route:'home',
    M:{ floatRight:0, floatWrong:0, pathRight:0, evmRun:0, evmBest:0,
        sCurveBest:0, calRight:0, seqPerfect:0, esFast:false, defectPerfect:false,
        relRight:0, dcmaRight:0, pertClean:false, crashClean:false,
        strongDecisions:{}, revealsByLevel:{}, firstTryByLevel:{}, bossFailed:{} }
  };
}
var S = blank();

function load(){
  try{
    var raw = localStorage.getItem(KEY);
    if(raw){
      var o = JSON.parse(raw);
      if(o && o.v === 1){
        var b = blank();
        for(var k in b) if(!(k in o)) o[k] = b[k];
        for(var m in b.M) if(!(m in (o.M || {}))) { o.M = o.M || {}; o.M[m] = b.M[m]; }
        S = o;
      }
    }
  }catch(e){ /* storage unavailable — run from memory */ }
}
function save(){
  try{ localStorage.setItem(KEY, JSON.stringify(S)); }
  catch(e){ MEM = JSON.stringify(S); }
}

/* ------------------------------------------------------------- shortcuts -- */
function q(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function say(msg){ var l = q('live'); if(l) l.textContent = msg; }
function today(){ var d = new Date(); return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate(); }
function daysApart(a, b){
  var pa = a.split('-'), pb = b.split('-');
  var da = new Date(+pa[0], +pa[1]-1, +pa[2]), db = new Date(+pb[0], +pb[1]-1, +pb[2]);
  return Math.round((db - da) / 86400000);
}
function lessonsOf(lvl){ return LESSONS.filter(function(l){ return l.lvl === lvl; }); }
function lessonById(id){ for(var i=0;i<LESSONS.length;i++) if(LESSONS[i].id===id) return LESSONS[i]; return null; }
function bossOf(lvl){ for(var i=0;i<BOSSES.length;i++) if(BOSSES[i].lvl===lvl) return BOSSES[i]; return null; }

/* ------------------------------------------------------------------ rank -- */
function rankOf(xp){
  var r = RANKS[0];
  for(var i=0;i<RANKS.length;i++) if(xp >= RANKS[i].xp) r = RANKS[i];
  return r;
}
function nextRank(xp){
  for(var i=0;i<RANKS.length;i++) if(xp < RANKS[i].xp) return RANKS[i];
  return null;
}

/* -------------------------------------------------------------- progress -- */
function levelDone(lvl){
  var ls = lessonsOf(lvl);
  for(var i=0;i<ls.length;i++) if(!S.read[ls[i].id]) return false;
  return true;
}
function levelUnlocked(lvl){
  return true; /* every level is open; the reviews are for checking understanding, not for gating */
  if(lvl === 1) return true;
  var prev = bossOf(lvl - 1);
  return !!(prev && S.bosses[prev.id] && S.bosses[prev.id].done);
}
function bossUnlocked(lvl){ return true; }
function allBossesDone(){
  for(var i=0;i<BOSSES.length;i++) if(!(S.bosses[BOSSES[i].id] && S.bosses[BOSSES[i].id].done)) return false;
  return true;
}

/* ------------------------------------------------------------------- XP --- */
function award(n, why){
  /* Course mode: no points. Progress is shown as lessons and reviews completed. */
  save(); paintTop(); return;
  if(n <= 0){ save(); paintTop(); return; }
  var before = rankOf(S.xp).name;
  /* streak bonus fires once per calendar day, on the first XP earned */
  var t = today();
  if(S.streak.last !== t){
    if(S.streak.last && daysApart(S.streak.last, t) === 1) S.streak.n++;
    else S.streak.n = 1;
    S.streak.last = t;
    n += Math.min(100, S.streak.n * 10);
  }
  S.xp += n;
  var after = rankOf(S.xp).name;
  save(); paintTop(); checkBadges();
  say('+' + n + ' XP. ' + (why || ''));
  if(after !== before) modal('RANK', 'New rank', '<b>' + after + '</b><p class="sm muted">' + rankOf(S.xp).note + '</p>');
}

/* ---------------------------------------------------------------- badges -- */
function has(b){ return S.badges.indexOf(b) >= 0; }
function grant(id){
  return; /* course mode: no badges */
  if(has(id)) return;
  S.badges.push(id); save();
  var b = null; BADGES.forEach(function(x){ if(x.id === id) b = x; });
  if(b) setTimeout(function(){ modal('BADGE', 'Badge earned', '<b>' + b.n + '</b><p class="sm muted">' + b.d + '</p>'); }, 260);
}
function checkBadges(){
  return; /* course mode: no badges */
  var M = S.M;
  if(M.floatRight >= 4 && M.floatWrong === 0) grant('float');
  if(M.pathRight >= 5) grant('paths');
  if(M.defectPerfect) grant('auditor');
  if(M.evmBest >= 10) grant('cost');
  if(M.esFast) grant('timelord');
  if(S.bosses.B4 && S.bosses.B4.done && S.bosses.B4.hearts === 3) grant('claim');
  if(M.sCurveBest >= 8) grant('frontload');
  if(M.calRight >= 5) grant('calpedant');
  if(M.relRight >= 4) grant('logician');
  if(M.dcmaRight >= 2) grant('dcma');
  if(M.pertClean) grant('pert');
  if(M.crashClean) grant('crasher');
  if(Object.keys(M.strongDecisions).length >= DECISIONS.length) grant('forensic');
  if(M.seqPerfect >= SEQUENCES.length) grant('sequencer');
  if(S.master.done) grant('guild');
  if(S.streak.n >= 7) grant('seven');
  if(S.streak.n >= 30) grant('thirty');
  for(var b in M.bossFailed) if(M.bossFailed[b] && S.bosses[b] && S.bosses[b].done) grant('comeback');
  /* per-level badges */
  for(var lv = 1; lv <= 4; lv++){
    var ls = lessonsOf(lv), all = true, perfect = true;
    for(var i=0;i<ls.length;i++){
      var a = S.ans[ls[i].id];
      if(!S.read[ls[i].id] || !a){ all = false; perfect = false; break; }
      if(a.revealed) all = false;
      if(!(a.ok && a.tries === 1)) perfect = false;
    }
    if(all && ls.length) grant('noshort');
    if(perfect && ls.length) grant('perfect');
  }
}

/* ----------------------------------------------------------------- modal -- */
function modal(tag, title, html, onClose){
  var m = q('modal'), box = q('modalbox');
  box.innerHTML = '<div class="em">' + tag.slice(0,2) + '</div>' +
    '<h2 id="modalTitle">' + title + '</h2>' + html +
    '<div class="rowbtns" style="justify-content:center;margin-top:16px"><button class="btn" id="mdOK">Continue</button></div>';
  m.classList.add('on');
  var ok = q('mdOK');
  ok.focus();
  ok.onclick = function(){ m.classList.remove('on'); onClose && onClose(); };
  m.onclick = function(e){ if(e.target === m){ m.classList.remove('on'); onClose && onClose(); } };
}
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && q('modal').classList.contains('on')) q('modal').classList.remove('on');
});

/* ------------------------------------------------------------------ chrome */
function heartSVG(full){
  return '<svg class="hrt" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.5S1.5 10.3 1.5 5.9A3.4 3.4 0 0 1 8 4.3a3.4 3.4 0 0 1 6.5 1.6C14.5 10.3 8 14.5 8 14.5z" fill="' +
    (full ? '#B03127' : 'none') + '" stroke="#B03127" stroke-width="1.4"/></svg>';
}
var HEARTS = null;
function setHearts(n){
  HEARTS = n; return; /* course mode: no hearts */
  var w = q('tbHeartsWrap'), t = q('tbHearts');
  if(n === null){ w.hidden = true; return; }
  w.hidden = false;
  var s = ''; for(var i=0;i<3;i++) s += heartSVG(i < n);
  t.innerHTML = s;
  t.setAttribute('aria-label', n + ' of 3 hearts remaining');
}
function paintTop(){
  var nRead = LESSONS.filter(function(l){ return S.read[l.id]; }).length;
  var nAns = LESSONS.filter(function(l){ return S.ans[l.id] && (S.ans[l.id].ok || S.ans[l.id].revealed); }).length;
  var nRev = BOSSES.filter(function(b){ return S.bosses[b.id] && S.bosses[b.id].done; }).length;
  q('tbRead').textContent = nRead + ' / ' + LESSONS.length;
  q('tbChecks').textContent = nAns + ' / ' + LESSONS.length;
  q('tbReviews').textContent = nRev + ' / ' + BOSSES.length;
  var pct = Math.round((nRead + nAns + nRev * 3 + (S.master.done ? 4 : 0)) / (LESSONS.length * 2 + BOSSES.length * 3 + 4) * 100);
  q('xpBar').style.width = Math.max(2, pct) + '%';
  q('xpNext').textContent = 'course progress';
  q('xpNum').textContent = pct + '%';
  return;
  var r = rankOf(S.xp), nx = nextRank(S.xp);
  q('tbRank').textContent = r.name;
  q('tbXp').textContent = S.xp.toLocaleString();
  var st = q('tbStreak');
  var atRisk = S.streak.last !== today() && S.streak.n > 0;
  st.textContent = S.streak.n + (atRisk ? ' !' : '');
  st.parentNode.title = atRisk ? 'Streak at risk — earn XP today to keep it' : S.streak.n + ' day streak';
  if(nx){
    var prev = r.xp, span = nx.xp - prev;
    q('xpBar').style.width = Math.max(2, Math.min(100, (S.xp - prev) / span * 100)) + '%';
    q('xpNext').textContent = 'next: ' + nx.name;
    q('xpNum').textContent = S.xp + ' / ' + nx.xp;
  } else {
    q('xpBar').style.width = '100%';
    q('xpNext').textContent = 'highest rank reached';
    q('xpNum').textContent = S.xp + ' XP';
  }
}
function paintNav(){
  var n = q('nav'), s = '';
  s += '<div class="navgrp"><h5>Course</h5>' +
    navItem('home', '⌂', 'Course map', '') +
    navItem('glossary', 'A', 'Glossary', '') +
    navItem('drills', '?', 'Quick recall', '') +
    '</div>';
  LEVELS.forEach(function(L){
    var un = levelUnlocked(L.n);
    s += '<div class="navgrp"><h5>Level ' + L.n + ' · ' + L.title + '</h5>';
    lessonsOf(L.n).forEach(function(l, i){
      s += navItem(un ? 'lesson:' + l.id : '', String(L.n) + '.' + (i+1), l.t,
                   S.read[l.id] ? '✓' : '', !un, S.read[l.id]);
    });
    var bs = bossOf(L.n);
    if(bs){
      var bu = bossUnlocked(L.n);
      var dn = S.bosses[bs.id] && S.bosses[bs.id].done;
      s += navItem('boss:' + bs.id, 'R', 'Level ' + L.n + ' review', dn ? '✓' : '', false, dn);
    }
    s += '</div>';
  });
  s += '<div class="navgrp"><h5>Final</h5>' +
    navItem('master', '∑', 'Final assessment', S.master.done ? '✓' : '', false, S.master.done) +
    navItem(S.master.done ? 'cert' : '', '▣', 'Certificate', '', !S.master.done) +
    navItem('settings', '⚙', 'Progress & settings', '') +
    '</div>';
  n.innerHTML = s;
  Array.prototype.forEach.call(n.querySelectorAll('.navi'), function(b){
    b.onclick = function(){ var r = b.getAttribute('data-r'); if(r) go(r); };
  });
}
function navItem(route, ic, label, dot, locked, done){
  var on = (S.route === route) ? ' on' : '';
  return '<button class="navi' + on + (locked ? ' lock' : '') + '" data-r="' + (route||'') + '"' +
    (locked ? ' aria-disabled="true" title="Locked"' : '') + '>' +
    '<span class="ic" aria-hidden="true">' + ic + '</span>' +
    '<span class="lbl">' + label + '</span>' +
    '<span class="dot' + (done ? ' done' : '') + '">' + (locked ? '🔒' : dot) + '</span></button>';
}

/* ------------------------------------------------------------------ router */
function go(route){
  S.route = route; save();
  var v = q('view');
  v.innerHTML = '';
  var p = route.split(':');
  switch(p[0]){
    case 'home':      viewHome(v); break;
    case 'lesson':    viewLesson(v, p[1]); break;
    case 'boss':      viewBoss(v, p[1]); break;
    case 'master':    viewMaster(v); break;
    case 'cert':      viewCert(v); break;
    case 'badges':    viewBadges(v); break;
    case 'glossary':  viewGlossary(v); break;
    case 'drills':    viewDrills(v); break;
    case 'drill':     viewDrill(v, p[1]); break;
    case 'defect':    viewDefect(v, p[1]); break;
    case 'seq':       viewSeq(v, p[1]); break;
    case 'decision':  viewDecision(v, p[1]); break;
    case 'settings':  viewSettings(v); break;
    default:          viewHome(v);
  }
  paintNav(); paintTop();
  window.scrollTo(0, 0);
  v.focus();
  var sb = q('sidebar'); if(sb) sb.classList.remove('open');
}

/* ==========================================================================
 *  VIEW — HOME / SKILL TREE
 * ========================================================================== */
function viewHome(v){
  var r = rankOf(S.xp), nx = nextRank(S.xp);
  var lessonsRead = Object.keys(S.read).length;
  var html = '<div class="card" style="border-left:4px solid var(--navy)">' +
    '<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">' +
    '<div style="flex:1 1 320px;min-width:260px">' +
    '<h1 style="margin-bottom:2px">Planning &amp; Controls</h1>' +
    '<p class="sm muted" style="margin-bottom:12px">Project planning and controls, from first principles to forensic delay analysis. Four levels, 21 lessons, live tools in every lesson.</p>' +
    '<p style="margin-bottom:6px">Read the lessons in order or jump to any topic. Each level ends with a review that checks the method, and the final assessment leads to a certificate of completion.</p>' +
    '</div>' +
    '<div style="flex:0 0 auto"><div class="out" style="grid-template-columns:repeat(4,minmax(92px,1fr))">' +
    kpi('Lessons', lessonsRead + '/' + LESSONS.length) +
    kpi('Checks answered', LESSONS.filter(function(l){ return S.ans[l.id] && (S.ans[l.id].ok || S.ans[l.id].revealed); }).length + '/' + LESSONS.length) +
    kpi('Level reviews', BOSSES.filter(function(b){ return S.bosses[b.id] && S.bosses[b.id].done; }).length + '/4') +
    kpi('Final', S.master.done ? 'Passed' : '–') +
    '</div></div></div></div>';

  html += '<div class="card"><h2>Course map</h2>' +
    '<p class="sm muted">Each box is a lesson. Green is read; amber is where to go next. The review at the end of each level checks the method with a worked case.</p>' +
    '<div id="tree"></div>' +
    '<div class="legend"><span><i style="background:var(--grn)"></i>complete</span>' +
    '<span><i style="background:var(--amb)"></i>next up</span>' +
    '<span><i style="background:#fff;border:1px solid var(--rule)"></i>not started</span></div></div>';

  /* challenge hub */
  html += '<div class="card"><h2>Practice</h2><p class="sm muted">Exercises that apply the lessons: find the defects in a programme extract, put a process in order, and judge a realistic decision. Tool exercises sit inside the lessons.</p><div class="grid g2">';
  DEFECTS.forEach(function(d){
    var done = S.defects[d.id];
    html += chalCard('defect:' + d.id, 'Spot the Defect', d.title, 'Level ' + d.lvl, done ? (done.perfect ? 'Perfect' : done.score + ' pts') : '', levelUnlocked(d.lvl));
  });
  SEQUENCES.forEach(function(s2){
    var done = S.seqs[s2.id];
    html += chalCard('seq:' + s2.id, 'Sequence Builder', s2.title, 'Level ' + s2.lvl, done ? (done.perfect ? 'Perfect' : 'Done') : '', levelUnlocked(s2.lvl));
  });
  DECISIONS.forEach(function(d){
    var done = S.decisions[d.id] != null;
    html += chalCard('decision:' + d.id, 'Decision Scenario', d.title, 'Level ' + d.lvl, done ? 'Answered' : '', levelUnlocked(d.lvl));
  });
  html += '</div></div>';
  v.innerHTML = html;
  drawTree();
  Array.prototype.forEach.call(v.querySelectorAll('[data-go]'), function(b){
    b.onclick = function(){ go(b.getAttribute('data-go')); };
  });
}
function chalCard(route, kind, title, lvl, status, unlocked){
  var lv = lvl.replace('Level ', 'l');
  return '<button class="card" data-go="' + (unlocked ? route : '') + '" ' +
    (unlocked ? '' : 'disabled ') +
    'style="text-align:left;cursor:' + (unlocked ? 'pointer' : 'not-allowed') + ';opacity:' + (unlocked ? 1 : .5) + ';margin:0">' +
    '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">' +
    '<span class="pill ' + lv + '">' + kind + '</span>' +
    (status ? '<span class="pill done">' + status + '</span>' : (unlocked ? '' : '<span class="pill">locked</span>')) +
    '</div><h3 style="margin:8px 0 0;font-size:15px">' + title + '</h3></button>';
}

function drawTree(){
  var host = q('tree'); if(!host) return;
  var html = '<div style="display:grid;gap:10px">';
  LEVELS.forEach(function(L){
    var un = levelUnlocked(L.n);
    var ls = lessonsOf(L.n);
    html += '<div style="border:1px solid var(--rule);border-radius:6px;overflow:hidden;background:' + (un ? '#fff' : 'var(--lt)') + '">' +
      '<div style="padding:7px 12px;background:' + (un ? 'var(--lt)' : '#E9EEF3') + ';border-bottom:1px solid var(--rule);display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
      '<span class="pill l' + L.n + '">Level ' + L.n + '</span><b style="font-family:var(--disp);color:var(--navy)">' + L.title + '</b>' +
      '<span class="xs muted">' + L.blurb + '</span>' +
      '</div><div style="padding:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">';
    var nextFound = false;
    ls.forEach(function(l, i){
      var done = !!S.read[l.id];
      var isNext = un && !done && !nextFound;
      if(isNext) nextFound = true;
      var bg = !un ? '#E3E9EF' : done ? 'var(--grn)' : isNext ? 'var(--amb)' : '#fff';
      var fg = (!un) ? 'var(--mute)' : (done || isNext) ? '#fff' : 'var(--navy)';
      html += '<button ' + (un ? 'data-go="lesson:' + l.id + '"' : 'disabled') +
        ' class="' + (isNext ? 'pulse' : '') + '" title="' + esc(l.t) + '" ' +
        'aria-label="Lesson ' + L.n + '.' + (i+1) + ' — ' + esc(l.t) + (done ? ', complete' : '') + '" ' +
        'style="width:44px;height:44px;border-radius:6px;border:1px solid ' + (un ? 'var(--rule)' : '#DCE3E9') +
        ';background:' + bg + ';color:' + fg + ';font-family:var(--mono);font-weight:700;font-size:12px;cursor:' + (un ? 'pointer' : 'not-allowed') + '">' +
        L.n + '.' + (i+1) + '</button>';
      if(i < ls.length - 1) html += '<span style="color:var(--rule);font-family:var(--mono)">—</span>';
    });
    var bs = bossOf(L.n), bu = bossUnlocked(L.n), bd = S.bosses[bs.id] && S.bosses[bs.id].done;
    html += '<span style="color:var(--rule);font-family:var(--mono)">—</span>' +
      '<button ' + (bu ? 'data-go="boss:' + bs.id + '"' : 'disabled') +
      ' title="Level ' + L.n + ' review — ' + esc(bs.name) + '" aria-label="Level ' + L.n + ' review' + (bd ? ', completed' : '') + '" ' +
      'style="height:44px;padding:0 14px;border-radius:6px;border:1px solid ' + (bd ? 'var(--grn)' : 'var(--navy)') +
      ';background:' + (bd ? 'var(--grn)' : '#fff') + ';color:' + (bd ? '#fff' : 'var(--navy)') +
      ';font-family:var(--disp);font-weight:700;font-size:12px;cursor:pointer">Level review' + (bd ? ' ✓' : '') + '</button>';
    html += '</div></div>';
  });
  html += '</div>';
  host.innerHTML = html;
  Array.prototype.forEach.call(host.querySelectorAll('[data-go]'), function(b){
    b.onclick = function(){ go(b.getAttribute('data-go')); };
  });
}

/* ==========================================================================
 *  BLOCK RENDERER
 * ========================================================================== */
function renderBlocks(blocks){
  var out = '';
  blocks.forEach(function(b){
    if(b.h != null)      out += '<h3>' + b.h + '</h3>';
    else if(b.p != null) out += '<p>' + b.p + '</p>';
    else if(b.ul)        out += '<ul>' + b.ul.map(function(i){ return '<li>' + i + '</li>'; }).join('') + '</ul>';
    else if(b.ol)        out += '<ol>' + b.ol.map(function(i){ return '<li>' + i + '</li>'; }).join('') + '</ol>';
    else if(b.tbl)       out += tableHTML(b.tbl);
    else if(b.ok)        out += callout('ok', b.ok);
    else if(b.warn)      out += callout('warn', b.warn);
    else if(b.tip)       out += callout('tip', b.tip);
    else if(b.def)       out += callout('def', b.def);
    else if(b.say)       out += '<div class="co say"><b class="t">' + b.say[0] + '</b><q>“' + b.say[1] + '”</q></div>';
    else if(b.fx != null)out += '<div class="fx">' + b.fx + '</div>';
    else if(b.ig)        out += renderIG(b.ig);
    else if(b.w)         out += '<div data-widget="' + b.w + '"></div>';
  });
  return out;
}
function callout(cls, arr){
  var names = {ok:'In practice', warn:'Watch out', tip:'Practitioner tip', def:'Definition'};
  return '<div class="co ' + cls + '"><b class="t">' + (arr[0] || names[cls]) + '</b><p>' + arr[1] + '</p></div>';
}
function tableHTML(t){
  var head = t[0], rows = t[1];
  return '<div class="tblwrap"><table class="dt"><thead><tr>' +
    head.map(function(hh){ return '<th>' + hh + '</th>'; }).join('') +
    '</tr></thead><tbody>' +
    rows.map(function(r){ return '<tr>' + r.map(function(c){ return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') +
    '</tbody></table></div>';
}

/* ------------------------------------------------------------ widget mount */
function mountWidgets(scope){
  Array.prototype.forEach.call(scope.querySelectorAll('[data-widget]'), function(host){
    var id = host.getAttribute('data-widget');
    var W = WIDGETS[id];
    if(!W){ host.remove(); return; }
    var done = !!S.widgets[id];
    var wrap = document.createElement('div');
    wrap.className = 'wg';
    wrap.innerHTML = '<div class="hd"><b>' + W.t + '</b><span class="tag">' + W.tag + '</span></div><div class="bd"></div>' +
      (W.chal ? '<div class="chalbar' + (done ? ' done' : '') + '"><span class="tg">' +
        (done ? '✓ Exercise done' : 'Exercise') + '</span><span class="ct">' + W.chal.text.replace(/\s*Eight in a row earns the badge\./, ' Try to get eight in a row.') + '</span></div>' : '');
    host.replaceWith(wrap);
    var body = wrap.querySelector('.bd');
    var bar = wrap.querySelector('.chalbar');
    var t0 = Date.now();
    try{
      W.mount(body, {
        report: function(state){
          if(!W.chal || !bar) return;
          var pass = false;
          try{ pass = !!W.chal.test(state); }catch(e){}
          if(pass && !S.widgets[id]){
            S.widgets[id] = true;
            /* skill-linked metrics */
            if(id === 'cpm'){ S.M.pathRight++; }
            if(id === 'cal'){ S.M.calRight++; }
            if(id === 'rel'){ S.M.relRight++; }
            if(id === 'dcma'){ S.M.dcmaRight++; }
            if(id === 'pert'){ S.M.pertClean = true; }
            if(id === 'crash' && state.cost < 350000){ S.M.crashClean = true; }
            if(id === 'es' && (Date.now() - t0) < 90000){ S.M.esFast = true; }
            bar.classList.add('done');
            bar.querySelector('.tg').textContent = '✓ Exercise done';
            award(0, 'Exercise: ' + W.t);
          }
          if(id === 'scurve' && state.streak > (S.M.sCurveBest || 0)){
            S.M.sCurveBest = state.streak; save(); checkBadges();
          }
        }
      });
    }catch(e){
      body.innerHTML = '<p class="sm muted">This tool could not start. The lesson content above is unaffected.</p>';
    }
  });
}

/* ==========================================================================
 *  VIEW — LESSON
 * ========================================================================== */
function viewLesson(v, id){
  var L = lessonById(id);
  if(!L){ viewHome(v); return; }
  if(!levelUnlocked(L.lvl)){
    v.innerHTML = '<div class="lockmsg"><h2>Locked</h2><p>Defeat the Level ' + (L.lvl - 1) + ' boss to unlock this level.</p></div>';
    return;
  }
  var idx = LESSONS.indexOf(L);
  var num = lessonsOf(L.lvl).indexOf(L) + 1;
  var head = '<div class="card"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">' +
    '<span class="pill l' + L.lvl + '">Level ' + L.lvl + ' · ' + num + ' of ' + lessonsOf(L.lvl).length + '</span>' +
    (S.read[L.id] ? '<span class="pill done">✓ read</span>' : '') +
    '</div><h1>' + L.t + '</h1><p class="muted" style="margin:0">' + L.sub + '</p></div>';

  var body = '<div class="card lb" id="lbody">' + renderBlocks(L.body) + '</div>';
  var chk = '<div class="qbox" id="qbox"><div class="hd"><span>Check yourself</span>' +
    '<span class="xpv">one question on this lesson</span></div><div class="bd" id="qbd"></div></div>';

  var navb = '<div class="card" style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">' +
    (idx > 0 ? '<button class="btn sec" data-go="lesson:' + LESSONS[idx-1].id + '">← Previous</button>' : '') +
    '<button class="btn gh" data-go="home">Course map</button>' +
    '<span style="flex:1"></span>' +
    (idx < LESSONS.length - 1 && levelUnlocked(LESSONS[idx+1].lvl)
      ? '<button class="btn" data-go="lesson:' + LESSONS[idx+1].id + '">Next lesson →</button>'
      : '') +
    (lessonsOf(L.lvl).indexOf(L) === lessonsOf(L.lvl).length - 1 ? '<button class="btn sec" data-go="boss:' + bossOf(L.lvl).id + '">Level ' + L.lvl + ' review →</button>' : '') +
    '</div>';

  v.innerHTML = head + body + chk + navb;
  mountWidgets(v);
  renderCheck(L);
  Array.prototype.forEach.call(v.querySelectorAll('[data-go]'), function(b){
    b.onclick = function(){ go(b.getAttribute('data-go')); };
  });
  /* read credit fires once the user reaches the bottom of the body */
  if(!S.read[L.id]) watchRead(L);
}
function watchRead(L){
  var box = q('qbox'); if(!box) return;
  var fired = false;
  function chk(){
    if(fired || S.read[L.id]) return;
    var r = box.getBoundingClientRect();
    if(r.top < window.innerHeight + 40){
      fired = true;
      S.read[L.id] = true; save();
      award(0, 'Lesson read: ' + L.t);
      paintNav();
      window.removeEventListener('scroll', chk);
    }
  }
  window.addEventListener('scroll', chk, {passive:true});
  setTimeout(chk, 400);
}

/* ------------------------------------------------------- check-yourself Q -- */
function renderCheck(L){
  var host = q('qbd'); if(!host) return;
  var c = L.check;
  var st = S.ans[L.id] || {tries:0, ok:false, revealed:false};
  if(st.ok || st.revealed){ showAnswered(host, L, st); return; }

  var html = '<p style="margin-bottom:12px">' + c.q + '</p>';
  if(c.type === 'mcq'){
    html += '<div id="opts">' + c.opts.map(function(o, i){
      return '<button class="opt" data-i="' + i + '"><span class="mk">' + 'ABCD'[i] + '</span>' + o + '</button>';
    }).join('') + '</div>';
  } else {
    html += '<div class="rowbtns"><input class="numin" id="numA" type="number" step="any" ' +
      'aria-label="Your numeric answer" placeholder="answer">' +
      (c.unit ? '<span class="mono muted">' + c.unit + '</span>' : '') +
      '<button class="btn" id="subA">Submit</button></div>';
  }
  html += '<div id="fb"></div>' +
    '<div class="rowbtns" style="margin-top:12px"><button class="btn gh sm" id="revA">Show the answer</button></div>';
  host.innerHTML = html;

  function attempt(correct){
    st.tries++;
    if(correct){
      st.ok = true;
      S.ans[L.id] = st;
      trackQuestion(L, true, st.tries);
      save(); award(0, 'Correct');
      showAnswered(q('qbd'), L, st);
    } else {
      S.ans[L.id] = st; save();
      if(st.tries === 1){
        q('fb').innerHTML = '<div class="verdict hint"><b>Not right — try once more.</b>' + c.hint + '</div>';
        say('Incorrect. A hint has been shown.');
      } else {
        trackQuestion(L, false, st.tries);
        st.ok = false; st.revealed = false; S.ans[L.id] = st; save();
        q('fb').innerHTML = '<div class="verdict no"><b>Still not right.</b>' + c.why + '</div>';
        setTimeout(function(){ showAnswered(q('qbd'), L, st); }, 50);
      }
    }
  }
  if(c.type === 'mcq'){
    Array.prototype.forEach.call(host.querySelectorAll('.opt'), function(b){
      b.onclick = function(){
        var i = +b.getAttribute('data-i');
        if(i === c.a){ b.classList.add('right'); attempt(true); }
        else { b.classList.add('wrong'); b.disabled = true; attempt(false); }
      };
    });
  } else {
    var go2 = function(){
      var val = parseFloat(q('numA').value);
      if(isNaN(val)){ q('fb').innerHTML = '<div class="verdict hint"><b>Enter a number.</b></div>'; return; }
      attempt(Math.abs(val - c.a) <= (c.tol == null ? 0.01 : c.tol));
    };
    q('subA').onclick = go2;
    q('numA').addEventListener('keydown', function(e){ if(e.key === 'Enter') go2(); });
  }
  q('revA').onclick = function(){
    st.revealed = true; st.tries = st.tries || 1; S.ans[L.id] = st; save();
    S.M.revealsByLevel[L.lvl] = (S.M.revealsByLevel[L.lvl] || 0) + 1;
    trackQuestion(L, false, 99);
    showAnswered(q('qbd'), L, st);
    say('Answer shown.');
  };
}
function showAnswered(host, L, st){
  var c = L.check;
  var head = st.revealed
    ? '<div class="verdict hint"><b>Answer shown.</b>Work through the reasoning below, then try the next lesson\'s check yourself.</div>'
    : st.ok
      ? '<div class="verdict ok"><b>Correct' + (st.tries === 1 ? ' — first attempt.' : ' on attempt ' + st.tries + '.') + '</b></div>'
      : '<div class="verdict no"><b>Not answered correctly.</b></div>';
  var ansTxt = c.type === 'mcq'
    ? '<b>Answer:</b> ' + 'ABCD'[c.a] + ' — ' + c.opts[c.a]
    : '<b>Answer:</b> ' + c.a + (c.unit ? ' ' + c.unit : '');
  host.innerHTML = '<p style="margin-bottom:10px">' + c.q + '</p>' + head +
    '<div class="co def" style="margin-top:12px"><b class="t">Why</b><p>' + ansTxt + '</p><p>' + c.why + '</p></div>';
}
/* Records skill metrics badges are computed from. */
function trackQuestion(L, correct, tries){
  var topic = {L5:'float', L4:'rel', L6:'cal', L15:'pert'}[L.id];
  if(topic === 'float'){ correct && tries === 1 ? S.M.floatRight++ : S.M.floatWrong++; }
  if(topic === 'rel' && correct && tries === 1) S.M.relRight++;
  if(topic === 'cal' && correct && tries === 1) S.M.calRight++;
  if(L.lvl === 3 && correct){ S.M.evmRun++; if(S.M.evmRun > S.M.evmBest) S.M.evmBest = S.M.evmRun; }
  else if(L.lvl === 3) S.M.evmRun = 0;
  save(); checkBadges();
}

/* ==========================================================================
 *  SEQUENCE BUILDER — reusable. Drag-and-drop with keyboard fallback.
 * ========================================================================== */
function shuffled(a){
  var b = a.slice();
  for(var i = b.length - 1; i > 0; i--){
    var j = Math.floor(Math.random() * (i + 1));
    var t = b[i]; b[i] = b[j]; b[j] = t;
  }
  /* guarantee it is not already in the correct order */
  var same = b.every(function(x, i){ return x === a[i]; });
  if(same && b.length > 1){ var t2 = b[0]; b[0] = b[b.length-1]; b[b.length-1] = t2; }
  return b;
}
function buildSeq(host, correctItems, onSubmit){
  var order = shuffled(correctItems);
  var ul = document.createElement('ul');
  ul.className = 'seq';
  ul.setAttribute('aria-label', 'Reorderable list. Use arrow up or arrow down while an item is focused to move it.');
  function paint(){
    ul.innerHTML = '';
    order.forEach(function(it, i){
      var li = document.createElement('li');
      li.draggable = true;
      li.tabIndex = 0;
      li.setAttribute('data-i', i);
      li.setAttribute('aria-label', 'Position ' + (i + 1) + ': ' + it.replace(/<[^>]+>/g, '') + '. Arrow keys to move.');
      li.innerHTML = '<span class="ord">' + (i + 1) + '</span><span style="flex:1">' + it + '</span><span class="gr">⣿</span>';
      ul.appendChild(li);
    });
    wire();
  }
  var dragI = null;
  function wire(){
    Array.prototype.forEach.call(ul.children, function(li){
      li.addEventListener('dragstart', function(e){
        dragI = +li.getAttribute('data-i'); li.classList.add('drag');
        try{ e.dataTransfer.setData('text/plain', String(dragI)); e.dataTransfer.effectAllowed = 'move'; }catch(err){}
      });
      li.addEventListener('dragend', function(){ li.classList.remove('drag'); });
      li.addEventListener('dragover', function(e){ e.preventDefault(); li.classList.add('over'); });
      li.addEventListener('dragleave', function(){ li.classList.remove('over'); });
      li.addEventListener('drop', function(e){
        e.preventDefault(); li.classList.remove('over');
        var to = +li.getAttribute('data-i');
        if(dragI == null || dragI === to) return;
        var it = order.splice(dragI, 1)[0];
        order.splice(to, 0, it);
        dragI = null; paint();
      });
      li.addEventListener('keydown', function(e){
        var i = +li.getAttribute('data-i'), j = null;
        if(e.key === 'ArrowUp' && i > 0) j = i - 1;
        else if(e.key === 'ArrowDown' && i < order.length - 1) j = i + 1;
        if(j === null) return;
        e.preventDefault();
        var it = order.splice(i, 1)[0];
        order.splice(j, 0, it);
        paint();
        var nx = ul.children[j]; if(nx) nx.focus();
        say('Moved to position ' + (j + 1));
      });
    });
  }
  paint();
  host.appendChild(ul);
  var btn = document.createElement('button');
  btn.className = 'btn';
  btn.style.marginTop = '10px';
  btn.textContent = 'Submit order';
  host.appendChild(btn);
  var fb = document.createElement('div');
  host.appendChild(fb);
  btn.onclick = function(){
    var right = 0;
    Array.prototype.forEach.call(ul.children, function(li, i){
      var ok = order[i] === correctItems[i];
      li.classList.remove('right', 'wrongp');
      li.classList.add(ok ? 'right' : 'wrongp');
      li.draggable = false;
      if(ok) right++;
    });
    var perfect = right === correctItems.length;
    btn.disabled = true;
    fb.innerHTML = '<div class="verdict ' + (perfect ? 'ok' : 'no') + '"><b>' + right + ' of ' +
      correctItems.length + ' in the correct position.</b>' +
      (perfect ? '' : ' The correct order is:<ol style="margin:8px 0 0 18px">' +
        correctItems.map(function(c){ return '<li>' + c + '</li>'; }).join('') + '</ol>') + '</div>';
    onSubmit(right, perfect);
  };
  return {reset:function(){ order = shuffled(correctItems); paint(); btn.disabled = false; fb.innerHTML = ''; }};
}

/* ==========================================================================
 *  BOSS RUNNER
 * ========================================================================== */
function viewBoss(v, id){
  var B = null; BOSSES.forEach(function(b){ if(b.id === id) B = b; });
  if(!B){ viewHome(v); return; }
  if(!bossUnlocked(B.lvl)){
    v.innerHTML = '<div class="lockmsg"><h2>Boss locked</h2><p>Read every lesson in Level ' + B.lvl + ' first.</p>' +
      '<button class="btn sec" onclick="go(\'home\')" style="margin-top:12px">Back to the skill tree</button></div>';
    return;
  }
  var done = S.bosses[B.id] && S.bosses[B.id].done;
  v.innerHTML =
    '<div class="card pad0"><div class="bosshd"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">' +
    '<div><h2>Level ' + B.lvl + ' review — ' + B.name.charAt(0) + B.name.slice(1).toLowerCase() + '</h2><div class="mt">' + B.tag + '</div></div>' +
    '<div class="mt">' + B.stages.length + ' stages · worked case' + (done ? ' · <b style="color:#8FD6AC">COMPLETED</b>' : '') + '</div>' +
    '</div></div><div style="padding:16px 18px"><p>' + B.intro + '</p></div></div>' +
    '<div class="card lb">' + renderBlocks(B.brief) + '</div>' +
    '<div id="arena"></div>';
  mountWidgets(v);
  var arena = q('arena');
  var startBtn = document.createElement('button');
  startBtn.className = 'btn';
  startBtn.textContent = done ? 'Work through it again' : 'Start the review';
  arena.appendChild(startBtn);
  startBtn.onclick = function(){ runBoss(B, arena, done); };
}

function runBoss(B, host, replay){
  var run = {i:0, hearts:3, t0:Date.now(), firstTry:{}, attempts:{}};
  setHearts(3);
  var tick = setInterval(function(){
    var el = q('bossTimer');
    if(!el){ clearInterval(tick); return; }
    var s = Math.floor((Date.now() - run.t0) / 1000);
    el.textContent = Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }, 1000);

  function frame(inner, extra){
    host.innerHTML =
      '<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">' +
      '<b style="font-family:var(--disp);color:var(--navy)">Stage ' + (run.i + 1) + ' of ' + B.stages.length + '</b>' +
      '<span class="timer" hidden><span id="bossTimer">0:00</span></span></div>' +
      '<div class="stage">' + B.stages.map(function(_, k){
        return '<i class="' + (k < run.i ? 'ok' : k === run.i ? 'on' : '') + '"></i>';
      }).join('') + '</div>' +
      '<div id="stageBody">' + inner + '</div></div>' + (extra || '');
  }
  function lose(msg){
    /* course mode: a wrong answer is feedback, not a penalty */
    say('Incorrect. Work it again.');
    return false;
  }
  function fail(msg){
    S.M.bossFailed[B.id] = true; save();
    setHearts(null);
    host.innerHTML = '<div class="card" style="border-color:var(--red)">' +
      '<h2 style="color:var(--red)">Out of hearts</h2>' +
      '<p>' + (msg || '') + '</p>' +
      '<p class="sm muted">The attempt ends here and restarts from stage one. Hearts refill on retry. ' +
      'Re-read the lesson if a stage caught you out — the boss is not testing memory, it is testing whether the method is yours.</p>' +
      '<div class="rowbtns" style="margin-top:14px"><button class="btn red" id="rt">Retry from stage 1</button>' +
      '<button class="btn gh" id="bk">Back to lessons</button></div></div>';
    q('rt').onclick = function(){ runBoss(B, host, replay); };
    q('bk').onclick = function(){ setHearts(null); go('home'); };
  }
  function next(){
    run.i++;
    if(run.i >= B.stages.length){ clearInterval(tick); win(); return; }
    render();
  }
  function win(){
    var secs = Math.floor((Date.now() - run.t0) / 1000);
    var first = !(S.bosses[B.id] && S.bosses[B.id].done);
    S.bosses[B.id] = {done:true, hearts:run.hearts, secs:secs};
    save();
    setHearts(null);
    host.innerHTML = '<div class="card" style="border-color:var(--grn)">' +
      '<h2 style="color:var(--grn)">Level ' + B.lvl + ' review completed</h2>' +
      '<div class="out" style="margin:12px 0">' +
      kpi('Stages', B.stages.length + ' / ' + B.stages.length, '', 'good') +
      kpi('Right first time', Object.keys(run.firstTry).length + ' / ' + B.stages.length) +
      '</div>' +
      (B.lvl < 4 ? '<p>Continue with Level ' + (B.lvl + 1) + '.</p>' : '<p>All four level reviews are done. The final assessment is next.</p>') +
      '<div class="rowbtns" style="margin-top:12px"><button class="btn" id="on">Continue</button></div></div>';
    q('on').onclick = function(){
      var nl = LESSONS.filter(function(l){ return l.lvl === B.lvl + 1; })[0];
      go(B.lvl < 4 && nl ? 'lesson:' + nl.id : (allBossesDone() ? 'master' : 'home'));
    };
    if(first){
      if(B.badge) grant(B.badge);
      award(400, 'Boss defeated: ' + B.name);
    }
    checkBadges();
  }

  function render(){
    var st = B.stages[run.i];
    /* Stage types that disable all of their controls on submit must be rebuilt
       after a wrong answer, or the stage soft-locks with no way to continue. */
    var RESETS = (st.type === 'multi' || st.type === 'mcqs' || st.type === 'order');
    var body, extra = '';
    if(st.type === 'mcq'){
      body = '<p style="margin-bottom:12px">' + st.q + '</p><div id="o">' +
        st.opts.map(function(o, i){ return '<button class="opt" data-i="' + i + '"><span class="mk">' + 'ABCDEFGH'[i] + '</span>' + o + '</button>'; }).join('') +
        '</div><div id="fb"></div>';
    } else if(st.type === 'calc'){
      body = '<p style="margin-bottom:12px">' + st.q + '</p>' +
        '<div class="rowbtns"><input class="numin" id="n0" type="number" step="any" aria-label="Answer" placeholder="answer">' +
        (st.unit ? '<span class="mono muted">' + st.unit + '</span>' : '') +
        '<button class="btn" id="sb">Submit</button></div><div id="fb"></div>';
    } else if(st.type === 'calcs'){
      body = '<p style="margin-bottom:12px">' + st.q + '</p><div class="ctrls">' +
        st.parts.map(function(p, i){
          return '<div class="fld"><label>' + p.l + '</label><input class="numin" style="width:100%" id="n' + i +
                 '" type="number" step="any" aria-label="' + p.l + '"></div>';
        }).join('') + '</div><div class="rowbtns"><button class="btn" id="sb">Submit all</button></div><div id="fb"></div>';
    } else if(st.type === 'mcqs'){
      body = '<p style="margin-bottom:12px">' + st.q + '</p>' +
        st.parts.map(function(p, i){
          return '<div style="margin-bottom:16px" data-part="' + i + '"><p style="margin-bottom:8px"><b>' + p.q + '</b></p>' +
            p.opts.map(function(o, j){
              return '<button class="opt" data-p="' + i + '" data-i="' + j + '"><span class="mk">' + 'ABCD'[j] + '</span>' + o + '</button>';
            }).join('') + '</div>';
        }).join('') + '<div class="rowbtns"><button class="btn" id="sb">Submit all</button></div><div id="fb"></div>';
    } else if(st.type === 'multi'){
      body = '<p style="margin-bottom:6px">' + st.q + '</p>' +
        '<p class="xs muted" style="margin-bottom:10px">Select exactly ' + st.pick + '. <span id="cnt">0</span> selected.</p><div id="o">' +
        st.opts.map(function(o, i){ return '<button class="opt" data-i="' + i + '"><span class="mk">☐</span>' + o + '</button>'; }).join('') +
        '</div><div class="rowbtns"><button class="btn" id="sb">Submit selection</button></div><div id="fb"></div>';
    } else if(st.type === 'order'){
      body = '<p style="margin-bottom:12px">' + st.q + '</p><div id="seqHost"></div><div id="fb"></div>';
    }
    frame(body, extra);

    function good(){
      if(!run.attempts[run.i]) run.firstTry[run.i] = true;
      q('fb').innerHTML = '<div class="verdict ok"><b>Correct.</b>' + st.why + '</div>' +
        '<div class="rowbtns" style="margin-top:10px"><button class="btn" id="nx">' +
        (run.i === B.stages.length - 1 ? 'Finish' : 'Next stage →') + '</button></div>';
      q('nx').onclick = next;
      q('nx').focus();
      trackBossMetric(B, run.i, true);
    }
    function bad(){
      run.attempts[run.i] = (run.attempts[run.i] || 0) + 1;
      if(lose()) return;
      q('fb').innerHTML = '<div class="verdict no"><b>Not right yet.</b>' + (RESETS
          ? 'The stage resets in a moment — work it again from the brief above.'
          : 'Check the brief above and work it again.') + '</div>';
      if(RESETS) setTimeout(function(){ render(); }, 1600);
    }

    if(st.type === 'mcq'){
      Array.prototype.forEach.call(q('o').querySelectorAll('.opt'), function(b){
        b.onclick = function(){
          if(+b.getAttribute('data-i') === st.a){
            b.classList.add('right');
            Array.prototype.forEach.call(q('o').querySelectorAll('.opt'), function(x){ x.disabled = true; });
            good();
          } else { b.classList.add('wrong'); b.disabled = true; bad(); }
        };
      });
    } else if(st.type === 'calc'){
      var sub = function(){
        var val = parseFloat(q('n0').value);
        if(isNaN(val)){ q('fb').innerHTML = '<div class="verdict hint"><b>Enter a number.</b></div>'; return; }
        if(Math.abs(val - st.a) <= (st.tol == null ? 0.01 : st.tol)){ q('sb').disabled = true; q('n0').disabled = true; good(); }
        else bad();
      };
      q('sb').onclick = sub;
      q('n0').addEventListener('keydown', function(e){ if(e.key === 'Enter') sub(); });
    } else if(st.type === 'calcs'){
      q('sb').onclick = function(){
        var all = true, any = false;
        st.parts.forEach(function(p, i){
          var val = parseFloat(q('n' + i).value);
          if(isNaN(val)){ all = false; return; }
          any = true;
          if(Math.abs(val - p.a) > (st.tol == null ? 0.01 : st.tol)) all = false;
        });
        if(!any){ q('fb').innerHTML = '<div class="verdict hint"><b>Fill in every box.</b></div>'; return; }
        if(all){
          st.parts.forEach(function(p, i){ q('n' + i).disabled = true; });
          q('sb').disabled = true; good();
        } else bad();
      };
    } else if(st.type === 'mcqs'){
      var sel = {};
      Array.prototype.forEach.call(q('stageBody').querySelectorAll('.opt'), function(b){
        b.onclick = function(){
          var p = +b.getAttribute('data-p');
          sel[p] = +b.getAttribute('data-i');
          Array.prototype.forEach.call(q('stageBody').querySelectorAll('[data-p="' + p + '"]'), function(x){
            x.classList.remove('right', 'wrong');
            x.style.borderColor = '';
          });
          b.style.borderColor = 'var(--navy)';
        };
      });
      q('sb').onclick = function(){
        if(Object.keys(sel).length < st.parts.length){
          q('fb').innerHTML = '<div class="verdict hint"><b>Answer every part.</b></div>'; return;
        }
        var allOK = st.parts.every(function(p, i){ return sel[i] === p.a; });
        st.parts.forEach(function(p, i){
          Array.prototype.forEach.call(q('stageBody').querySelectorAll('[data-p="' + i + '"]'), function(x){
            var j = +x.getAttribute('data-i');
            if(j === p.a) x.classList.add('right');
            else if(j === sel[i]) x.classList.add('wrong');
            x.disabled = true;
          });
        });
        q('sb').disabled = true;
        allOK ? good() : bad();
      };
    } else if(st.type === 'multi'){
      var picked = [];
      Array.prototype.forEach.call(q('o').querySelectorAll('.opt'), function(b){
        b.onclick = function(){
          var i = +b.getAttribute('data-i');
          var at = picked.indexOf(i);
          if(at >= 0){ picked.splice(at, 1); b.style.borderColor = ''; b.querySelector('.mk').textContent = '☐'; }
          else {
            if(picked.length >= st.pick) return;
            picked.push(i); b.style.borderColor = 'var(--navy)'; b.querySelector('.mk').textContent = '☑';
          }
          q('cnt').textContent = picked.length;
        };
      });
      q('sb').onclick = function(){
        if(picked.length !== st.pick){
          q('fb').innerHTML = '<div class="verdict hint"><b>Select exactly ' + st.pick + '.</b></div>'; return;
        }
        var ok = picked.length === st.a.length && picked.every(function(i){ return st.a.indexOf(i) >= 0; });
        Array.prototype.forEach.call(q('o').querySelectorAll('.opt'), function(b){
          var i = +b.getAttribute('data-i');
          if(st.a.indexOf(i) >= 0) b.classList.add('right');
          else if(picked.indexOf(i) >= 0) b.classList.add('wrong');
          b.disabled = true;
        });
        q('sb').disabled = true;
        ok ? good() : bad();
      };
    } else if(st.type === 'order'){
      buildSeq(q('seqHost'), st.items, function(right, perfect){
        perfect ? good() : bad();
      });
    }
  }
  render();
}
function trackBossMetric(B, stage, ok){
  if(!ok) return;
  if(B.id === 'B1'){
    if(stage === 2 || stage === 3) S.M.floatRight++;
    if(stage === 1 || stage === 4 || stage === 5) S.M.pathRight++;
  }
  if(B.id === 'B2' && stage === 0) S.M.dcmaRight++;
  if(B.id === 'B2' && stage === 1) S.M.calRight++;
  if(B.id === 'B3'){ S.M.evmRun++; if(S.M.evmRun > S.M.evmBest) S.M.evmBest = S.M.evmRun; }
  save(); checkBadges();
}

/* ==========================================================================
 *  MASTER CHALLENGE
 * ========================================================================== */
function viewMaster(v){
  v.innerHTML = '<div class="card pad0"><div class="bosshd"><h2>Final assessment</h2>' +
    '<div class="mt">30 questions drawn from all four levels · pass mark 24 of 30</div></div>' +
    '<div style="padding:16px 18px"><p>Questions are drawn at random from the full bank and mixed across every level. ' +
    'After each answer you see whether it was right. Score 24 or more to pass and receive the certificate of completion.</p>' +
    (allBossesDone() ? '' : '<p class="sm muted">Tip: the four level reviews are good preparation.</p>') +
    (S.master.done ? '<p class="sm"><b class="tick">PASSED</b> — best score ' + S.master.best + ' / 30. Your certificate is in the sidebar.</p>' : '') +
    '</div></div><div id="arena"></div>';
  var arena = q('arena');
  var b = document.createElement('button');
  b.className = 'btn';
  b.textContent = S.master.done ? 'Take it again' : 'Start the final assessment';
  arena.appendChild(b);
  b.onclick = function(){ runMaster(arena); };
}
function runMaster(host){
  var pool = shuffled(MASTER).slice(0, 30);
  var i = 0, hearts = 3, right = 0;
  setHearts(3);
  function fail(){
    setHearts(null);
    if(right > S.master.best){ S.master.best = right; save(); }
    host.innerHTML = '<div class="card" style="border-color:var(--red)"><h2 style="color:var(--red)">Out of hearts</h2>' +
      '<p>You answered <b>' + right + '</b> of 30 before running out. The attempt restarts from the beginning.</p>' +
      '<div class="rowbtns" style="margin-top:12px"><button class="btn red" id="rt">Try again</button>' +
      '<button class="btn gh" id="bk">Back</button></div></div>';
    q('rt').onclick = function(){ runMaster(host); };
    q('bk').onclick = function(){ go('home'); };
  }
  function win(){
    setHearts(null);
    var firstTime = !S.master.done;
    if(right > S.master.best) S.master.best = right;
    var passed = right >= 24;
    if(passed) S.master.done = true;
    save(); paintNav(); paintTop();
    host.innerHTML = '<div class="card" style="border-color:' + (passed ? 'var(--grn)' : 'var(--amb)') + '"><h2 style="color:' + (passed ? 'var(--grn)' : 'var(--amb)') + '">' + (passed ? 'Final assessment passed' : 'Not passed this time') + '</h2>' +
      '<p>You scored <b>' + right + '</b> of 30' + (passed ? '.' : '; the pass mark is 24. Revisit the lessons behind the questions you missed and take it again.') + '</p>' +
      '<div class="rowbtns" style="margin-top:12px">' + (passed ? '<button class="btn" id="cf">Certificate →</button>' : '<button class="btn" id="cf">Take it again</button>') + '</div></div>';
    q('cf').onclick = function(){ passed ? go('cert') : runMaster(host); };
    if(firstTime){ grant('guild'); award(600, 'Master Challenge passed'); }
    checkBadges();
  }
  function render(){
    if(i >= pool.length){ win(); return; }
    var Q = pool[i];
    var body = '<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">' +
      '<b style="font-family:var(--disp);color:var(--navy)">Question ' + (i + 1) + ' of 30</b>' +
      '<span class="timer">' + right + ' correct</span></div>' +
      '<div class="bar teal" style="margin:10px 0 14px"><i style="width:' + (i / 30 * 100) + '%"></i></div>' +
      '<p style="margin-bottom:12px">' + Q.q + '</p>';
    if(Q.type === 'mcq'){
      body += '<div id="o">' + Q.opts.map(function(o, k){
        return '<button class="opt" data-i="' + k + '"><span class="mk">' + 'ABCD'[k] + '</span>' + o + '</button>';
      }).join('') + '</div>';
    } else {
      body += '<div class="rowbtns"><input class="numin" id="n0" type="number" step="any" aria-label="Answer" placeholder="answer">' +
        '<button class="btn" id="sb">Submit</button></div>';
    }
    body += '<div id="fb"></div></div>';
    host.innerHTML = body;
    function ok(){
      right++; i++;
      q('fb').innerHTML = '<div class="verdict ok"><b>Correct.</b></div>';
      setTimeout(render, 420);
    }
    function no(){
      q('fb').innerHTML = '<div class="verdict no"><b>Incorrect.</b></div>';
      i++;
      setTimeout(render, 900);
    }
    if(Q.type === 'mcq'){
      Array.prototype.forEach.call(q('o').querySelectorAll('.opt'), function(b){
        b.onclick = function(){
          Array.prototype.forEach.call(q('o').querySelectorAll('.opt'), function(x){ x.disabled = true; });
          if(+b.getAttribute('data-i') === Q.a){ b.classList.add('right'); ok(); }
          else { b.classList.add('wrong'); q('o').querySelectorAll('.opt')[Q.a].classList.add('right'); no(); }
        };
      });
    } else {
      var sub = function(){
        var val = parseFloat(q('n0').value);
        if(isNaN(val)) return;
        q('sb').disabled = true; q('n0').disabled = true;
        Math.abs(val - Q.a) <= (Q.tol == null ? 0.01 : Q.tol) ? ok() : no();
      };
      q('sb').onclick = sub;
      q('n0').addEventListener('keydown', function(e){ if(e.key === 'Enter') sub(); });
    }
  }
  render();
}

/* ==========================================================================
 *  CHALLENGES — defect boards, sequences, decisions, speed drills
 * ========================================================================== */
function viewDefect(v, id){
  var D = null; DEFECTS.forEach(function(d){ if(d.id === id) D = d; });
  if(!D){ viewHome(v); return; }
  var picked = {}, submitted = false;
  var bad = [];
  D.rows.forEach(function(r, i){ if(r.bad) bad.push(i); });
  v.innerHTML = '<div class="card"><span class="pill l' + D.lvl + '">Spot the Defect</span>' +
    '<h1 style="margin-top:8px">' + D.title + '</h1><p>' + D.intro + '</p>' +
    '<p class="sm muted">There are <b>' + bad.length + '</b> defects in this extract. Score = defects found − false positives. ' +
    '</p></div>' +
    '<div class="card pad0"><div class="tblwrap"><table class="dt pick"><thead><tr><th>#</th>' +
    D.cols.map(function(c){ return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody id="rows">' +
    D.rows.map(function(r, i){
      return '<tr data-i="' + i + '" tabindex="0" role="button" aria-pressed="false"><td class="n">' + (i + 1) + '</td>' +
        r.c.map(function(c){ return '<td>' + c + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table></div></div>' +
    '<div class="card"><div class="rowbtns"><button class="btn" id="sub">Submit <span id="pc">0</span> selections</button>' +
    '<button class="btn gh" id="bk">Back</button></div><div id="fb"></div></div>';
  function toggle(tr){
    if(submitted) return;
    var i = +tr.getAttribute('data-i');
    if(picked[i]){ delete picked[i]; tr.classList.remove('sel'); tr.setAttribute('aria-pressed', 'false'); }
    else { picked[i] = 1; tr.classList.add('sel'); tr.setAttribute('aria-pressed', 'true'); }
    q('pc').textContent = Object.keys(picked).length;
  }
  Array.prototype.forEach.call(v.querySelectorAll('#rows tr'), function(tr){
    tr.onclick = function(){ toggle(tr); };
    tr.onkeydown = function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggle(tr); } };
  });
  q('bk').onclick = function(){ go('home'); };
  q('sub').onclick = function(){
    if(submitted) return;
    submitted = true;
    var found = 0, fp = 0;
    Array.prototype.forEach.call(v.querySelectorAll('#rows tr'), function(tr){
      var i = +tr.getAttribute('data-i');
      tr.classList.remove('sel');
      var isBad = !!D.rows[i].bad, sel = !!picked[i];
      if(isBad && sel){ tr.classList.add('hit'); found++; }
      else if(!isBad && sel){ tr.classList.add('miss'); fp++; }
      else if(isBad && !sel){ tr.classList.add('was'); }
    });
    var score = Math.max(0, found - fp);
    var perfect = found === bad.length && fp === 0;
    var xp = Math.round(D.xp * score / bad.length);
    var prev = S.defects[D.id];
    S.defects[D.id] = {score:score, perfect:perfect};
    if(perfect) S.M.defectPerfect = true;
    save();
    var detail = bad.map(function(i){
      return '<li><b>Row ' + (i + 1) + ' — ' + D.rows[i].c[1] + '</b><br>' + D.rows[i].bad + '</li>';
    }).join('');
    q('fb').innerHTML = '<div class="out" style="margin-top:12px">' +
      kpi('Found', found + ' / ' + bad.length, '', found === bad.length ? 'good' : 'warn') +
      kpi('False positives', fp, '', fp ? 'bad' : 'good') +
      kpi('Score', score, 'found − false positives') +
      kpi('Defects', found + ' / ' + bad.length, 'found') +
      '</div>' +
      '<div class="verdict ' + (perfect ? 'ok' : 'hint') + '"><b>' +
      (perfect ? 'Perfect — every defect found, nothing invented.' : 'Green rows you found. Red rows were clean and you flagged them. Violet rows you missed.') +
      '</b></div><div class="co def" style="margin-top:12px"><b class="t">Every seeded defect</b><ol style="margin:8px 0 0 18px">' +
      detail + '</ol></div>';
    q('sub').disabled = true;
    if(!prev && xp > 0) award(xp, 'Spot the Defect');
    checkBadges();
  };
}

function viewSeq(v, id){
  var Q = null; SEQUENCES.forEach(function(s){ if(s.id === id) Q = s; });
  if(!Q){ viewHome(v); return; }
  v.innerHTML = '<div class="card"><span class="pill l' + Q.lvl + '">Sequence Builder</span>' +
    '<h1 style="margin-top:8px">' + Q.title + '</h1><p>' + Q.intro + '</p>' +
    '<p class="xs muted">Drag to reorder, or focus an item and use the arrow keys.</p></div>' +
    '<div class="card"><div id="host"></div></div>' +
    '<div class="card"><button class="btn gh" id="bk">Back to the skill tree</button></div>';
  q('bk').onclick = function(){ go('home'); };
  var first = !S.seqs[Q.id];
  buildSeq(q('host'), Q.items, function(right, perfect){
    var prev = S.seqs[Q.id];
    S.seqs[Q.id] = {done:true, perfect:perfect || (prev && prev.perfect)};
    if(perfect && (!prev || !prev.perfect)) S.M.seqPerfect++;
    save();
    if(first) award(perfect ? Q.xp : Math.round(Q.xp * right / Q.items.length), 'Sequence Builder');
    checkBadges();
  });
}

function viewDecision(v, id){
  var D = null; DECISIONS.forEach(function(d){ if(d.id === id) D = d; });
  if(!D){ viewHome(v); return; }
  var chosen = S.decisions[D.id];
  v.innerHTML = '<div class="card"><span class="pill l' + D.lvl + '">Decision Scenario</span>' +
    '<h1 style="margin-top:8px">' + D.title + '</h1>' +
    '<div class="co say"><b class="t">The situation</b><p>' + D.scenario + '</p></div>' +
    '<p class="xs muted">More than one option can be defensible. Each choice is assessed on the quality of the reasoning, not against a single "right" answer.</p></div>' +
    '<div class="card"><div id="opts"></div><div id="fb"></div></div>' +
    '<div class="card"><button class="btn gh" id="bk">Back to the skill tree</button></div>';
  q('bk').onclick = function(){ go('home'); };
  function paint(){
    q('opts').innerHTML = D.opts.map(function(o, i){
      var showAll = chosen != null;
      return '<button class="opt" data-i="' + i + '"' + (showAll ? ' disabled' : '') +
        (showAll && i === chosen ? ' style="border-color:var(--navy);border-width:2px"' : '') + '>' +
        '<span class="mk">' + 'ABCD'[i] + '</span>' + o.t +
        (showAll ? ' <span class="pill ' + (o.v === 'strong' ? 'done' : '') + '" style="margin-left:6px">' +
          o.v + '</span>' : '') + '</button>';
    }).join('');
    if(chosen != null){
      var o = D.opts[chosen];
      q('fb').innerHTML = '<div class="verdict ' + (o.v === 'strong' ? 'ok' : o.v === 'weak' ? 'no' : 'hint') + '">' +
        '<b>You chose ' + 'ABCD'[chosen] + ' — assessed as ' + o.v + '.</b>' + o.o + '</div>' +
        '<div class="co def" style="margin-top:12px"><b class="t">What the other options would have produced</b>' +
        D.opts.map(function(x, i){
          return i === chosen ? '' : '<p><b>' + 'ABCD'[i] + ' (' + x.v + ')</b> — ' + x.o + '</p>';
        }).join('') + '</div>';
    } else {
      Array.prototype.forEach.call(q('opts').querySelectorAll('.opt'), function(b){
        b.onclick = function(){
          chosen = +b.getAttribute('data-i');
          S.decisions[D.id] = chosen;
          if(D.opts[chosen].v === 'strong') S.M.strongDecisions[D.id] = 1;
          save();
          award(D.opts[chosen].xp, 'Decision Scenario');
          paint(); checkBadges();
        };
      });
    }
  }
  paint();
}

function viewDrills(v){
  v.innerHTML = '<div class="card"><h1>Quick recall</h1>' +
    '<p>Ten short questions per set on formulas and terminology, the way they come up in a meeting or an interview. After each answer you see the right one.</p></div>' +
    '<div class="grid g2">' + DRILLS.map(function(d){
      var best = S.drills[d.id] || 0;
      var un = levelUnlocked(d.lvl);
      return '<button class="card" data-go="' + (un ? 'drill:' + d.id : '') + '"' + (un ? '' : ' disabled') +
        ' style="text-align:left;margin:0;opacity:' + (un ? 1 : .5) + '">' +
        '<div style="display:flex;justify-content:space-between;gap:8px"><span class="pill l' + d.lvl + '">Level ' + d.lvl + '</span>' +
        (best ? '<span class="pill ' + (best === 10 ? 'done' : '') + '">best ' + best + '/10</span>' : '') +
        '</div><h3 style="margin:8px 0 0;font-size:15px">' + d.title + '</h3></button>';
    }).join('') + '</div>';
  Array.prototype.forEach.call(v.querySelectorAll('[data-go]'), function(b){
    b.onclick = function(){ var r = b.getAttribute('data-go'); if(r) go(r); };
  });
}
function viewDrill(v, id){
  var D = null; DRILLS.forEach(function(d){ if(d.id === id) D = d; });
  if(!D){ viewDrills(v); return; }
  v.innerHTML = '<div class="card pad0"><div class="bosshd"><h2>⏱ ' + D.title + '</h2>' +
    '<div class="mt">10 questions · quick recall</div></div></div><div id="arena"></div>';
  var host = q('arena');
  var b = document.createElement('button');
  b.className = 'btn amb'; b.textContent = 'Start the drill';
  host.appendChild(b);
  b.onclick = function(){ runDrill(D, host); };
}
function runDrill(D, host){
  var pool = shuffled(D.qs).slice(0, 10);
  var i = 0, hearts = 3, right = 0, timer = null;
  setHearts(3);
  function stop(){ if(timer){ clearInterval(timer); timer = null; } }
  function end(passed){
    stop(); setHearts(null);
    if(right > (S.drills[D.id] || 0)){ S.drills[D.id] = right; save(); }
    var perfect = right === 10;
    host.innerHTML = '<div class="card" style="border-color:' + (perfect ? 'var(--grn)' : 'var(--rule)') + '">' +
      '<h2 style="color:' + (perfect ? 'var(--grn)' : 'var(--navy)') + '">' + (perfect ? 'All ten right' : 'Set finished') + '</h2>' +
      '<div class="out" style="margin:12px 0">' +
      kpi('Correct', right + ' / 10', '', perfect ? 'good' : 'warn') +

      '</div><div class="rowbtns"><button class="btn" id="ag">Run it again</button>' +
      '<button class="btn gh" id="bk">Back to drills</button></div></div>';
    q('ag').onclick = function(){ runDrill(D, host); };
    q('bk').onclick = function(){ go('drills'); };
    if(perfect) award(150, 'Perfect speed drill');
    checkBadges();
  }
  function render(){
    if(i >= pool.length){ end(true); return; }
    var Q = pool[i], left = 15;
    host.innerHTML = '<div class="card">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">' +
      '<b style="font-family:var(--disp);color:var(--navy)">' + (i + 1) + ' of 10</b>' +
      '<span class="timer">' + right + ' right</span></div>' +
      '<div class="bar teal" style="margin:10px 0 14px"><i style="width:' + (i / 10 * 100) + '%"></i></div>' +
      '<p style="margin-bottom:12px;font-size:17px"><b>' + Q.q + '</b></p><div id="o">' +
      Q.o.map(function(o, k){ return '<button class="opt" data-i="' + k + '"><span class="mk">' + 'ABCD'[k] + '</span>' + o + '</button>'; }).join('') +
      '</div><div id="fb"></div></div>';
    stop(); /* course mode: untimed */
    function miss(timeout){
      stop();
      Array.prototype.forEach.call(q('o').querySelectorAll('.opt'), function(x){
        x.disabled = true;
        if(+x.getAttribute('data-i') === Q.a) x.classList.add('right');
      });
      q('fb').innerHTML = '<div class="verdict no"><b>Incorrect.</b> The right answer is highlighted.</div>' +
        '<div class="rowbtns" style="margin-top:10px"><button class="btn" id="nxq">Next</button></div>';
      i++; q('nxq').onclick = render;
    }
    Array.prototype.forEach.call(q('o').querySelectorAll('.opt'), function(b){
      b.onclick = function(){
        if(+b.getAttribute('data-i') === Q.a){
          stop(); right++; i++;
          b.classList.add('right');
          Array.prototype.forEach.call(q('o').querySelectorAll('.opt'), function(x){ x.disabled = true; });
          setTimeout(render, 280);
        } else { b.classList.add('wrong'); miss(false); }
      };
    });
  }
  render();
}

/* ==========================================================================
 *  GLOSSARY · BADGES · SETTINGS · CERTIFICATE
 * ========================================================================== */
function viewGlossary(v){
  var sorted = GLOSSARY.slice().sort(function(a, b){ return a[0].localeCompare(b[0]); });
  v.innerHTML = '<div class="card"><h1>Glossary</h1>' +
    '<p class="sm muted">' + sorted.length + ' terms, alphabetised. Type to filter by term, category or definition.</p>' +
    '<input id="gsearch" type="search" placeholder="Search — try float, FIDIC, concurrency, calendar…" aria-label="Search the glossary">' +
    '<p class="xs muted" id="gcount" style="margin-top:8px"></p></div>' +
    '<div class="card"><div class="gloss" id="glist"></div></div>';
  function paint(f){
    f = (f || '').toLowerCase();
    var out = sorted.filter(function(g){
      return !f || g[0].toLowerCase().indexOf(f) >= 0 || g[1].toLowerCase().indexOf(f) >= 0 || g[2].toLowerCase().indexOf(f) >= 0;
    });
    q('glist').innerHTML = out.length
      ? out.map(function(g){
          return '<div class="gt"><span class="cat">' + g[1] + '</span><b>' + g[0] + '</b><span>' + g[2] + '</span></div>';
        }).join('')
      : '<p class="muted">No terms match that search.</p>';
    q('gcount').textContent = out.length + ' of ' + sorted.length + ' shown';
  }
  paint('');
  q('gsearch').addEventListener('input', function(){ paint(this.value); });
}

function viewBadges(v){
  v.innerHTML = '<div class="card"><h1>Badges</h1>' +
    '<p>Twenty badges, each tied to a measurable demonstration of skill. None of them can be earned by time spent, by opening the app, or by revealing answers.</p>' +
    '<div class="bar grn" style="margin-top:10px"><i style="width:' + (S.badges.length / BADGES.length * 100) + '%"></i></div>' +
    '<p class="xs muted" style="margin-top:6px">' + S.badges.length + ' of ' + BADGES.length + ' earned</p></div>' +
    '<div class="grid g2">' + BADGES.map(function(b){
      var got = has(b.id);
      return '<div class="bg ' + (got ? 'got' : 'locked') + '"><div class="sh">' + (got ? '★' : '·') + '</div>' +
        '<div><b>' + b.n + '</b><span>' + b.d + '</span>' +
        (got ? '<span class="pill done" style="margin-top:5px">earned</span>' : '') + '</div></div>';
    }).join('') + '</div>';
}

function viewSettings(v){
  v.innerHTML = '<div class="card"><h1>Progress and settings</h1>' +
    '<p>All progress is stored locally in this browser under a single key. Nothing is sent anywhere — the application makes no network requests at all.</p>' +
    '<p class="sm muted" id="stStatus"></p></div>' +
    '<div class="card"><h2>Your name on the certificate</h2>' +
    '<div class="rowbtns"><input class="numin" style="width:280px;font-family:var(--body)" id="nm" type="text" ' +
    'placeholder="Full name" aria-label="Your name" value="' + esc(S.name || '') + '">' +
    '<button class="btn sec" id="svn">Save name</button></div></div>' +
    '<div class="card"><h2>Move your progress between machines</h2>' +
    '<p class="sm muted">Export writes a .json file. Import reads it back and replaces everything currently stored.</p>' +
    '<div class="rowbtns"><button class="btn" id="ex">Export save</button>' +
    '<button class="btn sec" id="im">Import save</button>' +
    '<input type="file" id="fi" accept="application/json,.json" hidden></div><div id="ifb"></div></div>' +
    '<div class="card" style="border-color:var(--red)"><h2 style="color:var(--red)">Reset progress</h2>' +
    '<p class="sm">This erases lessons read, answers, reviews and the final assessment result. It cannot be undone.</p>' +
    '<div class="rowbtns"><button class="btn gh" id="rs">Reset progress…</button></div><div id="rfb"></div></div>';
  var okStore = true;
  try{ localStorage.setItem(KEY + '.t', '1'); localStorage.removeItem(KEY + '.t'); }catch(e){ okStore = false; }
  q('stStatus').innerHTML = okStore
    ? 'Storage is available — progress persists between sessions.'
    : '<b style="color:var(--red)">Local storage is unavailable in this browser context.</b> The app works fully, but progress will be lost when you close the tab. Use Export before closing.';
  q('svn').onclick = function(){ S.name = q('nm').value.slice(0, 60); save(); say('Name saved'); q('svn').textContent = 'Saved ✓'; };
  q('ex').onclick = function(){
    var blob = new Blob([JSON.stringify(S, null, 2)], {type:'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'stratum-learn-progress.json';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  q('im').onclick = function(){ q('fi').click(); };
  q('fi').onchange = function(){
    var f = this.files && this.files[0]; if(!f) return;
    var r = new FileReader();
    r.onload = function(){
      try{
        var o = JSON.parse(r.result);
        if(!o || o.v !== 1) throw new Error('not a Stratum Learn progress file');
        var b = blank();
        for(var k in b) if(!(k in o)) o[k] = b[k];
        o.M = o.M || b.M;
        for(var m in b.M) if(!(m in o.M)) o.M[m] = b.M[m];
        S = o; save(); paintTop(); paintNav();
        q('ifb').innerHTML = '<div class="verdict ok"><b>Progress imported.</b>' +
          Object.keys(S.read).length + ' lessons read.</div>';
      }catch(e){
        q('ifb').innerHTML = '<div class="verdict no"><b>Could not read that file.</b>' + esc(e.message) + '</div>';
      }
    };
    r.readAsText(f);
  };
  q('rs').onclick = function(){
    q('rfb').innerHTML = '<div class="verdict no"><b>Are you certain?</b>Everything will be erased.' +
      '<div class="rowbtns" style="margin-top:10px"><button class="btn red" id="rs2">Yes, erase everything</button>' +
      '<button class="btn gh" id="rc">Cancel</button></div></div>';
    q('rc').onclick = function(){ q('rfb').innerHTML = ''; };
    q('rs2').onclick = function(){
      S = blank();
      try{ localStorage.removeItem(KEY); }catch(e){}
      save(); paintTop(); paintNav();
      go('home');
      say('Progress reset');
    };
  };
}

/* ---------------------------------------------------------- certificate -- */
function viewCert(v){
  if(!S.master.done){
    v.innerHTML = '<div class="lockmsg"><h2>Not yet</h2><p>Pass the final assessment (24 of 30) to receive the certificate.</p></div>';
    return;
  }
  v.innerHTML = '<div class="card no-print"><h1>Certificate</h1>' +
    '<p>Enter the name you want printed, then download or print. The certificate is drawn on a canvas — nothing is fetched from anywhere.</p>' +
    '<div class="rowbtns"><input class="numin" style="width:300px;font-family:var(--body)" id="cn" type="text" ' +
    'placeholder="Your full name" aria-label="Name for the certificate" value="' + esc(S.name || '') + '">' +
    '<button class="btn" id="dl">Download PNG</button><button class="btn sec" id="pr">Print</button></div></div>' +
    '<div class="card" id="cwrap"></div>';
  var cv = canvas(q('cwrap'), 0.707, 'Certificate of completion');
  function draw(){
    var nm = (q('cn').value || 'Planner').slice(0, 48);
    cv.draw(function(g, w, ht){
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, ht);
      g.strokeStyle = '#16325C'; g.lineWidth = 6;
      g.strokeRect(16, 16, w - 32, ht - 32);
      g.strokeStyle = '#B4862F'; g.lineWidth = 1.5;
      g.strokeRect(28, 28, w - 56, ht - 56);
      var cx = w / 2, u = w / 800;
      g.textAlign = 'center';
      g.fillStyle = '#16325C';
      g.font = '700 ' + (13 * u) + 'px Arial';
      g.fillText('S T R A T U M   4 D   ·   L E A R N', cx, 78 * u);
      g.strokeStyle = '#C9D3DC'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(cx - 150 * u, 92 * u); g.lineTo(cx + 150 * u, 92 * u); g.stroke();
      g.fillStyle = '#0E1F2E';
      g.font = '' + (15 * u) + 'px Calibri';
      g.fillText('This certifies that', cx, 140 * u);
      g.fillStyle = '#16325C';
      var fs = 40 * u;
      g.font = '700 ' + fs + 'px Arial';
      while(g.measureText(nm).width > w - 140 * u && fs > 14 * u){ fs -= 1; g.font = '700 ' + fs + 'px Arial'; }
      g.fillText(nm, cx, 196 * u);
      g.strokeStyle = '#B4862F'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx - 200 * u, 212 * u); g.lineTo(cx + 200 * u, 212 * u); g.stroke();
      g.fillStyle = '#0E1F2E';
      g.font = '' + (15 * u) + 'px Calibri';
      g.fillText('has completed the full programme of study in', cx, 246 * u);
      g.fillStyle = '#2C6B8B';
      g.font = '700 ' + (21 * u) + 'px Arial';
      g.fillText('PROJECT PLANNING AND CONTROLS', cx, 280 * u);
      g.fillStyle = '#5C6B78';
      g.font = '' + (13 * u) + 'px Calibri';
      g.fillText('21 lessons · 4 level reviews · 30-question final assessment', cx, 306 * u);
      var boxW = 150 * u, boxH = 62 * u, gap = 14 * u;
      var items = [
        ['LESSONS', Object.keys(S.read).length + ' of ' + LESSONS.length],
        ['LEVEL REVIEWS', BOSSES.filter(function(b){ return S.bosses[b.id] && S.bosses[b.id].done; }).length + ' of ' + BOSSES.length],
        ['FINAL SCORE', S.master.best + ' / 30']
      ];
      var totalW = items.length * boxW + (items.length - 1) * gap;
      var x0 = cx - totalW / 2, y0 = 336 * u;
      items.forEach(function(it, i){
        var x = x0 + i * (boxW + gap);
        g.strokeStyle = '#C9D3DC'; g.lineWidth = 1;
        g.fillStyle = '#F2F5F8';
        g.fillRect(x, y0, boxW, boxH); g.strokeRect(x, y0, boxW, boxH);
        g.fillStyle = '#5C6B78'; g.font = '700 ' + (9.5 * u) + 'px Arial';
        g.fillText(it[0], x + boxW / 2, y0 + 20 * u);
        g.fillStyle = '#16325C'; g.font = '700 ' + (14 * u) + 'px Consolas';
        var tv = it[1], tfs = 14 * u;
        while(g.measureText(tv).width > boxW - 14 * u && tfs > 8 * u){ tfs -= 0.5; g.font = '700 ' + tfs + 'px Consolas'; }
        g.fillText(tv, x + boxW / 2, y0 + 44 * u);
      });
      var d = new Date();
      var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      g.fillStyle = '#0E1F2E'; g.font = '' + (13 * u) + 'px Calibri';
      g.fillText('Awarded ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear(), cx, ht - 78 * u);
      g.fillStyle = '#5C6B78'; g.font = '' + (10.5 * u) + 'px Consolas';
      g.fillText('Stratum 4D Planning & Controls course — a self-study programme. A record of study, not an accredited qualification.', cx, ht - 50 * u);
    });
  }
  draw();
  q('cn').addEventListener('input', function(){ S.name = this.value; save(); draw(); });
  q('dl').onclick = function(){
    try{
      var a = document.createElement('a');
      a.href = cv.el.toDataURL('image/png');
      a.download = 'stratum-planning-certificate.png';
      document.body.appendChild(a); a.click(); a.remove();
    }catch(e){ say('Download unavailable in this context — use Print instead.'); }
  };
  q('pr').onclick = function(){ window.print(); };
}

/* ==========================================================================
 *  BOOT
 * ========================================================================== */
(function boot(){
  load();

  paintTop();
  var mb = q('menubtn');
  if(mb) mb.onclick = function(){ q('sidebar').classList.toggle('open'); };
  go(S.route && S.route !== 'cert' ? S.route : 'home');
  save();
})();
