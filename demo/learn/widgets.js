/* ============================================================================
   PLANNING & CONTROLS COURSE — widgets.js (from Planner's Guild)
   Part 1: shared drawing helpers
   Part 2: IG — inline SVG infographics embedded in lessons via {ig:"id"}
   Part 3: WIDGETS — 14 live calculators mounted via {w:"id"}

   WIDGET CONTRACT
     WIDGETS[id] = {
       t    : display title
       tag  : short descriptor shown right of the title
       chal : { text:"target the user must hit", test:fn(state)->bool }   (optional)
       mount: fn(bodyEl, ctx)   ctx.report(bool) flags challenge pass/fail
     }
   Every widget recalculates on input event — never on a button press.
   Canvases register with CVS and are redrawn on window resize.
   ========================================================================== */

/* ------------------------------------------------------------- helpers -- */
var CVS = [];   // {cv, fn} — every live canvas, redrawn on resize

function h(tag, attrs, inner){
  var e = document.createElement(tag);
  if(attrs) for(var k in attrs){
    if(k === 'class') e.className = attrs[k];
    else if(k === 'html') e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  if(inner != null) e.innerHTML = inner;
  return e;
}

/* A labelled control. type 'range' also renders a live read-out. */
function fld(label, type, attrs, onIn){
  var w = h('div', {class:'fld'});
  var lab = h('label', null, label);
  var rv = null;
  if(type === 'range'){ rv = h('span', {class:'rv'}); lab.appendChild(rv); }
  w.appendChild(lab);
  var i;
  if(type === 'select'){
    i = h('select');
    (attrs.opts || []).forEach(function(o, ix){
      var op = h('option', {value: o.v != null ? o.v : ix}, o.t != null ? o.t : o);
      i.appendChild(op);
    });
    if(attrs.value != null) i.value = attrs.value;
  } else {
    i = h('input', {type:type});
    for(var k in attrs) if(k !== 'opts') i.setAttribute(k, attrs[k]);
  }
  i.setAttribute('aria-label', label);
  w.appendChild(i);
  function sync(){ if(rv) rv.textContent = ' ' + i.value; }
  i.addEventListener('input', function(){ sync(); onIn && onIn(); });
  i.addEventListener('change', function(){ sync(); onIn && onIn(); });
  sync();
  w.input = i;
  return w;
}

function kpi(k, v, sub, cls){
  return '<div class="kpi ' + (cls || '') + '"><span class="k">' + k + '</span>' +
         '<span class="v">' + v + '</span>' + (sub ? '<span class="s">' + sub + '</span>' : '') + '</div>';
}

function num(v, dp){
  if(!isFinite(v)) return '—';
  return v.toFixed(dp == null ? 2 : dp);
}
function money(v){
  if(!isFinite(v)) return '—';
  return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function pc(v, dp){ return num(v * 100, dp == null ? 1 : dp) + '%'; }

/* Create a canvas that keeps its aspect ratio, handles HiDPI and resize.
   draw(fn) where fn(ctx, w, h) is called with CSS-pixel dimensions.        */
function canvas(parent, ratio, label){
  var wrap = h('div', {class:'cvwrap'});
  var cv = h('canvas');
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', label || 'chart');
  wrap.appendChild(cv);
  parent.appendChild(wrap);
  var drawFn = null;
  function paint(){
    var w = wrap.clientWidth || 600;
    var ht = Math.round(w * ratio);
    var dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(ht * dpr);
    cv.style.width = w + 'px';
    cv.style.height = ht + 'px';
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, ht);
    if(drawFn) drawFn(g, w, ht);
  }
  var rec = {cv:cv, fn:paint};
  CVS.push(rec);
  return {
    el: cv,
    setLabel: function(s){ cv.setAttribute('aria-label', s); },
    draw: function(fn){ drawFn = fn; paint(); },
    repaint: paint
  };
}

var _rz;
window.addEventListener('resize', function(){
  clearTimeout(_rz);
  _rz = setTimeout(function(){
    CVS = CVS.filter(function(r){ return document.body.contains(r.cv); });
    CVS.forEach(function(r){ try{ r.fn(); }catch(e){} });
  }, 120);
});

/* Chart furniture ------------------------------------------------------- */
var C = {
  navy:'#16325C', ink:'#0E1F2E', teal:'#2C6B8B', grn:'#2E7D52',
  amb:'#B4862F', red:'#B03127', vio:'#5B4B8A', rule:'#C9D3DC',
  lt:'#F2F5F8', mute:'#5C6B78'
};

function axes(g, w, ht, pad, xl, yl){
  g.strokeStyle = C.rule; g.lineWidth = 1;
  g.beginPath();
  g.moveTo(pad.l, pad.t); g.lineTo(pad.l, ht - pad.b); g.lineTo(w - pad.r, ht - pad.b);
  g.stroke();
  g.fillStyle = C.mute; g.font = '11px Consolas'; g.textAlign = 'center';
  if(xl) g.fillText(xl, pad.l + (w - pad.l - pad.r) / 2, ht - 4);
  if(yl){
    g.save(); g.translate(10, pad.t + (ht - pad.t - pad.b) / 2);
    g.rotate(-Math.PI / 2); g.fillText(yl, 0, 0); g.restore();
  }
}
function gridY(g, w, ht, pad, n){
  g.strokeStyle = '#EDF1F5'; g.lineWidth = 1;
  for(var i = 1; i <= n; i++){
    var y = pad.t + (ht - pad.t - pad.b) * i / n;
    g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke();
  }
}
function poly(g, pts, col, wd, fill){
  if(!pts.length) return;
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for(var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if(fill){ g.fillStyle = fill; g.fill(); }
  if(col){ g.strokeStyle = col; g.lineWidth = wd || 2; g.stroke(); }
}
function dot(g, x, y, r, col){
  g.beginPath(); g.arc(x, y, r, 0, 6.284); g.fillStyle = col; g.fill();
}
function tx(g, s, x, y, col, font, align){
  g.fillStyle = col || C.ink; g.font = font || '11px Consolas';
  g.textAlign = align || 'left'; g.fillText(s, x, y);
}

/* ==========================================================================
 *  PART 2 — IG : inline SVG infographics
 *  Each returns a complete <svg> string. Colours use CSS custom properties
 *  so the diagrams follow the design system automatically.
 * ========================================================================== */

function svg(vb, inner, label){
  return '<figure class="ig" role="img" aria-label="' + (label || '') + '">' +
    '<svg viewBox="' + vb + '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' +
    '<style>' +
      '.ig-t{font:700 13px Arial;fill:var(--navy)}' +
      '.ig-s{font:11px Consolas;fill:var(--mute)}' +
      '.ig-l{font:700 11px Arial;fill:#fff}' +
      '.ig-k{font:700 12px Consolas;fill:var(--navy)}' +
      '.ig-b{font:11px Calibri;fill:var(--ink)}' +
      '.ig-box{fill:#fff;stroke:var(--rule)}' +
    '</style>' + inner + '</svg></figure>';
}
function bar(x, y, w, hh, fill, rx){
  return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hh + '" fill="' + fill + '" rx="' + (rx == null ? 3 : rx) + '"/>';
}
function box(x, y, w, hh, stroke, fill){
  return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hh + '" fill="' + (fill || '#fff') + '" stroke="' + (stroke || 'var(--rule)') + '" rx="4"/>';
}
function t(x, y, s, cls, anchor){
  return '<text x="' + x + '" y="' + y + '" class="' + (cls || 'ig-b') + '"' +
    (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + s + '</text>';
}
function arrow(x1, y1, x2, y2, col){
  return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
    '" stroke="' + (col || 'var(--navy)') + '" stroke-width="1.6" marker-end="url(#ah)"/>';
}
var AH = '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">' +
         '<path d="M0,0 L10,5 L0,10 z" fill="var(--navy)"/></marker>' +
         '<marker id="ahr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">' +
         '<path d="M0,0 L10,5 L0,10 z" fill="var(--red)"/></marker></defs>';

var IG = {};

/* ---- L1 : project lifecycle vs planning leverage ---------------------- */
IG.lifecycle = function(){
  var ph = [['Tender','Very high',0.95],['Award','Very high',0.90],['Eng &amp; Proc','High',0.68],
            ['Construction','Moderate',0.42],['T &amp; C','Moderate',0.28],['Close-out','Low',0.10]];
  var s = AH, x = 60, bw = 108;
  s += t(400, 18, 'PLANNING LEVERAGE DECAYS AS COMMITMENTS ARE MADE', 'ig-t', 'middle');
  var pts = [];
  ph.forEach(function(p, i){
    var px = x + i * bw;
    s += box(px, 130, bw - 8, 44, 'var(--rule)', i < 2 ? '#EAF2F6' : '#fff');
    s += t(px + (bw - 8) / 2, 150, p[0], 'ig-k', 'middle');
    s += t(px + (bw - 8) / 2, 166, p[1], 'ig-s', 'middle');
    pts.push([px + (bw - 8) / 2, 118 - p[2] * 74]);
  });
  s += '<polyline points="' + pts.map(function(p){return p[0] + ',' + p[1];}).join(' ') +
       '" fill="none" stroke="var(--red)" stroke-width="2.5"/>';
  pts.forEach(function(p){ s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" fill="var(--red)"/>'; });
  s += '<line x1="' + (x - 12) + '" y1="120" x2="' + (x - 12) + '" y2="40" stroke="var(--rule)"/>';
  s += t(x - 18, 46, 'high', 'ig-s', 'end') + t(x - 18, 118, 'low', 'ig-s', 'end');
  s += t(x - 18, 82, 'leverage', 'ig-s', 'end');
  s += t(400, 194, 'Workload runs the opposite way — busiest when you can change least', 'ig-s', 'middle');
  return svg('0 0 800 205', s, 'Chart showing planning leverage highest at tender and decaying through to close-out, while workload increases');
};

/* ---- L2 : WBS tree and the 100% rule --------------------------------- */
IG.wbstree = function(){
  var s = AH;
  s += t(400, 18, 'DELIVERABLE-ORIENTED DECOMPOSITION — THE 100% RULE', 'ig-t', 'middle');
  s += box(300, 32, 200, 34, 'var(--navy)', '#EEF3F9');
  s += t(400, 53, '220/33kV Substation — 100%', 'ig-k', 'middle');
  var ch = [['Civil works','32%','var(--teal)'],['GIS &amp; equipment','41%','var(--grn)'],
            ['Protection &amp; control','14%','var(--amb)'],['Testing &amp; comm.','13%','var(--vio)']];
  ch.forEach(function(c, i){
    var x = 30 + i * 192;
    s += '<line x1="400" y1="66" x2="' + (x + 86) + '" y2="96" stroke="var(--rule)" stroke-width="1.4"/>';
    s += box(x, 96, 172, 40, c[2]);
    s += t(x + 86, 113, c[0], 'ig-k', 'middle');
    s += t(x + 86, 129, c[1], 'ig-s', 'middle');
  });
  s += '<line x1="30" y1="152" x2="770" y2="152" stroke="var(--rule)" stroke-dasharray="3 3"/>';
  s += t(400, 172, '32 + 41 + 14 + 13 = 100 — no more, no less', 'ig-k', 'middle');
  s += t(400, 190, 'Short of 100% and scope falls through the floor. Over 100% and progress is double-counted.', 'ig-s', 'middle');
  return svg('0 0 800 200', s, 'WBS tree showing a substation decomposed into four children summing to exactly 100 percent');
};

/* ---- L3 : effort vs duration ----------------------------------------- */
IG.effort = function(){
  var s = AH;
  s += t(400, 18, 'EFFORT IS A PROPERTY OF THE WORK. DURATION IS NOT.', 'ig-t', 'middle');
  [[0, '4 persons × 10 h', 6, 'var(--teal)'], [1, '8 persons × 10 h', 3, 'var(--grn)']].forEach(function(r){
    var y = 44 + r[0] * 66;
    s += t(20, y + 20, r[1], 'ig-k');
    for(var d = 0; d < r[2]; d++){
      s += bar(200 + d * 84, y, 78, 34, r[3]);
      s += t(200 + d * 84 + 39, y + 22, 'day ' + (d + 1), 'ig-l', 'middle');
    }
    s += t(200 + r[2] * 84 + 12, y + 22, r[2] + ' days', 'ig-k');
  });
  s += '<line x1="20" y1="178" x2="780" y2="178" stroke="var(--rule)"/>';
  s += t(20, 196, 'Effort = 240 man-hours in BOTH cases. Only the crew changed.', 'ig-k');
  s += t(430, 196, 'Curing and HV withstand tests do not divide — physics has no crew size.', 'ig-s');
  return svg('0 0 800 205', s, 'Diagram showing 240 man-hours taking six days with four people or three days with eight');
};

/* ---- L4 : the four relationship types --------------------------------- */
IG.rel4 = function(){
  var s = AH, rows = [['FS','B starts after A finishes', 0, 120],
                      ['SS','B starts after A starts', -100, 60],
                      ['FF','B finishes when A finishes', -40, 120],
                      ['SF','B finishes after A starts', -150, 40]];
  s += t(400, 18, 'THE FOUR RELATIONSHIP TYPES', 'ig-t', 'middle');
  rows.forEach(function(r, i){
    var y = 36 + i * 42;
    s += t(22, y + 20, r[0], 'ig-k');
    s += bar(60, y + 6, 120, 22, 'var(--navy)');
    s += t(120, y + 21, 'A', 'ig-l', 'middle');
    var bx = 180 + r[2];
    s += bar(bx, y + 6, r[3], 22, i === 0 ? 'var(--teal)' : (i === 3 ? 'var(--red)' : 'var(--grn)'));
    s += t(bx + r[3] / 2, y + 21, 'B', 'ig-l', 'middle');
    s += t(360, y + 21, r[1], 'ig-b');
    s += t(690, y + 21, i === 0 ? '≈90% of a healthy network' : (i === 3 ? 'very rare' : 'overlapping work'), 'ig-s');
  });
  s += '<line x1="20" y1="212" x2="780" y2="212" stroke="var(--rule)"/>';
  s += t(20, 230, 'The SS + FF pair constrains BOTH ends — the only correct model for a pursuit relationship.', 'ig-k');
  return svg('0 0 800 238', s, 'Bar diagram of finish-to-start, start-to-start, finish-to-finish and start-to-finish relationships');
};

/* ---- L5 : total float is shared along a chain ------------------------- */
IG.floatchain = function(){
  var s = AH;
  s += t(400, 18, 'TOTAL FLOAT IS SHARED ALONG THE CHAIN — NOT OWNED PER ACTIVITY', 'ig-t', 'middle');
  ['P', 'Q', 'R'].forEach(function(n, i){
    var x = 60 + i * 150;
    s += bar(x, 44, 130, 30, 'var(--teal)');
    s += t(x + 65, 64, n + ' — TF 6d', 'ig-l', 'middle');
  });
  s += bar(510, 44, 132, 30, '#E3E9EF', 3);
  s += t(576, 64, '6 days float', 'ig-k', 'middle');
  s += t(660, 64, 'shared', 'ig-s');
  s += t(20, 100, 'Three activities each showing 6 days of float — there are 6 days available, not 18.', 'ig-b');
  s += '<line x1="20" y1="112" x2="780" y2="112" stroke="var(--rule)" stroke-dasharray="3 3"/>';
  s += t(400, 134, 'P consumes all 6 days →', 'ig-k', 'end');
  ['P', 'Q', 'R'].forEach(function(n, i){
    var x = 410 + i * 118;
    s += bar(x, 122, 100, 26, i === 0 ? 'var(--amb)' : 'var(--red)');
    s += t(x + 50, 139, n + (i === 0 ? ' +6d' : ' TF 0'), 'ig-l', 'middle');
  });
  s += t(20, 172, 'Q and R drop to zero float immediately and are now critical. Nobody was told.', 'ig-k');
  s += t(20, 190, 'Free float, by contrast, belongs to the activity alone — using it affects no successor.', 'ig-s');
  return svg('0 0 800 198', s, 'Diagram showing six days of total float shared across three activities, consumed entirely by the first');
};

/* ---- L6 : the working day ---------------------------------------------- */
IG.calday = function(){
  var s = AH, x0 = 60, x1 = 740, span = x1 - x0;
  s += t(400, 18, 'GROSS SPAN IS NOT NET WORKING TIME', 'ig-t', 'middle');
  s += bar(x0, 36, span, 30, 'var(--rule)');
  s += t(400, 56, '07:00 → 17:00   gross span = 10 hours', 'ig-k', 'middle');
  var bs = x0 + span * 0.5, bw = span * 0.1;
  s += bar(x0, 84, bs - x0, 34, 'var(--teal)');
  s += t((x0 + bs) / 2, 105, '07:00 – 12:00   5 h', 'ig-l', 'middle');
  s += bar(bs, 84, bw, 34, 'var(--red)');
  s += t(bs + bw / 2, 105, 'break', 'ig-l', 'middle');
  s += bar(bs + bw, 84, x1 - bs - bw, 34, 'var(--teal)');
  s += t((bs + bw + x1) / 2, 105, '13:00 – 17:00   4 h', 'ig-l', 'middle');
  s += t(400, 140, 'NET WORKING TIME = 9 HOURS', 'ig-k', 'middle');
  s += box(60, 152, 340, 44, 'var(--red)', '#FDF4F3');
  s += t(230, 170, 'Calendar built at 10 h/day', 'ig-k', 'middle');
  s += t(230, 187, 'every duration optimistic by 11%', 'ig-s', 'middle');
  s += box(420, 152, 320, 44, 'var(--grn)', '#F2F9F5');
  s += t(580, 170, 'Enter working time as two blocks', 'ig-k', 'middle');
  s += t(580, 187, 'not one continuous span', 'ig-s', 'middle');
  return svg('0 0 800 205', s, 'Timeline showing a ten hour gross span reduced to nine net working hours by a one hour break');
};

/* ---- L7 : schedule levels pyramid ------------------------------------- */
IG.levels = function(){
  var s = AH, L = [['1','Project master / executive','10–25 lines','Board &amp; client executive','var(--navy)'],
                   ['2','Summary / management','50–150','Project director','var(--teal)'],
                   ['3','Control / BASELINE','800–5,000','Project team','var(--grn)'],
                   ['4','Detail / execution','varies','Construction managers','var(--amb)'],
                   ['5','Short-interval / look-ahead','varies','Foremen and crews','var(--vio)']];
  s += t(400, 18, 'ONE DATASET, FIVE RESOLUTIONS', 'ig-t', 'middle');
  L.forEach(function(l, i){
    var w = 160 + i * 90, x = 400 - w / 2, y = 32 + i * 38;
    s += bar(x, y, w, 32, l[4]);
    s += t(400, y + 21, 'L' + l[0] + '  ' + l[1], 'ig-l', 'middle');
    s += t(x - 10, y + 21, l[2], 'ig-s', 'end');
    s += t(x + w + 10, y + 21, l[3], 'ig-s');
  });
  s += '<line x1="60" y1="232" x2="740" y2="232" stroke="var(--rule)"/>';
  s += t(400, 252, 'Level 3 is the contractual programme — baselined, measured, and analysed in a dispute.', 'ig-k', 'middle');
  s += t(400, 270, 'Levels 1–2 roll UP from it. Levels 4–5 drill DOWN into it. Never maintained separately.', 'ig-s', 'middle');
  return svg('0 0 800 278', s, 'Pyramid of the five schedule levels from executive summary to short interval look-ahead');
};

/* ---- L7 : what a baseline freezes -------------------------------------- */
IG.baseline = function(){
  var s = AH;
  s += t(400, 18, 'A BASELINE FREEZES THREE THINGS TOGETHER', 'ig-t', 'middle');
  [['Scope baseline','WBS, dictionary,\nscope statement','var(--vio)'],
   ['Schedule baseline','dates, durations,\nlogic','var(--teal)'],
   ['Cost baseline','time-phased budget\n= the PV curve','var(--grn)']].forEach(function(b, i){
    var x = 40 + i * 250;
    s += box(x, 34, 220, 66, b[2], '#fff');
    s += '<rect x="' + x + '" y="34" width="6" height="66" fill="' + b[2] + '" rx="2"/>';
    s += t(x + 18, 56, b[0], 'ig-k');
    b[1].split('\n').forEach(function(ln, j){ s += t(x + 18, 74 + j * 15, ln, 'ig-s'); });
    if(i < 2) s += t(x + 234, 72, '+', 'ig-t', 'middle');
  });
  s += box(40, 116, 430, 62, 'var(--grn)', '#F2F9F5');
  s += t(56, 136, 'MAY change for:', 'ig-k');
  s += t(56, 153, 'approved variation · granted EOT · agreed error', 'ig-s');
  s += t(56, 170, 'Keep every prior version — the sequence is evidence.', 'ig-s');
  s += box(486, 116, 274, 62, 'var(--red)', '#FDF4F3');
  s += t(502, 136, 'MUST NOT change for:', 'ig-k');
  s += t(502, 153, 'being behind schedule.', 'ig-s');
  s += t(502, 170, 'That deletes your own EOT evidence.', 'ig-s');
  return svg('0 0 800 186', s, 'Diagram of the three components of a baseline and the valid and invalid reasons to change it');
};

/* ---- L8 : the two-resource structure ----------------------------------- */
IG.tworesource = function(){
  var s = AH;
  s += t(400, 18, 'WHY PROGRESS AND MONEY NEED SEPARATE RESOURCES', 'ig-t', 'middle');
  s += box(40, 34, 350, 116, 'var(--teal)', '#F1F7FA');
  s += t(58, 56, 'RESOURCE 1 — WEIGHTAGE', 'ig-k');
  s += t(58, 76, 'Type: Labour   ·   Unit price: 1.00', 'ig-s');
  s += t(58, 96, 'Units = the activity’s share of progress.', 'ig-b');
  s += t(58, 114, 'Price of 1.00 makes budgeted cost = budgeted units,', 'ig-b');
  s += t(58, 132, 'so Performance % Complete reads weighted progress.', 'ig-b');
  s += box(410, 34, 350, 116, 'var(--grn)', '#F2F9F5');
  s += t(428, 56, 'RESOURCE 2 — COST', 'ig-k');
  s += t(428, 76, 'Type: Material   ·   Unit price: contract rate', 'ig-s');
  s += t(428, 96, 'Carries contract value, payment milestones', 'ig-b');
  s += t(428, 114, 'and cash flow. Commercial revisions here never', 'ig-b');
  s += t(428, 132, 'disturb the progress measurement basis.', 'ig-b');
  s += box(40, 162, 720, 44, 'var(--amb)', '#FCF8EF');
  s += t(58, 182, 'Mobilisation may be 8% of cash flow and 1% of physical work.', 'ig-k');
  s += t(58, 199, 'A payment milestone may fall on a date with no physical work at all. One resource cannot describe both honestly.', 'ig-s');
  return svg('0 0 800 214', s, 'Diagram of the two resource structure separating weightage from cost');
};

/* ---- L9 : weightage IS earned value ------------------------------------ */
IG.weightage = function(){
  var s = AH;
  s += t(400, 18, 'WEIGHTAGE AND EARNED VALUE ARE THE SAME IDEA', 'ig-t', 'middle');
  var rows = [['A', 400000, 1.00], ['B', 1000000, 0.45], ['C', 600000, 0.10]];
  var tot = 2000000, y0 = 40;
  s += t(40, y0, 'Activity', 'ig-s'); s += t(120, y0, 'Budget', 'ig-s');
  s += t(230, y0, 'Weightage', 'ig-s'); s += t(330, y0, '% complete', 'ig-s');
  s += t(430, y0, 'Earned', 'ig-s');
  rows.forEach(function(r, i){
    var y = y0 + 24 + i * 32;
    s += t(40, y, r[0], 'ig-k');
    s += t(120, y, money(r[1]), 'ig-b');
    s += t(230, y, pc(r[1] / tot, 0), 'ig-b');
    s += t(330, y, pc(r[2], 0), 'ig-b');
    s += t(430, y, money(r[1] * r[2]), 'ig-b');
    s += bar(520, y - 12, 240 * (r[1] / tot), 15, 'var(--rule)');
    s += bar(520, y - 12, 240 * (r[1] / tot) * r[2], 15, 'var(--grn)');
  });
  s += '<line x1="40" y1="145" x2="760" y2="145" stroke="var(--rule)"/>';
  s += t(40, 166, 'Weighted % complete = 910,000 ÷ 2,000,000 = 45.5%', 'ig-k');
  s += t(430, 166, 'Straight average of 100, 45 and 10 = 51.7% — wrong by 6 points', 'ig-s');
  s += box(40, 178, 720, 34, 'var(--vio)', '#F6F4FA');
  s += t(400, 200, 'EV = weighted % × BAC     ·     weighted % = EV ÷ BAC     ·     same statement, different units', 'ig-k', 'middle');
  return svg('0 0 800 220', s, 'Table showing weighted percent complete computed from budgets and demonstrating it equals earned value');
};

/* ---- L10 : the data date ----------------------------------------------- */
IG.datadate = function(){
  var s = AH, dd = 420;
  s += t(400, 18, 'THE DATA DATE SEPARATES FACT FROM FORECAST', 'ig-t', 'middle');
  s += '<rect x="40" y="32" width="' + (dd - 40) + '" height="132" fill="#F4F8FA"/>';
  s += '<rect x="' + dd + '" y="32" width="' + (760 - dd) + '" height="132" fill="#FCFCFD"/>';
  s += '<line x1="' + dd + '" y1="26" x2="' + dd + '" y2="172" stroke="var(--red)" stroke-width="2.5"/>';
  s += t(dd, 20, 'DATA DATE', 'ig-k', 'middle');
  s += t(200, 48, 'ACTUAL — what happened', 'ig-s', 'middle');
  s += t(590, 48, 'FORECAST — what is planned', 'ig-s', 'middle');
  var rows = [['A-1010', 90, 300, 'ok', 'complete'],
              ['A-1020', 200, 520, 'ok', 'in progress — split at the data date'],
              ['A-1030', 470, 700, 'ok', 'not started'],
              ['A-1040', 250, 390, 'bad', 'remaining work LEFT of the data date']];
  rows.forEach(function(r, i){
    var y = 62 + i * 26;
    s += t(44, y + 13, r[0], 'ig-s');
    var x1 = r[1], x2 = r[2];
    if(x1 < dd) s += bar(x1, y, Math.min(x2, dd) - x1, 16, r[3] === 'bad' ? 'var(--red)' : 'var(--navy)');
    if(x2 > dd) s += bar(Math.max(x1, dd), y, x2 - Math.max(x1, dd), 16, r[3] === 'bad' ? 'var(--red)' : 'var(--teal)');
    if(r[3] === 'bad'){
      s += '<rect x="' + x1 + '" y="' + (y - 3) + '" width="' + (x2 - x1) + '" height="22" fill="none" stroke="var(--red)" stroke-dasharray="3 2"/>';
    }
    s += t(712, y + 13, r[4], 'ig-s', 'end');
  });
  s += t(40, 186, 'No remaining work left of it. No actual dates right of it. It must match the date the progress was collected.', 'ig-k');
  return svg('0 0 800 194', s, 'Timeline showing the data date dividing actual from forecast work with one invalid activity highlighted');
};

/* ---- L10 : retained logic vs progress override -------------------------- */
IG.retained = function(){
  var s = AH;
  s += t(400, 18, 'OUT-OF-SEQUENCE WORK: TWO SETTINGS, TWO ANSWERS', 'ig-t', 'middle');
  [['RETAINED LOGIC', 'var(--teal)', 34, 'Remaining B waits for A to finish', 'later finish — safer for delay analysis', 300, 470],
   ['PROGRESS OVERRIDE', 'var(--amb)', 124, 'Remaining B proceeds regardless', 'earlier finish — reflects site reality', 210, 380]
  ].forEach(function(r){
    var y = r[2];
    s += t(40, y + 14, r[0], 'ig-k');
    s += bar(190, y, 110, 18, 'var(--navy)'); s += t(245, y + 13, 'A done', 'ig-l', 'middle');
    s += bar(300, y, 90, 18, '#B9C7D4'); s += t(345, y + 13, 'A remain', 'ig-l', 'middle');
    s += bar(190, y + 24, 70, 18, 'var(--navy)'); s += t(225, y + 37, 'B started', 'ig-l', 'middle');
    s += bar(r[5], y + 24, r[6] - r[5], 18, r[1]); s += t((r[5] + r[6]) / 2, y + 37, 'B remaining', 'ig-l', 'middle');
    s += '<line x1="' + r[6] + '" y1="' + (y - 6) + '" x2="' + r[6] + '" y2="' + (y + 48) + '" stroke="' + r[1] + '" stroke-width="2" stroke-dasharray="3 2"/>';
    s += t(r[6] + 8, y + 16, r[3], 'ig-s');
    s += t(r[6] + 8, y + 32, r[4], 'ig-s');
  });
  s += '<line x1="40" y1="188" x2="760" y2="188" stroke="var(--rule)"/>';
  s += t(40, 208, 'Pick one, state it in the basis of schedule, and never switch mid-project — the finish date would move for no reason connected to performance.', 'ig-k');
  return svg('0 0 800 216', s, 'Comparison of retained logic and progress override showing different finish dates for the same out of sequence work');
};

/* ---- L11 : S-curve anatomy --------------------------------------------- */
IG.scurve = function(){
  var s = AH, x0 = 60, x1 = 640, y0 = 40, y1 = 176, w = x1 - x0, hh = y1 - y0;
  s += t(400, 18, 'S-CURVE ANATOMY — AND WHERE THE PEAK SITS', 'ig-t', 'middle');
  s += '<line x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '" stroke="var(--rule)"/>';
  s += '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x0 + '" y2="' + y1 + '" stroke="var(--rule)"/>';
  var pts = [], bars = '';
  for(var i = 0; i <= 40; i++){
    var u = i / 40;
    var cum = 1 / (1 + Math.exp(-11 * (u - 0.52)));
    pts.push((x0 + u * w) + ',' + (y1 - cum * hh));
  }
  for(var j = 0; j < 20; j++){
    var u1 = j / 20, u2 = (j + 1) / 20;
    var d = 1 / (1 + Math.exp(-11 * (u2 - 0.52))) - 1 / (1 + Math.exp(-11 * (u1 - 0.52)));
    var bh = d * hh * 3.4;
    bars += bar(x0 + u1 * w + 1, y1 - bh, w / 20 - 2, bh, '#D7E2EA', 1);
  }
  s += bars;
  s += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--teal)" stroke-width="2.8"/>';
  var px = x0 + 0.52 * w;
  s += '<line x1="' + px + '" y1="' + y0 + '" x2="' + px + '" y2="' + y1 + '" stroke="var(--red)" stroke-dasharray="4 3"/>';
  s += t(px, y0 - 6, 'PERIODIC PEAK ≈ 50–65% ELAPSED', 'ig-k', 'middle');
  s += t(x0 + 40, y1 - 14, 'toe', 'ig-s'); s += t(px + 8, y1 - 90, 'rise', 'ig-s');
  s += t(x1 - 60, y1 - 128, 'shoulder', 'ig-s');
  s += t(x0 - 6, y0 + 6, '100%', 'ig-s', 'end'); s += t(x0 - 6, y1, '0%', 'ig-s', 'end');
  s += t((x0 + x1) / 2, y1 + 18, 'elapsed duration →', 'ig-s', 'middle');
  s += box(656, 40, 128, 136, 'var(--rule)', '#fff');
  s += t(720, 60, 'SHAPES', 'ig-k', 'middle');
  [['Normal', 'var(--grn)'], ['Front-loaded', 'var(--amb)'], ['Back-loaded', 'var(--red)'], ['Linear', 'var(--mute)']].forEach(function(sh, k){
    s += '<rect x="666" y="' + (72 + k * 26) + '" width="10" height="10" fill="' + sh[1] + '" rx="2"/>';
    s += t(682, 82 + k * 26, sh[0], 'ig-s');
  });
  s += t(400, 200, 'The periodic peak is never at handover. A histogram peaking in the final months is a warning, not a curve.', 'ig-k', 'middle');
  return svg('0 0 800 210', s, 'S-curve with periodic histogram beneath showing the peak in mid-project');
};

/* ---- L11 : the two gaps ------------------------------------------------ */
IG.twogaps = function(){
  var s = AH, x0 = 70, x1 = 700, y0 = 36, y1 = 168, w = x1 - x0, hh = y1 - y0;
  s += t(400, 18, 'THE VERTICAL GAP IS MONEY. THE HORIZONTAL GAP IS TIME.', 'ig-t', 'middle');
  s += '<line x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '" stroke="var(--rule)"/>';
  s += '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x0 + '" y2="' + y1 + '" stroke="var(--rule)"/>';
  function curve(shift, col, wd, dash){
    var p = [];
    for(var i = 0; i <= 40; i++){
      var u = i / 40;
      var c = 1 / (1 + Math.exp(-10 * (u - 0.5 - shift)));
      p.push((x0 + u * w) + ',' + (y1 - c * hh));
    }
    return '<polyline points="' + p.join(' ') + '" fill="none" stroke="' + col + '" stroke-width="' + wd + '"' +
           (dash ? ' stroke-dasharray="5 4"' : '') + '/>';
  }
  s += curve(0, 'var(--navy)', 2.6, false);
  s += curve(0.17, 'var(--red)', 2.6, true);
  var uNow = 0.62, xn = x0 + uNow * w;
  var pvN = 1 / (1 + Math.exp(-10 * (uNow - 0.5)));
  var evN = 1 / (1 + Math.exp(-10 * (uNow - 0.67)));
  var yPV = y1 - pvN * hh, yEV = y1 - evN * hh;
  var uES = 0.5 + Math.log(evN / (1 - evN)) / 10, xe = x0 + uES * w;
  s += '<line x1="' + xn + '" y1="' + y0 + '" x2="' + xn + '" y2="' + y1 + '" stroke="var(--rule)" stroke-dasharray="3 3"/>';
  s += t(xn, y1 + 16, 'today', 'ig-k', 'middle');
  s += '<line x1="' + xn + '" y1="' + yPV + '" x2="' + xn + '" y2="' + yEV + '" stroke="var(--amb)" stroke-width="6"/>';
  s += t(xn + 12, (yPV + yEV) / 2, 'VERTICAL GAP = SV  “we are 7% behind”', 'ig-k');
  s += '<line x1="' + xe + '" y1="' + yEV + '" x2="' + xn + '" y2="' + yEV + '" stroke="var(--vio)" stroke-width="6"/>';
  s += t(xe - 8, yEV - 8, 'HORIZONTAL GAP = SV(t)', 'ig-k', 'end');
  s += t(xe - 8, yEV + 10, '“we are eleven weeks behind”', 'ig-s', 'end');
  s += '<circle cx="' + xe + '" cy="' + yEV + '" r="4.5" fill="var(--vio)"/>';
  s += t(xe, y1 + 16, 'ES', 'ig-k', 'middle');
  s += '<rect x="712" y="40" width="12" height="4" fill="var(--navy)"/>' + t(730, 46, 'PV', 'ig-s');
  s += '<rect x="712" y="60" width="12" height="4" fill="var(--red)"/>' + t(730, 66, 'EV', 'ig-s');
  s += t(70, 194, 'Only one of these is a sentence a project director can act on — and it is not the one in currency.', 'ig-k');
  return svg('0 0 800 202', s, 'Planned versus earned curves showing the vertical schedule variance gap and the horizontal earned schedule gap');
};

/* ---- L12 : PV, EV, AC -------------------------------------------------- */
IG.evm3 = function(){
  var s = AH;
  s += t(400, 18, 'THREE QUANTITIES — AND THE ONE PEOPLE GET WRONG', 'ig-t', 'middle');
  [['PV', 'Planned Value', 'BCWS', 'What we SAID we would have done by now', 'var(--navy)'],
   ['EV', 'Earned Value', 'BCWP', 'What we HAVE done — valued at BUDGET', 'var(--grn)'],
   ['AC', 'Actual Cost', 'ACWP', 'What we SPENT doing it', 'var(--red)']
  ].forEach(function(r, i){
    var y = 34 + i * 46;
    s += bar(40, y, 54, 36, r[4]);
    s += t(67, y + 23, r[0], 'ig-l', 'middle');
    s += t(106, y + 16, r[1], 'ig-k');
    s += t(106, y + 32, r[2], 'ig-s');
    s += t(230, y + 24, r[3], 'ig-b');
  });
  s += box(40, 180, 720, 62, 'var(--red)', '#FDF4F3');
  s += t(58, 200, 'THE ERROR THAT DESTROYS THE TECHNIQUE', 'ig-k');
  s += t(58, 219, 'Activity budgeted AED 100,000 · actually cost AED 160,000 · now complete.', 'ig-b');
  s += t(58, 236, 'EV = 100,000 — NOT 160,000. The overspend belongs in AC. Confusing them makes CPI permanently 1.00.', 'ig-b');
  return svg('0 0 800 250', s, 'Definitions of planned value, earned value and actual cost with the common error highlighted');
};

/* ---- L12 : the 2x2 quadrant ------------------------------------------- */
IG.evmquad = function(){
  var s = AH, cx = 400, cy = 130, W = 300, H = 90;
  s += t(400, 18, 'THE 2×2 DIAGNOSIS', 'ig-t', 'middle');
  var q = [[-1, -1, 'SPI &lt;1  ·  CPI &gt;1', 'Behind, under budget', 'Under-resourced —', 'add people, budget allows', 'var(--amb)'],
           [1, -1, 'SPI &gt;1  ·  CPI &gt;1', 'Ahead, under budget', 'Good — or progress', 'is overstated. Verify it', 'var(--grn)'],
           [-1, 1, 'SPI &lt;1  ·  CPI &lt;1', 'Behind AND over', 'Productivity failure,', 'rework or disruption', 'var(--red)'],
           [1, 1, 'SPI &gt;1  ·  CPI &lt;1', 'Ahead, over budget', 'Buying the schedule —', 'fine if it is a decision', 'var(--vio)']];
  q.forEach(function(o){
    var x = cx + (o[0] < 0 ? -W - 4 : 4), y = cy + (o[1] < 0 ? -H - 4 : 4);
    s += box(x, y, W, H, o[6], '#fff');
    s += '<rect x="' + x + '" y="' + y + '" width="' + W + '" height="5" fill="' + o[6] + '"/>';
    s += t(x + 14, y + 26, o[2], 'ig-k');
    s += t(x + 14, y + 44, o[3], 'ig-s');
    s += t(x + 14, y + 64, o[4], 'ig-b');
    s += t(x + 14, y + 80, o[5], 'ig-b');
  });
  s += t(400, 240, 'SPI &lt;1 with CPI &gt;1 is the one people misread — it looks bad and is the easiest to fix.', 'ig-k', 'middle');
  return svg('0 0 800 250', s, 'Two by two matrix of schedule and cost performance index combinations with management responses');
};

/* ---- L13 : SPI converges ----------------------------------------------- */
IG.spiconverge = function(){
  var s = AH, x0 = 70, x1 = 500, y0 = 40, y1 = 170, w = x1 - x0, hh = y1 - y0;
  s += t(400, 18, 'SPI DRIFTS TO 1.00 ON A LATE PROJECT — SPI(t) DOES NOT', 'ig-t', 'middle');
  s += '<line x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '" stroke="var(--rule)"/>';
  s += '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x0 + '" y2="' + y1 + '" stroke="var(--rule)"/>';
  var yOne = y1 - 0.75 * hh;
  s += '<line x1="' + x0 + '" y1="' + yOne + '" x2="' + x1 + '" y2="' + yOne + '" stroke="var(--rule)" stroke-dasharray="4 3"/>';
  s += t(x0 - 6, yOne + 4, '1.00', 'ig-s', 'end');
  var a = [], b = [];
  for(var i = 0; i <= 30; i++){
    var u = i / 30;
    var spi = 0.72 + 0.28 * Math.pow(u, 2.6);
    var spit = 0.74 - 0.02 * u;
    a.push((x0 + u * w) + ',' + (y1 - (spi * 0.75) * hh));
    b.push((x0 + u * w) + ',' + (y1 - (spit * 0.75) * hh));
  }
  s += '<polyline points="' + a.join(' ') + '" fill="none" stroke="var(--red)" stroke-width="2.6"/>';
  s += '<polyline points="' + b.join(' ') + '" fill="none" stroke="var(--grn)" stroke-width="2.6"/>';
  s += t(x1 + 6, y1 - 0.75 * hh + 4, 'SPI → 1.00', 'ig-k');
  s += t(x1 + 6, y1 - 0.54 * hh + 4, 'SPI(t) stays honest', 'ig-k');
  s += t((x0 + x1) / 2, y1 + 18, 'elapsed duration →', 'ig-s', 'middle');
  s += box(540, 46, 244, 120, 'var(--navy)', '#EEF3F9');
  s += t(556, 68, 'AT COMPLETION', 'ig-k');
  s += t(556, 90, 'EV = BAC  and  PV = BAC', 'ig-s');
  s += t(556, 108, 'SPI = BAC ÷ BAC = 1.00', 'ig-s');
  s += t(556, 126, 'SV = 0', 'ig-s');
  s += t(556, 150, 'A project six months late reports', 'ig-b');
  s += t(556, 164, 'perfect schedule performance.', 'ig-b');
  return svg('0 0 800 200', s, 'Chart showing SPI rising toward 1.00 on a late project while SPI of time remains flat');
};

/* ---- L13 : earned schedule interpolation -------------------------------- */
IG.esgap = function(){
  var s = AH, x0 = 70, x1 = 620, y0 = 36, y1 = 168, w = x1 - x0, hh = y1 - y0;
  s += t(400, 18, 'READING EARNED SCHEDULE OFF THE PLANNED VALUE CURVE', 'ig-t', 'middle');
  s += '<line x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '" stroke="var(--rule)"/>';
  s += '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x0 + '" y2="' + y1 + '" stroke="var(--rule)"/>';
  var pv = [[9, 36], [10, 40], [11, 45], [12, 51], [13, 57.5], [14, 64]];
  function X(m){ return x0 + (m - 9) / 5 * w; }
  function Y(v){ return y1 - (v - 30) / 40 * hh; }
  s += '<polyline points="' + pv.map(function(p){return X(p[0]) + ',' + Y(p[1]);}).join(' ') +
       '" fill="none" stroke="var(--navy)" stroke-width="2.6"/>';
  pv.forEach(function(p){
    s += '<circle cx="' + X(p[0]) + '" cy="' + Y(p[1]) + '" r="3.4" fill="var(--navy)"/>';
    s += t(X(p[0]), y1 + 16, 'M' + p[0], 'ig-s', 'middle');
  });
  var EV = 41, xe = X(10.2), ye = Y(EV);
  s += '<line x1="' + x0 + '" y1="' + ye + '" x2="' + X(14) + '" y2="' + ye + '" stroke="var(--red)" stroke-width="2" stroke-dasharray="5 4"/>';
  s += t(x0 - 6, ye + 4, 'EV 41', 'ig-s', 'end');
  s += '<circle cx="' + xe + '" cy="' + ye + '" r="5" fill="var(--vio)"/>';
  s += '<line x1="' + xe + '" y1="' + ye + '" x2="' + xe + '" y2="' + y1 + '" stroke="var(--vio)" stroke-width="2"/>';
  s += t(xe, y0 + 4, 'ES = 10.20', 'ig-k', 'middle');
  s += '<line x1="' + xe + '" y1="' + (y1 - 10) + '" x2="' + X(14) + '" y2="' + (y1 - 10) + '" stroke="var(--amb)" stroke-width="5"/>';
  s += t((xe + X(14)) / 2, y1 - 16, 'SV(t) = −3.80 months', 'ig-k', 'middle');
  s += box(636, 40, 148, 132, 'var(--rule)', '#fff');
  s += t(710, 60, 'AT MONTH 14', 'ig-k', 'middle');
  s += t(650, 82, 'C  = 10', 'ig-s');
  s += t(650, 100, 'I  = (41−40)/(45−40)', 'ig-s');
  s += t(650, 116, '   = 0.20', 'ig-s');
  s += t(650, 136, 'SPI(t) = 10.2/14', 'ig-s');
  s += t(650, 152, '       = 0.729', 'ig-s');
  s += t(650, 168, 'IEAC(t) = 32.9 mo', 'ig-k');
  return svg('0 0 800 200', s, 'Planned value curve with earned value interpolated back to find earned schedule at month 10.2');
};

/* ---- L14 : the 14 tests ------------------------------------------------ */
IG.dcma = function(){
  var s = AH;
  var T = [['1','Logic','≤5%'],['2','Leads','0'],['3','Lags','≤5%'],['4','FS types','≥90%'],
           ['5','Hard constraints','≤5%'],['6','High float','≤5%'],['7','Negative float','0'],
           ['8','High duration','≤5%'],['9','Invalid dates','0'],['10','Resources','all'],
           ['11','Missed tasks','≤5%'],['12','Critical path test','600d'],['13','CPLI','≥0.95'],['14','BEI','≥0.95']];
  s += t(400, 18, 'THE DCMA 14-POINT ASSESSMENT', 'ig-t', 'middle');
  T.forEach(function(r, i){
    var col = i % 7, row = Math.floor(i / 7);
    var x = 30 + col * 110, y = 32 + row * 84;
    var hard = (r[2] === '0' || r[2] === 'all');
    s += box(x, y, 100, 68, hard ? 'var(--red)' : 'var(--teal)', hard ? '#FDF4F3' : '#F1F7FA');
    s += '<circle cx="' + (x + 16) + '" cy="' + (y + 16) + '" r="11" fill="' + (hard ? 'var(--red)' : 'var(--teal)') + '"/>';
    s += t(x + 16, y + 20, r[0], 'ig-l', 'middle');
    s += t(x + 50, y + 42, r[1], 'ig-k', 'middle');
    s += t(x + 50, y + 60, r[2], 'ig-s', 'middle');
  });
  s += box(30, 202, 740, 44, 'var(--amb)', '#FCF8EF');
  s += t(46, 222, 'Red = absolute thresholds. Zero means zero.', 'ig-k');
  s += t(46, 239, 'Every failure has a cosmetic fix that passes the test and degrades the programme. Fix the defect, not the metric.', 'ig-s');
  return svg('0 0 800 254', s, 'Grid of the fourteen DCMA schedule assessment tests with their thresholds');
};

/* ---- L15 : Monte Carlo distribution ------------------------------------- */
IG.montecarlo = function(){
  var s = AH, x0 = 60, x1 = 600, y0 = 42, y1 = 172, w = x1 - x0, hh = y1 - y0;
  s += t(400, 18, 'THE OUTPUT IS A DISTRIBUTION, NOT A DATE', 'ig-t', 'middle');
  var bars = 34, mu = 0.42, sg = 0.15;
  for(var i = 0; i < bars; i++){
    var u = i / bars, d = Math.exp(-Math.pow(u - mu, 2) / (2 * sg * sg));
    var bh = d * hh * 0.92;
    var cum = 0; for(var k = 0; k <= i; k++){ var uu = k / bars; cum += Math.exp(-Math.pow(uu - mu, 2) / (2 * sg * sg)); }
    var tot = 0; for(var k2 = 0; k2 < bars; k2++){ var u2 = k2 / bars; tot += Math.exp(-Math.pow(u2 - mu, 2) / (2 * sg * sg)); }
    var p = cum / tot;
    var col = p <= 0.5 ? 'var(--grn)' : (p <= 0.8 ? 'var(--amb)' : 'var(--red)');
    bars && (s += bar(x0 + u * w + 1, y1 - bh, w / bars - 2, bh, col, 1));
  }
  s += '<line x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '" stroke="var(--rule)"/>';
  [[0.42, 'P50', 'month 26', 'var(--grn)'], [0.60, 'P80', 'month 29', 'var(--amb)'], [0.70, 'P90', 'month 31', 'var(--red)']].forEach(function(p){
    var x = x0 + p[0] * w;
    s += '<line x1="' + x + '" y1="' + (y0 - 6) + '" x2="' + x + '" y2="' + y1 + '" stroke="' + p[3] + '" stroke-width="2"/>';
    s += t(x, y0 - 10, p[1], 'ig-k', 'middle');
    s += t(x, y1 + 16, p[2], 'ig-s', 'middle');
  });
  var xa = x0 + 0.42 * w, xb = x0 + 0.60 * w;
  s += '<line x1="' + xa + '" y1="' + (y1 - 106) + '" x2="' + xb + '" y2="' + (y1 - 106) + '" stroke="var(--navy)" stroke-width="5"/>';
  s += t((xa + xb) / 2, y1 - 112, 'THIS GAP IS THE CONTINGENCY', 'ig-k', 'middle');
  s += box(616, 42, 168, 130, 'var(--rule)', '#fff');
  s += t(700, 62, 'MERGE BIAS', 'ig-k', 'middle');
  s += t(630, 84, 'A milestone fed by', 'ig-b');
  s += t(630, 100, 'four paths needs ALL', 'ig-b');
  s += t(630, 116, 'four on time.', 'ig-b');
  s += t(630, 140, 'Deterministic CPM', 'ig-s');
  s += t(630, 156, 'cannot see this.', 'ig-s');
  return svg('0 0 800 200', s, 'Monte Carlo completion date distribution with P50 P80 and P90 marked and the contingency gap shown');
};

/* ---- L16 : recovery vs revised vs acceleration --------------------------- */
IG.recovery = function(){
  var s = AH;
  s += t(400, 18, 'THREE DIFFERENT DOCUMENTS — THE DIFFERENCE IS WHO ASKED', 'ig-t', 'middle');
  [['RECOVERY SCHEDULE', 'Contractor culpable delay', 'Contract date RETAINED', 'Contractor pays', 'var(--red)'],
   ['REVISED BASELINE', 'Approved variation or EOT', 'Date MOVES to new approved date', 'Neither — scope changed', 'var(--grn)'],
   ['ACCELERATION PLAN', 'Client instruction', 'Often EARLIER than forecast', 'Client pays, if instructed', 'var(--amb)']
  ].forEach(function(r, i){
    var x = 26 + i * 254;
    s += box(x, 34, 240, 128, r[4], '#fff');
    s += '<rect x="' + x + '" y="34" width="240" height="6" fill="' + r[4] + '" rx="2"/>';
    s += t(x + 120, 62, r[0], 'ig-k', 'middle');
    s += t(x + 16, 88, 'Triggered by', 'ig-s');
    s += t(x + 16, 104, r[1], 'ig-b');
    s += t(x + 16, 124, 'Completion date', 'ig-s');
    s += t(x + 16, 140, r[2], 'ig-b');
    s += t(x + 16, 157, 'Who pays: ' + r[3], 'ig-s');
  });
  s += box(26, 174, 748, 46, 'var(--red)', '#FDF4F3');
  s += t(42, 194, 'ORDER OF OPERATIONS WHEN THE CLIENT PRESSES YOU TO ACCELERATE', 'ig-k');
  s += t(42, 212, 'Notify → price it → reserve rights → THEN accelerate. Reverse the order and you have accelerated voluntarily, and paid for it.', 'ig-s');
  return svg('0 0 800 228', s, 'Comparison of recovery schedule, revised baseline and acceleration plan');
};

/* ---- L17 : FIDIC clause map --------------------------------------------- */
IG.fidic = function(){
  var s = AH;
  s += t(400, 18, 'THE CLAUSES A PLANNER LIVES IN', 'ig-t', 'middle');
  [['Red', 'Construction', 'Employer designs', 'var(--red)'],
   ['Yellow', 'Plant &amp; Design-Build', 'Contractor designs', 'var(--amb)'],
   ['Silver', 'EPC / Turnkey', 'Contractor takes almost all risk', 'var(--vio)']
  ].forEach(function(b, i){
    var x = 26 + i * 254;
    s += box(x, 32, 240, 60, b[3], '#fff');
    s += '<rect x="' + x + '" y="32" width="8" height="60" fill="' + b[3] + '" rx="2"/>';
    s += t(x + 20, 54, 'FIDIC ' + b[0] + ' Book', 'ig-k');
    s += t(x + 20, 71, b[1], 'ig-s');
    s += t(x + 20, 87, b[2], 'ig-s');
  });
  var cl = [['8.3', '8.3', 'Programme'], ['8.4', '8.5', 'Extension of Time'], ['8.7', '8.8', 'Delay Damages'],
            ['20.1', '20.2', 'Claims — 28 days'], ['2.1', '2.1', 'Access to Site'], ['13', '13', 'Variations']];
  s += t(26, 118, '1999', 'ig-s'); s += t(90, 118, '2017', 'ig-s'); s += t(160, 118, 'Clause', 'ig-s');
  cl.forEach(function(c, i){
    var y = 138 + i * 22;
    var hot = (c[2].indexOf('28 days') >= 0 || c[2] === 'Extension of Time');
    if(hot) s += '<rect x="20" y="' + (y - 15) + '" width="380" height="20" fill="#FCF8EF" rx="3"/>';
    s += t(26, y, c[0], 'ig-k'); s += t(90, y, c[1], 'ig-k'); s += t(160, y, c[2], 'ig-b');
  });
  s += box(420, 122, 354, 132, 'var(--red)', '#FDF4F3');
  s += t(438, 144, 'THE 28-DAY TRAP', 'ig-k');
  s += t(438, 166, 'The clock runs from AWARENESS of the event —', 'ig-b');
  s += t(438, 182, 'not from when it impacts the programme.', 'ig-b');
  s += t(438, 204, 'It is a condition precedent: miss it and the', 'ig-b');
  s += t(438, 220, 'entitlement is extinguished regardless of merit.', 'ig-b');
  s += t(438, 242, 'Particulars follow separately at 42 days.', 'ig-s');
  return svg('0 0 800 262', s, 'FIDIC book types and the key clauses with the 28 day notice trap highlighted');
};

/* ---- L18 : method selection matrix -------------------------------------- */
IG.delaymatrix = function(){
  var s = AH, x0 = 150, y0 = 50, W = 280, H = 74;
  s += t(400, 18, 'EVERY METHOD SITS ON TWO AXES', 'ig-t', 'middle');
  s += t(x0 + W, 40, 'PROSPECTIVE  →  what was expected at the time', 'ig-s', 'middle');
  s += t(x0 + W, 214, 'RETROSPECTIVE  →  what actually happened', 'ig-s', 'middle');
  s += '<text x="140" y="' + (y0 + H / 2) + '" class="ig-s" text-anchor="end">ADDITIVE</text>';
  s += '<text x="140" y="' + (y0 + H + 12 + H / 2) + '" class="ig-s" text-anchor="end">SUBTRACTIVE /</text>';
  s += '<text x="140" y="' + (y0 + H + 28 + H / 2) + '" class="ig-s" text-anchor="end">OBSERVATIONAL</text>';
  var cells = [
   [x0, y0, 'Impacted As-Planned', 'MIP 3.6 · baseline only', 'var(--red)', 'often rejected'],
   [x0 + W + 12, y0, 'Time Impact Analysis', 'MIP 3.7 · updated base', 'var(--grn)', 'SCL preference'],
   [x0, y0 + H + 12, 'As-Planned v As-Built', 'SCL 4 · works without updates', 'var(--amb)', 'more judgement'],
   [x0 + W + 12, y0 + H + 12, 'Time Slice Windows', 'MIP 3.3 · needs good updates', 'var(--teal)', 'shows path moving']
  ];
  cells.forEach(function(c){
    s += box(c[0], c[1], W, H, c[4], '#fff');
    s += '<rect x="' + c[0] + '" y="' + c[1] + '" width="' + W + '" height="5" fill="' + c[4] + '"/>';
    s += t(c[0] + 14, c[1] + 30, c[2], 'ig-k');
    s += t(c[0] + 14, c[1] + 48, c[3], 'ig-s');
    s += t(c[0] + W - 14, c[1] + 66, c[5], 'ig-s', 'end');
  });
  s += t(400, 240, 'Collapsed As-Built (MIP 3.8/3.9) removes delays from the as-built — powerful, but needs as-built logic that rarely exists.', 'ig-s', 'middle');
  return svg('0 0 800 250', s, 'Matrix of delay analysis methods by prospective versus retrospective and additive versus subtractive');
};

/* ---- L19 : the three entitlement categories ----------------------------- */
IG.entitlement = function(){
  var s = AH;
  s += t(400, 18, 'TIME, MONEY, OR NEITHER', 'ig-t', 'middle');
  [['EXCUSABLE &amp; COMPENSABLE', 'Employer', '✓ TIME', '✓ MONEY', 'Late access · late free-issue · variations · late approvals', 'var(--grn)'],
   ['EXCUSABLE, NON-COMPENSABLE', 'Neither party', '✓ TIME', '✗ MONEY', 'Exceptional weather · force majeure · some statutory change', 'var(--amb)'],
   ['NON-EXCUSABLE', 'Contractor', '✗ TIME', '✗ MONEY', 'Poor productivity · subcontractor failure · rework', 'var(--red)']
  ].forEach(function(r, i){
    var y = 34 + i * 62;
    s += box(26, y, 748, 54, r[5], '#fff');
    s += '<rect x="26" y="' + y + '" width="7" height="54" fill="' + r[5] + '" rx="2"/>';
    s += t(46, y + 22, r[0], 'ig-k');
    s += t(46, y + 42, 'Caused by ' + r[1], 'ig-s');
    s += t(330, y + 33, r[2], 'ig-k', 'middle');
    s += t(410, y + 33, r[3], 'ig-k', 'middle');
    s += t(470, y + 33, r[4], 'ig-b');
  });
  s += box(26, 224, 748, 40, 'var(--vio)', '#F6F4FA');
  s += t(400, 249, 'The middle row is the one people forget. Excusable does NOT imply compensable.', 'ig-k', 'middle');
  return svg('0 0 800 272', s, 'The three delay categories showing which give time, which give money and which give neither');
};

/* ---- L19 : concurrency timeline ----------------------------------------- */
IG.concurrency = function(){
  var s = AH;
  s += t(400, 18, 'CONCURRENCY IS ASSESSED PERIOD BY PERIOD', 'ig-t', 'middle');
  s += t(40, 52, 'Employer delay', 'ig-k');
  s += bar(200, 38, 300, 22, 'var(--grn)');
  s += t(350, 53, '1 May – 30 June', 'ig-l', 'middle');
  s += t(40, 90, 'Contractor delay', 'ig-k');
  s += bar(350, 76, 300, 22, 'var(--red)');
  s += t(500, 91, '1 June – 31 July', 'ig-l', 'middle');
  s += '<rect x="350" y="30" width="150" height="78" fill="var(--vio)" opacity="0.16"/>';
  s += '<line x1="350" y1="30" x2="350" y2="108" stroke="var(--vio)" stroke-dasharray="4 3"/>';
  s += '<line x1="500" y1="30" x2="500" y2="108" stroke="var(--vio)" stroke-dasharray="4 3"/>';
  s += t(425, 124, 'OVERLAP — time but not money', 'ig-k', 'middle');
  s += t(275, 124, 'time + money', 'ig-s', 'middle');
  s += t(575, 124, 'nothing', 'ig-s', 'middle');
  s += t(40, 152, 'THE FOUR TESTS — fail any one and there is no concurrency', 'ig-k');
  ['1. Are BOTH events on the critical path?', '2. Do they overlap in EFFECT, not merely in occurrence?',
   '3. Is each INDEPENDENTLY capable of causing the delay?', '4. What does the CONTRACT say?'
  ].forEach(function(q, i){
    s += box(26 + (i % 2) * 380, 164 + Math.floor(i / 2) * 40, 368, 32, 'var(--rule)', '#fff');
    s += t(40 + (i % 2) * 380, 185 + Math.floor(i / 2) * 40, q, 'ig-b');
  });
  s += t(400, 258, 'Most alleged concurrency dissolves at test one — the employer’s event was on a chain with float.', 'ig-s', 'middle');
  return svg('0 0 800 266', s, 'Timeline showing sequential concurrency with an overlap period and the four tests for concurrency');
};

/* ---- L20 : disruption method reliability -------------------------------- */
IG.disruption = function(){
  var s = AH;
  s += t(400, 18, 'AACE RP 25R-03 — METHODS RANKED BY RELIABILITY', 'ig-t', 'middle');
  var M = [['Measured mile', 100, 'var(--grn)', 'Same work, same project, clean period'],
           ['Earned value / baseline', 80, 'var(--teal)', 'Project’s own planned productivity'],
           ['Comparable work study', 60, 'var(--amb)', 'Similar scope elsewhere'],
           ['Industry studies', 42, 'var(--amb)', 'Published curves — generic'],
           ['Modified total cost', 26, 'var(--red)', 'Adjusted for contractor fault'],
           ['Total cost', 14, 'var(--red)', 'Actual minus tender — last resort']];
  M.forEach(function(m, i){
    var y = 36 + i * 32;
    s += t(30, y + 15, (i + 1) + '. ' + m[0], 'ig-k');
    s += bar(230, y + 2, m[1] * 3.1, 18, m[2]);
    s += t(230 + m[1] * 3.1 + 8, y + 15, m[3], 'ig-s');
  });
  s += box(26, 232, 748, 46, 'var(--navy)', '#EEF3F9');
  s += t(42, 252, 'Disruption claims are won or lost by the record-keeping system set up in MONTH ONE.', 'ig-k');
  s += t(42, 270, 'Man-hours by activity AND by area · quantities installed · daily allocation sheets · dated photographs · constraint logs.', 'ig-s');
  return svg('0 0 800 286', s, 'Bar chart ranking the six disruption methods by evidential reliability with measured mile highest');
};

/* ---- L21 : what actually wins ------------------------------------------- */
IG.claim10 = function(){
  var s = AH;
  s += t(400, 18, 'WHAT ACTUALLY DECIDES CLAIMS', 'ig-t', 'middle');
  var R = [['Valid, timely notice', 'Condition precedent. Fails first and fails absolutely', 'var(--red)'],
           ['Contemporaneous records', 'Cannot be manufactured later', 'var(--red)'],
           ['Demonstrated causation', 'That it delayed COMPLETION, not just that it happened', 'var(--amb)'],
           ['Accepted baseline', 'Without it every comparison is arguable', 'var(--amb)'],
           ['The analysis method', 'Appropriate to the records, honestly explained', 'var(--teal)'],
           ['Substantiated quantum', 'Actual cost records, not a formula', 'var(--teal)'],
           ['Clarity of presentation', 'An assessor who cannot follow it will not award it', 'var(--mute)']];
  R.forEach(function(r, i){
    var y = 34 + i * 30;
    s += '<circle cx="44" cy="' + (y + 11) + '" r="13" fill="' + r[2] + '"/>';
    s += t(44, y + 15, (i + 1), 'ig-l', 'middle');
    s += t(70, y + 16, r[0], 'ig-k');
    s += t(300, y + 16, r[1], 'ig-b');
  });
  s += box(26, 250, 748, 44, 'var(--red)', '#FDF4F3');
  s += t(42, 270, 'NOTE WHAT IS NOT AT THE TOP.', 'ig-k');
  s += t(42, 288, 'Contractors routinely spend heavily on expert analysis for claims extinguished by a missed notice in month four.', 'ig-s');
  return svg('0 0 800 302', s, 'Ranked list of the factors that decide construction claims with notice first and analysis fifth');
};

/* ---- L18 : windows analysis — the critical path moves ------------------- */
IG.windows = function(){
  var s = AH;
  s += t(400, 18, 'THE DRIVING PATH IS A DIFFERENT CHAIN IN EVERY WINDOW', 'ig-t', 'middle');
  var W = [['W1  M1–M4', 'Access → earthworks → foundations', 41, 'var(--grn)', 'Employer'],
           ['W2  M5–M9', 'GIS procurement → manufacture → FAT', 40, 'var(--red)', 'Contractor'],
           ['W3  M10–M14', 'New 33kV bays → cable → termination', 55, 'var(--grn)', 'Employer'],
           ['W4  M15–M18', 'Panel wiring → pre-comm → energise', 34, 'var(--red)', 'Contractor']];
  var x = 26, bw = 186;
  W.forEach(function(r, i){
    var px = x + i * bw;
    s += box(px, 34, bw - 10, 92, r[3], '#fff');
    s += '<rect x="' + px + '" y="34" width="' + (bw - 10) + '" height="5" fill="' + r[3] + '"/>';
    s += t(px + 12, 58, r[0], 'ig-k');
    r[1].split(' → ').forEach(function(ln, j){
      s += t(px + 12, 76 + j * 14, (j ? '→ ' : '') + ln, 'ig-s');
    });
    s += t(px + 12, 120, r[2] + ' d  ·  ' + r[4], 'ig-k');
    if(i < 3) s += t(px + bw - 8, 84, '›', 'ig-t', 'middle');
  });
  var y = 146, tot = 170, cx = 26, cw = 748;
  s += t(26, y, 'Cumulative slip attributed by window', 'ig-s');
  var run = 0;
  W.forEach(function(r){
    var wpx = r[2] / tot * cw;
    s += bar(cx + run, y + 8, wpx - 2, 22, r[3], 2);
    s += t(cx + run + wpx / 2, y + 24, r[2] + ' d', 'ig-l', 'middle');
    run += wpx;
  });
  s += box(26, 186, 366, 54, 'var(--grn)', '#F2F9F5');
  s += t(42, 208, 'Employer:  41 + 55 = 96 days', 'ig-k');
  s += t(42, 228, 'Extension of time = 96 days', 'ig-s');
  s += box(408, 186, 366, 54, 'var(--red)', '#FDF4F3');
  s += t(424, 208, 'Contractor:  40 + 34 = 74 days', 'ig-k');
  s += t(424, 228, 'No relief — LDs still bite on these', 'ig-s');
  s += t(400, 262, 'NOT 96 − 74 = 22. Entitlement is assessed event by event, then aggregated — never netted.', 'ig-k', 'middle');
  return svg('0 0 800 272', s, 'Four analysis windows each with a different driving path, showing employer and contractor delay attributed separately');
};

function renderIG(id){
  try{ return IG[id] ? IG[id]() : ''; }catch(e){ return ''; }
}

/* ==========================================================================
 *  PART 3 — WIDGETS : 14 live calculators
 * ========================================================================== */
var WIDGETS = {};

/* -- 1. WBS builder ------------------------------------------------------ */
WIDGETS.wbs = {
 t:"WBS builder", tag:"the 100% rule and package sizing",
 chal:{text:"Set the breakdown so every work package lands inside the 0.5–2% band, with at least 40 packages.",
       test:function(s){ return s.inBand && s.pkgs >= 40; }},
 mount:function(b, ctx){
  var c = h('div', {class:'ctrls'});
  var f1 = fld('Project value (AED m)', 'number', {value:300, min:5, max:5000, step:5}, up);
  var f2 = fld('Level 1 branches', 'range', {value:4, min:2, max:8, step:1}, up);
  var f3 = fld('Packages per branch', 'range', {value:8, min:2, max:40, step:1}, up);
  [f1, f2, f3].forEach(function(f){ c.appendChild(f); });
  b.appendChild(c);
  var out = h('div'); b.appendChild(out);
  var cv = canvas(b, 0.30, 'WBS package size distribution against the 0.5 to 2 percent band');
  function up(){
    var val = Math.max(1, +f1.input.value || 0);
    var br = +f2.input.value, per = +f3.input.value;
    var pkgs = br * per;
    var each = val / pkgs;
    var pctEach = 100 / pkgs;
    var inBand = pctEach >= 0.5 && pctEach <= 2;
    out.innerHTML = '<div class="out">' +
      kpi('Branches', br) +
      kpi('Work packages', pkgs) +
      kpi('Each package', pctEach.toFixed(2) + '%', 'of project value', inBand ? 'good' : 'bad') +
      kpi('Value each', 'AED ' + money(each * 1e6), '', inBand ? 'good' : 'bad') +
      kpi('100% rule', br + ' × ' + (100 / br).toFixed(1) + '% = 100%', 'holds by construction', 'good') +
      '</div>' +
      '<p class="sm ' + (inBand ? '' : 'muted') + '" style="margin-top:10px">' +
      (pctEach > 2
        ? '<b style="color:var(--red)">Too coarse.</b> At ' + pctEach.toFixed(2) + '% per package you cannot tell which part is failing when one reports 60% and slipping.'
        : pctEach < 0.5
          ? '<b style="color:var(--red)">Too fine.</b> At ' + pctEach.toFixed(2) + '% per package you are generating administration nobody reads.'
          : '<b style="color:var(--grn)">Inside the 0.5–2% band.</b> Each package is small enough to diagnose and large enough to be worth controlling.') +
      '</p>';
    cv.draw(function(g, w, ht){
      var pad = {l:44, r:14, t:16, b:26};
      var iw = w - pad.l - pad.r, ih = ht - pad.t - pad.b;
      var maxP = Math.max(3, pctEach * 1.4);
      function Y(p){ return pad.t + ih - (p / maxP) * ih; }
      g.fillStyle = '#F2F9F5';
      g.fillRect(pad.l, Y(2), iw, Y(0.5) - Y(2));
      g.strokeStyle = C.grn; g.setLineDash([4, 3]); g.lineWidth = 1;
      [0.5, 2].forEach(function(v){
        g.beginPath(); g.moveTo(pad.l, Y(v)); g.lineTo(w - pad.r, Y(v)); g.stroke();
        tx(g, v + '%', pad.l - 6, Y(v) + 4, C.grn, '10px Consolas', 'right');
      });
      g.setLineDash([]);
      axes(g, w, ht, pad, 'work packages →', '');
      var n = Math.min(pkgs, 60), bw = iw / n;
      for(var i = 0; i < n; i++){
        var x = pad.l + i * bw;
        g.fillStyle = inBand ? C.grn : C.red;
        g.fillRect(x + 0.5, Y(pctEach), Math.max(1, bw - 1), pad.t + ih - Y(pctEach));
      }
      tx(g, pkgs + ' packages @ ' + pctEach.toFixed(2) + '% each', pad.l + 6, pad.t + 12, C.navy, '700 11px Arial');
      if(pkgs > 60) tx(g, '(first 60 shown)', w - pad.r - 4, pad.t + 12, C.mute, '10px Consolas', 'right');
    });
    ctx.report({inBand:inBand, pkgs:pkgs});
  }
  up();
 }
};

/* -- 2. Relationship explorer -------------------------------------------- */
WIDGETS.rel = {
 t:"Relationship explorer", tag:"FS · SS · FF · SF with lag",
 chal:{text:"Model a cable crew pursuing a trenching crew: choose the relationship that constrains BOTH ends, with a positive lag.",
       test:function(s){ return s.type === 'SS+FF' && s.lag > 0; }},
 mount:function(b, ctx){
  var c = h('div', {class:'ctrls'});
  var f1 = fld('Relationship', 'select', {opts:[
    {v:'FS', t:'FS — Finish to Start'}, {v:'SS', t:'SS — Start to Start'},
    {v:'FF', t:'FF — Finish to Finish'}, {v:'SF', t:'SF — Start to Finish'},
    {v:'SS+FF', t:'SS + FF pair'}]}, up);
  var f2 = fld('Lag (days)', 'range', {value:3, min:-8, max:12, step:1}, up);
  var f3 = fld('Predecessor duration', 'range', {value:20, min:4, max:30, step:1}, up);
  var f4 = fld('Successor duration', 'range', {value:18, min:4, max:30, step:1}, up);
  [f1, f2, f3, f4].forEach(function(f){ c.appendChild(f); });
  b.appendChild(c);
  var cv = canvas(b, 0.30, 'Two bars showing the effect of the selected relationship type and lag');
  var out = h('div'); b.appendChild(out);
  function up(){
    var ty = f1.input.value, lag = +f2.input.value, dA = +f3.input.value, dB = +f4.input.value;
    var aS = 0, aF = dA, bS, bF;
    if(ty === 'FS'){ bS = aF + lag; bF = bS + dB; }
    else if(ty === 'SS'){ bS = aS + lag; bF = bS + dB; }
    else if(ty === 'FF'){ bF = aF + lag; bS = bF - dB; }
    else if(ty === 'SF'){ bF = aS + lag; bS = bF - dB; }
    else { var s1 = aS + lag, f1b = aF + lag; bS = s1; bF = Math.max(s1 + dB, f1b); }
    var warn = '';
    if(lag < 0) warn = '<div class="verdict no"><b>Negative lag — a lead.</b> DCMA test 2 requires zero. It breaks the backward pass and produces float values that are arithmetically correct and practically meaningless. Model the real overlap as SS with a positive lag, or split the predecessor.</div>';
    else if(ty === 'SS') warn = '<div class="verdict hint"><b>SS alone leaves the finish unconstrained.</b> The successor may finish before the predecessor does — physically impossible for pursuit work. Add an FF to close it.</div>';
    else if(ty === 'FF') warn = '<div class="verdict hint"><b>FF alone leaves the start unconstrained.</b> The successor is free to start on day one, before the predecessor has produced anything.</div>';
    else if(ty === 'SF') warn = '<div class="verdict hint"><b>SF is genuinely rare.</b> Legitimate for shift handovers or removing a temporary supply once the permanent one is live. If you are reaching for it on construction work, the logic is probably wrong.</div>';
    else if(ty === 'SS+FF') warn = '<div class="verdict ok"><b>The pursuit pattern.</b> SS+' + lag + ' gives the following crew a working front; FF ensures it cannot finish before the leading crew does. Both ends constrained — this is the correct model.</div>';
    else if(lag > 20) warn = '<div class="verdict hint"><b>Long lag.</b> A lag this size is usually hiding an activity with a resource, a cost and a risk. Model it as an activity so it can be seen and progressed.</div>';
    out.innerHTML = '<div class="out">' +
      kpi('Reads as', ty === 'SS+FF' ? 'SS+' + lag + ' & FF' : ty + (lag >= 0 ? '+' : '') + lag) +
      kpi('Successor start', 'day ' + bS) +
      kpi('Successor finish', 'day ' + bF) +
      kpi('Overlap', Math.max(0, aF - bS) + ' d', 'days run in parallel') +
      '</div>' + warn;
    cv.draw(function(g, w, ht){
      var pad = {l:80, r:20, t:22, b:28};
      var maxD = Math.max(aF, bF, 1) * 1.12;
      var iw = w - pad.l - pad.r;
      function X(d){ return pad.l + (d / maxD) * iw; }
      g.strokeStyle = '#EDF1F5';
      for(var d = 0; d <= maxD; d += 5){
        g.beginPath(); g.moveTo(X(d), pad.t - 6); g.lineTo(X(d), ht - pad.b); g.stroke();
        tx(g, d, X(d), ht - pad.b + 14, C.mute, '10px Consolas', 'center');
      }
      g.fillStyle = C.navy; g.fillRect(X(aS), pad.t, Math.max(2, X(aF) - X(aS)), 26);
      tx(g, 'A  predecessor', X(aS) + 6, pad.t + 17, '#fff', '700 11px Arial');
      tx(g, 'A', pad.l - 10, pad.t + 17, C.navy, '700 12px Consolas', 'right');
      var by = pad.t + 40;
      g.fillStyle = lag < 0 ? C.red : (ty === 'SS+FF' ? C.grn : C.teal);
      g.fillRect(X(bS), by, Math.max(2, X(bF) - X(bS)), 26);
      tx(g, 'B  successor', X(bS) + 6, by + 17, '#fff', '700 11px Arial');
      tx(g, 'B', pad.l - 10, by + 17, C.navy, '700 12px Consolas', 'right');
      g.strokeStyle = lag < 0 ? C.red : C.amb; g.lineWidth = 1.8; g.setLineDash([4, 3]);
      var lx = (ty === 'SS' || ty === 'SF' || ty === 'SS+FF') ? X(aS) : X(aF);
      var ly = (ty === 'FF' || ty === 'SF') ? X(bF) : X(bS);
      g.beginPath(); g.moveTo(lx, pad.t + 13); g.lineTo(lx, by - 6); g.lineTo(ly, by - 6); g.lineTo(ly, by + 4); g.stroke();
      g.setLineDash([]);
      if(ty === 'SS+FF'){
        g.strokeStyle = C.grn; g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(X(aF), pad.t + 13); g.lineTo(X(aF), by + 34); g.lineTo(X(bF), by + 34); g.lineTo(X(bF), by + 22); g.stroke();
        g.setLineDash([]);
      }
      if(Math.max(0, aF - bS) > 0){
        g.fillStyle = 'rgba(180,134,47,0.14)';
        g.fillRect(X(bS), pad.t - 4, X(aF) - X(bS), 76);
      }
    });
    ctx.report({type:ty, lag:lag});
  }
  up();
 }
};

/* -- 3. CPM calculator ---------------------------------------------------- */
WIDGETS.cpm = {
 t:"CPM calculator", tag:"forward pass · backward pass · float",
 chal:{text:"Make activity C critical (total float 0) without changing the duration of A or D.",
       test:function(s){ return s.a === 5 && s.d === 6 && s.tfC === 0; }},
 mount:function(b, ctx){
  var c = h('div', {class:'ctrls'});
  var fa = fld('A duration', 'range', {value:5, min:1, max:20, step:1}, up);
  var fb = fld('B duration', 'range', {value:8, min:1, max:20, step:1}, up);
  var fc = fld('C duration', 'range', {value:6, min:1, max:20, step:1}, up);
  var fd = fld('D duration', 'range', {value:6, min:1, max:20, step:1}, up);
  [fa, fb, fc, fd].forEach(function(f){ c.appendChild(f); });
  b.appendChild(c);
  b.appendChild(h('p', {class:'xs muted'}, 'Network: A → B → D and A → C → D. All Finish-to-Start, zero lag, day 0 start.'));
  var cv = canvas(b, 0.34, 'Network diagram with early and late dates and the critical path highlighted');
  var out = h('div'); b.appendChild(out);
  function up(){
    var dA = +fa.input.value, dB = +fb.input.value, dC = +fc.input.value, dD = +fd.input.value;
    var N = {
      A:{d:dA, es:0}, B:{d:dB, es:dA}, C:{d:dC, es:dA}, D:{d:dD}
    };
    N.A.ef = N.A.es + dA; N.B.ef = N.B.es + dB; N.C.ef = N.C.es + dC;
    N.D.es = Math.max(N.B.ef, N.C.ef); N.D.ef = N.D.es + dD;
    var proj = N.D.ef;
    N.D.lf = proj; N.D.ls = proj - dD;
    N.B.lf = N.D.ls; N.B.ls = N.B.lf - dB;
    N.C.lf = N.D.ls; N.C.ls = N.C.lf - dC;
    N.A.lf = Math.min(N.B.ls, N.C.ls); N.A.ls = N.A.lf - dA;
    ['A','B','C','D'].forEach(function(k){ N[k].tf = N[k].ls - N[k].es; });
    N.A.ff = Math.min(N.B.es, N.C.es) - N.A.ef;
    N.B.ff = N.D.es - N.B.ef; N.C.ff = N.D.es - N.C.ef; N.D.ff = 0;
    var cp = ['A','B','C','D'].filter(function(k){ return N[k].tf === 0; });
    var rows = ['A','B','C','D'].map(function(k){
      var n = N[k], crit = n.tf === 0;
      return '<tr' + (crit ? ' style="background:#FDF4F3"' : '') + '><td><b>' + k + '</b></td><td class="n">' + n.d +
        '</td><td class="n">' + n.es + '</td><td class="n">' + n.ef + '</td><td class="n">' + n.ls +
        '</td><td class="n">' + n.lf + '</td><td class="n"' + (crit ? ' style="color:var(--red);font-weight:700"' : '') + '>' + n.tf +
        '</td><td class="n">' + n.ff + '</td><td>' + (crit ? '<span class="cross">CRITICAL</span>' : '') + '</td></tr>';
    }).join('');
    out.innerHTML = '<div class="out">' +
      kpi('Project duration', proj + ' d') +
      kpi('Critical path', cp.join(' → '), '', 'bad') +
      kpi('Paths', 'A-B-D = ' + (dA + dB + dD), 'A-C-D = ' + (dA + dC + dD)) +
      kpi('Multiple critical?', (dB === dC ? 'YES — both' : 'no'), '', dB === dC ? 'warn' : '') +
      '</div>' +
      '<div class="tblwrap" style="margin-top:12px"><table class="dt"><thead><tr><th>Act</th><th>Dur</th><th>ES</th><th>EF</th><th>LS</th><th>LF</th><th>TF</th><th>FF</th><th></th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' +
      (dB === dC ? '<div class="verdict hint"><b>Two critical paths.</b> B and C have equal duration, so both chains drive the finish. Shortening only one of them changes the project duration by nothing at all.</div>' : '');
    cv.draw(function(g, w, ht){
      var P = {A:[0.10, 0.5], B:[0.40, 0.24], C:[0.40, 0.76], D:[0.72, 0.5]};
      var bw = Math.min(126, w * 0.19), bh = 56;
      function pos(k){ return [P[k][0] * w, P[k][1] * (ht - 20) + 10]; }
      [['A','B'],['A','C'],['B','D'],['C','D']].forEach(function(e){
        var p1 = pos(e[0]), p2 = pos(e[1]);
        var crit = N[e[0]].tf === 0 && N[e[1]].tf === 0;
        g.strokeStyle = crit ? C.red : C.rule; g.lineWidth = crit ? 2.6 : 1.4;
        g.beginPath(); g.moveTo(p1[0] + bw / 2, p1[1]); g.lineTo(p2[0] - bw / 2, p2[1]); g.stroke();
      });
      ['A','B','C','D'].forEach(function(k){
        var p = pos(k), n = N[k], crit = n.tf === 0;
        g.fillStyle = '#fff'; g.strokeStyle = crit ? C.red : C.rule; g.lineWidth = crit ? 2.2 : 1.2;
        g.beginPath(); g.rect(p[0] - bw / 2, p[1] - bh / 2, bw, bh); g.fill(); g.stroke();
        g.fillStyle = crit ? '#FDF4F3' : C.lt;
        g.fillRect(p[0] - bw / 2 + 1, p[1] - bh / 2 + 1, bw - 2, 16);
        tx(g, k + '   d=' + n.d, p[0], p[1] - bh / 2 + 13, crit ? C.red : C.navy, '700 11px Consolas', 'center');
        tx(g, 'ES ' + n.es + '  EF ' + n.ef, p[0], p[1] - 2, C.ink, '10.5px Consolas', 'center');
        tx(g, 'LS ' + n.ls + '  LF ' + n.lf, p[0], p[1] + 11, C.mute, '10.5px Consolas', 'center');
        tx(g, 'TF ' + n.tf, p[0], p[1] + 23, crit ? C.red : C.grn, '700 10.5px Consolas', 'center');
      });
    });
    ctx.report({a:dA, d:dD, tfC:N.C.tf});
  }
  up();
 }
};

/* -- 4. Calendar builder --------------------------------------------------- */
WIDGETS.cal = {
 t:"Calendar builder", tag:"gross span · net hours · conversion factor",
 chal:{text:"Build a 6-day calendar starting 07:00 with a 10-hour gross span including a lunch break.",
       test:function(s){ return s.days === 6 && s.start === 7 && s.gross === 10 && s.lunch > 0; }},
 mount:function(b, ctx){
  var c = h('div', {class:'ctrls'});
  var f1 = fld('Start hour', 'range', {value:7, min:5, max:10, step:0.5}, up);
  var f2 = fld('Finish hour', 'range', {value:17, min:12, max:22, step:0.5}, up);
  var f3 = fld('Breaks (minutes)', 'range', {value:60, min:0, max:120, step:15}, up);
  var f4 = fld('Days per week', 'range', {value:6, min:4, max:7, step:1}, up);
  var f5 = fld('Admin hours/day setting', 'range', {value:8, min:6, max:12, step:0.5}, up);
  [f1, f2, f3, f4, f5].forEach(function(f){ c.appendChild(f); });
  b.appendChild(c);
  var cv = canvas(b, 0.22, 'Timeline of a working day showing gross span split by the break into net working time');
  var out = h('div'); b.appendChild(out);
  function hm(v){
    var hh = Math.floor(v), mm = Math.round((v - hh) * 60);
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }
  function up(){
    var st = +f1.input.value, fi = +f2.input.value, br = +f3.input.value / 60, dpw = +f4.input.value, adm = +f5.input.value;
    var gross = Math.max(0, fi - st);
    var net = Math.max(0, gross - br);
    var wk = net * dpw;
    var err = Math.abs(net - adm) > 0.001;
    var pctErr = net > 0 ? (net - adm) / adm * 100 : 0;
    out.innerHTML = '<div class="out">' +
      kpi('Gross span', gross.toFixed(2) + ' h', hm(st) + ' → ' + hm(fi)) +
      kpi('Break', (br * 60).toFixed(0) + ' min') +
      kpi('Net working', net.toFixed(2) + ' h', 'per day', 'good') +
      kpi('Week', wk.toFixed(1) + ' h', dpw + ' days') +
      kpi('Admin setting', adm.toFixed(1) + ' h', 'hours per day', err ? 'bad' : 'good') +
      '</div>' +
      (err
        ? '<div class="verdict no"><b>Conversion factor mismatch — ' + (pctErr > 0 ? '+' : '') + pctErr.toFixed(1) + '% on every duration.</b> ' +
          'The calendar defines a ' + net.toFixed(2) + '-hour working day but Admin Preferences says ' + adm.toFixed(1) + ' h/day. ' +
          'P6 stores durations in hours and converts using the Admin value, so a 10-day activity you type becomes ' +
          (net * 10 / adm).toFixed(1) + ' days as reported. Set them equal, or state the chosen value in the basis of schedule.</div>'
        : '<div class="verdict ok"><b>Consistent.</b> The Admin hours-per-day matches the net working hours defined by the calendar, so typed durations and reported durations agree.</div>') +
      (br === 0
        ? '<div class="verdict hint"><b>No break deducted.</b> This is the ten-hours-including-lunch trap: the calendar looks right because someone typed the start and finish times, but the crews do not produce through the break. Enter working time as two blocks.</div>'
        : '');
    cv.draw(function(g, w, ht){
      var pad = {l:16, r:16, t:26, b:30};
      var iw = w - pad.l - pad.r;
      function X(v){ return pad.l + ((v - st) / Math.max(gross, 0.5)) * iw; }
      g.fillStyle = '#E3E9EF'; g.fillRect(pad.l, pad.t - 14, iw, 10);
      tx(g, 'gross span ' + gross.toFixed(2) + ' h', pad.l + iw / 2, pad.t - 18, C.mute, '10px Consolas', 'center');
      var bs = st + (gross - br) / 2, be = bs + br;
      g.fillStyle = C.teal; g.fillRect(X(st), pad.t, Math.max(0, X(bs) - X(st)), 34);
      if(br > 0){
        g.fillStyle = C.red; g.fillRect(X(bs), pad.t, X(be) - X(bs), 34);
        tx(g, 'break', (X(bs) + X(be)) / 2, pad.t + 21, '#fff', '700 10px Arial', 'center');
      }
      g.fillStyle = C.teal; g.fillRect(X(be), pad.t, Math.max(0, X(fi) - X(be)), 34);
      tx(g, hm(st) + '–' + hm(bs), (X(st) + X(bs)) / 2, pad.t + 21, '#fff', '700 10px Arial', 'center');
      tx(g, hm(be) + '–' + hm(fi), (X(be) + X(fi)) / 2, pad.t + 21, '#fff', '700 10px Arial', 'center');
      tx(g, 'NET ' + net.toFixed(2) + ' h', pad.l + iw / 2, pad.t + 52, C.navy, '700 12px Arial', 'center');
      for(var d = 1; d <= 7; d++){
        var bx = pad.l + (d - 1) * (iw / 7);
        g.fillStyle = d <= dpw ? C.grn : '#E3E9EF';
        g.fillRect(bx + 2, ht - pad.b + 8, iw / 7 - 4, 10);
      }
      tx(g, dpw + ' working days per week', pad.l, ht - 4, C.mute, '10px Consolas');
    });
    ctx.report({days:dpw, start:st, gross:gross, lunch:br * 60, net:net});
  }
  up();
 }
};

/* -- 5. Resource histogram ------------------------------------------------- */
WIDGETS.hist = {
 t:"Resource histogram", tag:"demand against a levelling limit",
 chal:{text:"Bring the peak demand within the availability limit without raising the limit above 220.",
       test:function(s){ return s.spill === 0 && s.limit <= 220; }},
 mount:function(b, ctx){
  var c = h('div', {class:'ctrls'});
  var f1 = fld('Peak demand', 'range', {value:340, min:80, max:600, step:10}, up);
  var f2 = fld('Availability limit', 'range', {value:200, min:80, max:600, step:10}, up);
  var f3 = fld('Peak position', 'range', {value:55, min:20, max:90, step:5}, up);
  var f4 = fld('Profile spread', 'range', {value:22, min:8, max:45, step:1}, up);
  [f1, f2, f3, f4].forEach(function(f){ c.appendChild(f); });
  b.appendChild(c);
  var cv = canvas(b, 0.36, 'Manpower histogram with demand bars against an availability limit, spill shown in red');
  var out = h('div'); b.appendChild(out);
  var N = 24;
  function up(){
    var peak = +f1.input.value, lim = +f2.input.value, pos = +f3.input.value / 100, sp = +f4.input.value / 100;
    var dem = [], spill = 0, tot = 0, over = 0;
    for(var i = 0; i < N; i++){
      var u = (i + 0.5) / N;
      var v = peak * Math.exp(-Math.pow(u - pos, 2) / (2 * sp * sp));
      dem.push(v); tot += v;
      if(v > lim){ spill += v - lim; over++; }
    }
    var push = lim > 0 ? Math.round(spill / lim * (720 / N)) : 0;
    out.innerHTML = '<div class="out">' +
      kpi('Peak demand', Math.round(Math.max.apply(null, dem)), 'persons') +
      kpi('Limit', lim, 'persons') +
      kpi('Periods over', over + ' of ' + N, '', over ? 'bad' : 'good') +
      kpi('Spill', Math.round(spill), 'person-periods', spill ? 'bad' : 'good') +
      kpi('Est. push', push + ' d', 'if levelled', push ? 'warn' : 'good') +
      '</div>' +
      (spill
        ? '<div class="verdict no"><b>Not resourceable as planned.</b> Demand exceeds availability in ' + over + ' periods. ' +
          'Options in increasing order of pain: <b>smooth</b> within available float (date unchanged), <b>level</b> and accept roughly ' + push +
          ' days of push, or <b>raise the limit</b> — which costs money and is constrained by site capacity, accommodation and permits.</div>'
        : '<div class="verdict ok"><b>Within the limit throughout.</b> The profile can be delivered with the labour available. Note that automatic levelling would not have been needed here — smoothing within float is always the first move.</div>');
    cv.draw(function(g, w, ht){
      var pad = {l:46, r:16, t:18, b:30};
      var iw = w - pad.l - pad.r, ih = ht - pad.t - pad.b;
      var mx = Math.max(peak, lim) * 1.12;
      function Y(v){ return pad.t + ih - (v / mx) * ih; }
      gridY(g, w, ht, pad, 4);
      var bw = iw / N;
      dem.forEach(function(v, i){
        var x = pad.l + i * bw;
        g.fillStyle = C.teal;
        g.fillRect(x + 1, Y(Math.min(v, lim)), bw - 2, pad.t + ih - Y(Math.min(v, lim)));
        if(v > lim){
          g.fillStyle = C.red;
          g.fillRect(x + 1, Y(v), bw - 2, Y(lim) - Y(v));
        }
      });
      g.strokeStyle = C.red; g.lineWidth = 2; g.setLineDash([6, 4]);
      g.beginPath(); g.moveTo(pad.l, Y(lim)); g.lineTo(w - pad.r, Y(lim)); g.stroke();
      g.setLineDash([]);
      tx(g, 'limit ' + lim, w - pad.r - 4, Y(lim) - 6, C.red, '700 11px Consolas', 'right');
      axes(g, w, ht, pad, 'period →', '');
      tx(g, Math.round(mx), pad.l - 6, pad.t + 8, C.mute, '10px Consolas', 'right');
      tx(g, '0', pad.l - 6, pad.t + ih, C.mute, '10px Consolas', 'right');
    });
    ctx.report({spill:Math.round(spill), limit:lim});
  }
  up();
 }
};

/* -- 6. Percent complete simulator ----------------------------------------- */
WIDGETS.pct = {
 t:"Percent complete simulator", tag:"duration · physical · units",
 chal:{text:"Create the situation a reviewer looks for: duration % ahead of physical % by 25 points or more.",
       test:function(s){ return s.dur - s.phys >= 25; }},
 mount:function(b, ctx){
  var c = h('div', {class:'ctrls'});
  var f1 = fld('Original duration (d)', 'range', {value:60, min:10, max:120, step:5}, up);
  var f2 = fld('Days elapsed', 'range', {value:36, min:0, max:120, step:1}, up);
  var f3 = fld('Physical % (entered)', 'range', {value:25, min:0, max:100, step:1}, up);
  var f4 = fld('Budgeted units', 'range', {value:4000, min:100, max:10000, step:100}, up);
  var f5 = fld('Actual units placed', 'range', {value:1000, min:0, max:10000, step:100}, up);
  [f1, f2, f3, f4, f5].forEach(function(f){ c.appendChild(f); });
  b.appendChild(c);
  var out = h('div'); b.appendChild(out);
  var cv = canvas(b, 0.22, 'Three progress measures compared as horizontal bars');
  function up(){
    var od = +f1.input.value, el = Math.min(+f2.input.value, +f1.input.value), ph = +f3.input.value;
    var bu = +f4.input.value, au = Math.min(+f5.input.value, +f4.input.value);
    var dur = od > 0 ? el / od * 100 : 0;
    var un = bu > 0 ? au / bu * 100 : 0;
    var rate = el > 0 ? ph / el : 0;
    var remReal = rate > 0 ? (100 - ph) / rate : Infinity;
    var remLin = od - el;
    out.innerHTML = '<div class="out">' +
      kpi('Duration %', dur.toFixed(1) + '%', 'elapsed ÷ original', 'warn') +
      kpi('Physical %', ph.toFixed(1) + '%', 'against rule of credit', 'good') +
      kpi('Units %', un.toFixed(1) + '%', 'actual ÷ budgeted') +
      kpi('Rem. dur (linear)', remLin + ' d', 'software default', 'warn') +
      kpi('Rem. dur (judged)', isFinite(remReal) ? Math.round(remReal) + ' d' : '—', 'at achieved rate', 'bad') +
      '</div>' +
      '<div class="verdict ' + (dur - ph >= 25 ? 'no' : 'hint') + '"><b>Duration % is ' +
      (dur - ph >= 0 ? (dur - ph).toFixed(1) + ' points ahead of physical %.' : (ph - dur).toFixed(1) + ' points behind physical %.') +
      '</b> ' + (dur - ph >= 25
        ? 'This is exactly the gap a reviewer hunts for. Reported on duration percent this activity looks ' + dur.toFixed(0) +
          '% done; the work says ' + ph.toFixed(0) + '%. At the achieved rate it needs ' + (isFinite(remReal) ? Math.round(remReal) : '—') +
          ' more days, not the ' + remLin + ' the software assumes.'
        : 'Duration percent measures the calendar; physical percent measures the work. They agree only by coincidence.') + '</div>' +
      '<div class="co warn" style="margin-top:12px"><b class="t">Two facts about P6</b>' +
      '<p>On <b>Physical</b> percent complete type, P6 does <b>not</b> auto-calculate actual units — you enter progress yourself, which is the point. ' +
      'And entering physical percent complete does <b>not</b> move the forecast finish date. Only remaining duration does that.</p></div>';
    cv.draw(function(g, w, ht){
      var pad = {l:96, r:60, t:14, b:14};
      var iw = w - pad.l - pad.r;
      [['Duration %', dur, C.amb], ['Physical %', ph, C.grn], ['Units %', un, C.teal]].forEach(function(r, i){
        var y = pad.t + i * 34;
        tx(g, r[0], pad.l - 8, y + 17, C.navy, '700 11px Arial', 'right');
        g.fillStyle = '#E9EEF3'; g.fillRect(pad.l, y, iw, 22);
        g.fillStyle = r[2]; g.fillRect(pad.l, y, iw * Math.min(r[1], 100) / 100, 22);
        tx(g, r[1].toFixed(1) + '%', pad.l + iw + 8, y + 16, r[2], '700 12px Consolas');
      });
    });
    ctx.report({dur:dur, phys:ph, units:un});
  }
  up();
 }
};

/* -- 7. S-curve explorer ---------------------------------------------------- */
WIDGETS.scurve = {
 t:"S-curve explorer", tag:"shape · histogram · where the peak sits",
 chal:{text:"Classify eight curves correctly. Pick the shape shown, then press Next. Eight in a row earns the badge.",
       test:function(s){ return s.streak >= 8; }},
 mount:function(b, ctx){
  var shapes = [
    {k:'normal', n:'Normal', c:0.50, s:11, d:'Symmetric S, periodic peak mid-project. Credible and resourceable.'},
    {k:'front',  n:'Front-loaded', c:0.32, s:9,  d:'Value pulled early. Sometimes legitimate (equipment payments), often a cash-flow play — and it leaves a mountain of work at the end.'},
    {k:'back',   n:'Back-loaded', c:0.70, s:9,  d:'Flat early, steep late. The most common shape in a programme already in trouble.'},
    {k:'linear', n:'Linear', c:0.5, s:99, d:'Total divided by number of months. Nobody thought about it, and it cannot be resourced.'}
  ];
  var cur = 0, streak = 0, best = 0, answered = false;
  var cv = canvas(b, 0.34, 'Cumulative S-curve with periodic histogram beneath');
  var btns = h('div', {class:'rowbtns', style:'margin-top:12px'});
  var out = h('div');
  b.appendChild(btns); b.appendChild(out);
  function val(sh, u){
    if(sh.k === 'linear') return u;
    return 1 / (1 + Math.exp(-sh.s * (u - sh.c)));
  }
  function draw(){
    var sh = shapes[cur];
    cv.setLabel('Cumulative curve, shape hidden — classify it');
    cv.draw(function(g, w, ht){
      var pad = {l:44, r:16, t:16, b:44};
      var iw = w - pad.l - pad.r, ih = ht - pad.t - pad.b;
      gridY(g, w, ht, pad, 4);
      var N = 24, prev = 0, mx = 0, bars = [];
      for(var i = 0; i < N; i++){
        var v = val(sh, (i + 1) / N) - prev; prev = val(sh, (i + 1) / N);
        bars.push(v); if(v > mx) mx = v;
      }
      bars.forEach(function(v, i){
        var bh = (v / mx) * ih * 0.42;
        g.fillStyle = '#DCE5EC';
        g.fillRect(pad.l + i * (iw / N) + 1, pad.t + ih - bh, iw / N - 2, bh);
      });
      var pts = [];
      for(var j = 0; j <= 60; j++){
        var u = j / 60;
        pts.push([pad.l + u * iw, pad.t + ih - val(sh, u) * ih]);
      }
      poly(g, pts, C.teal, 3);
      var pk = 0, pkI = 0;
      bars.forEach(function(v, i){ if(v > pk){ pk = v; pkI = i; } });
      var px = pad.l + (pkI + 0.5) * (iw / N);
      g.strokeStyle = C.red; g.setLineDash([4, 3]); g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(px, pad.t); g.lineTo(px, pad.t + ih); g.stroke(); g.setLineDash([]);
      tx(g, 'periodic peak @ ' + Math.round((pkI + 0.5) / N * 100) + '% elapsed', px, pad.t + 12, C.red, '700 10.5px Consolas', 'center');
      axes(g, w, ht, pad, 'elapsed duration →', '');
      tx(g, '100%', pad.l - 6, pad.t + 8, C.mute, '10px Consolas', 'right');
      tx(g, '50%', pad.l - 6, pad.t + ih / 2, C.mute, '10px Consolas', 'right');
      tx(g, '0%', pad.l - 6, pad.t + ih, C.mute, '10px Consolas', 'right');
      tx(g, 'at 50% elapsed: ' + Math.round(val(sh, 0.5) * 100) + '% of value earned',
         pad.l + 8, pad.t + ih + 26, C.navy, '700 11px Consolas');
    });
    btns.innerHTML = '';
    shapes.forEach(function(s2, i){
      var bt = h('button', {class:'btn sec sm'}, s2.n);
      bt.onclick = function(){ pick(i); };
      btns.appendChild(bt);
    });
    var stat = h('span', {class:'xs muted', style:'margin-left:auto'},
      'in a row <b class="mono">' + streak + '</b> / 8 &nbsp;·&nbsp; best <b class="mono">' + best + '</b>');
    btns.appendChild(stat);
    answered = false;
  }
  function pick(i){
    if(answered) return;
    answered = true;
    var sh = shapes[cur], ok = shapes[i].k === sh.k;
    if(ok){ streak++; if(streak > best) best = streak; } else { streak = 0; }
    out.innerHTML = '<div class="verdict ' + (ok ? 'ok' : 'no') + '"><b>' +
      (ok ? 'Correct — ' : 'Not quite — it is ') + sh.n + '.</b> ' + sh.d +
      ' At the halfway point it has earned ' + Math.round(val(sh, 0.5) * 100) + '% of value.</div>';
    var nx = h('button', {class:'btn sm'}, 'Next curve →');
    nx.onclick = function(){
      cur = Math.floor(Math.random() * shapes.length);
      out.innerHTML = ''; draw();
    };
    out.appendChild(nx);
    ctx.report({streak:streak});
  }
  cur = Math.floor(Math.random() * shapes.length);
  draw();
 }
};

/* -- 8. EVM lab ------------------------------------------------------------- */
WIDGETS.evm = {
 t:"Earned value lab", tag:"indices · variances · three EACs · TCPI",
 chal:{text:"Set BAC 250, PV 100, AC 96 — then find the EV that makes CPI exactly 1.00.",
       test:function(s){ return s.bac === 250 && s.pv === 100 && s.ac === 96 && Math.abs(s.ev - 96) < 0.51; }},
 mount:function(b, ctx){
  var c = h('div', {class:'ctrls'});
  var f1 = fld('BAC', 'number', {value:180, min:1, step:1}, up);
  var f2 = fld('PV', 'number', {value:98, min:0, step:1}, up);
  var f3 = fld('EV', 'number', {value:84, min:0, step:1}, up);
  var f4 = fld('AC', 'number', {value:96, min:0, step:1}, up);
  [f1, f2, f3, f4].forEach(function(f){ c.appendChild(f); });
  b.appendChild(c);
  b.appendChild(h('p', {class:'xs muted'}, 'Units are consistent — read them as AED millions if you like. All outputs recalculate as you type.'));
  var out = h('div'); b.appendChild(out);
  var cv = canvas(b, 0.30, 'Bar comparison of planned value, earned value and actual cost against budget at completion');
  function up(){
    var BAC = +f1.input.value || 0, PV = +f2.input.value || 0, EV = +f3.input.value || 0, AC = +f4.input.value || 0;
    var SPI = PV ? EV / PV : NaN, CPI = AC ? EV / AC : NaN;
    var SV = EV - PV, CV = EV - AC;
    var eac1 = AC + (BAC - EV);
    var eac2 = CPI ? BAC / CPI : NaN;
    var eac3 = (CPI && SPI) ? AC + (BAC - EV) / (CPI * SPI) : NaN;
    var VAC = BAC - eac2, ETC = eac2 - AC;
    var TCPI = (BAC - AC) ? (BAC - EV) / (BAC - AC) : NaN;
    var q, qc, qa;
    if(SPI >= 1 && CPI >= 1){ q = 'Ahead and under budget'; qc = 'good'; qa = 'Verify the progress claim before celebrating — this quadrant is also what an overstated percent complete looks like.'; }
    else if(SPI < 1 && CPI >= 1){ q = 'Behind but under budget'; qc = 'warn'; qa = 'Under-resourced. Add people — the budget headroom exists to do it. This is the easiest quadrant to fix.'; }
    else if(SPI >= 1 && CPI < 1){ q = 'Ahead but over budget'; qc = 'warn'; qa = 'Buying the schedule through overtime, extra crews or premium logistics. Fine if it is a decision; dangerous if it is a drift.'; }
    else { q = 'Behind AND over budget'; qc = 'bad'; qa = 'The serious quadrant — a productivity failure, rework, disruption or an estimate that was never achievable. Find the cause before forecasting.'; }
    var gap = TCPI - CPI;
    out.innerHTML = '<div class="out">' +
      kpi('SPI', num(SPI, 3), 'EV ÷ PV — schedule', SPI >= 1 ? 'good' : 'bad') +
      kpi('CPI', num(CPI, 3), 'EV ÷ AC — cost', CPI >= 1 ? 'good' : 'bad') +
      kpi('SV', (SV >= 0 ? '+' : '') + num(SV, 1), 'EV − PV', SV >= 0 ? 'good' : 'bad') +
      kpi('CV', (CV >= 0 ? '+' : '') + num(CV, 1), 'EV − AC', CV >= 0 ? 'good' : 'bad') +
      '</div><div class="out" style="margin-top:9px">' +
      kpi('EAC — one-off', num(eac1, 1), 'AC + (BAC − EV)') +
      kpi('EAC — standard', num(eac2, 1), 'BAC ÷ CPI', 'warn') +
      kpi('EAC — pessimistic', num(eac3, 1), 'AC + (BAC−EV)/(CPI×SPI)') +
      kpi('ETC', num(ETC, 1), 'EAC − AC') +
      kpi('VAC', (VAC >= 0 ? '+' : '') + num(VAC, 1), 'BAC − EAC', VAC >= 0 ? 'good' : 'bad') +
      kpi('TCPI', num(TCPI, 3), 'to recover BAC', TCPI > CPI + 0.1 ? 'bad' : 'good') +
      '</div>' +
      '<div class="verdict ' + (qc === 'bad' ? 'no' : qc === 'good' ? 'ok' : 'hint') + '"><b>Quadrant: ' + q + '.</b> ' + qa + '</div>' +
      (isFinite(gap) && gap > 0.1
        ? '<div class="verdict no"><b>Recovery to budget is not realistic.</b> TCPI of ' + num(TCPI, 3) +
          ' against a demonstrated CPI of ' + num(CPI, 3) + ' is a gap of ' + num(gap, 3) +
          '. Above roughly 0.10 you are asking a team to outperform everything it has done so far, for the whole remainder. Say so early.</div>'
        : isFinite(gap)
          ? '<div class="verdict ok"><b>Recovery to budget is plausible.</b> TCPI ' + num(TCPI, 3) + ' against CPI ' + num(CPI, 3) +
            ' is within reach of demonstrated performance.</div>' : '');
    cv.draw(function(g, w, ht){
      var pad = {l:52, r:16, t:16, b:28};
      var iw = w - pad.l - pad.r, ih = ht - pad.t - pad.b;
      var mx = Math.max(BAC, PV, EV, AC, eac2 || 0) * 1.1 || 1;
      function X(v){ return (v / mx) * iw; }
      [['PV', PV, C.navy], ['EV', EV, C.grn], ['AC', AC, C.red], ['BAC', BAC, '#9AA9B6']].forEach(function(r, i){
        var y = pad.t + i * (ih / 4.4);
        tx(g, r[0], pad.l - 8, y + 15, C.navy, '700 11px Consolas', 'right');
        g.fillStyle = '#EDF1F5'; g.fillRect(pad.l, y, iw, 20);
        g.fillStyle = r[2]; g.fillRect(pad.l, y, X(r[1]), 20);
        tx(g, num(r[1], 1), pad.l + X(r[1]) + 6, y + 15, r[2], '700 11px Consolas');
      });
      if(isFinite(eac2)){
        var ex = pad.l + X(eac2);
        g.strokeStyle = C.amb; g.lineWidth = 2; g.setLineDash([5, 3]);
        g.beginPath(); g.moveTo(ex, pad.t - 6); g.lineTo(ex, pad.t + ih); g.stroke(); g.setLineDash([]);
        tx(g, 'EAC ' + num(eac2, 1), ex, pad.t + ih + 16, C.amb, '700 11px Consolas', 'center');
      }
    });
    ctx.report({bac:BAC, pv:PV, ev:EV, ac:AC, cpi:CPI});
  }
  up();
 }
};

/* -- 9. Earned Schedule ------------------------------------------------------ */
WIDGETS.es = {
 t:"Earned Schedule", tag:"the horizontal gap · SPI vs SPI(t)",
 chal:{text:"With EV fixed at 41.0, set Actual Time so that SPI(t) is exactly 0.750 — the point at which IEAC(t) forecasts 32 months.",
       test:function(s){ return Math.abs(s.spit - 0.75) < 0.006; }, timed:true},
 mount:function(b, ctx){
  var PV = [[9, 36], [10, 40], [11, 45], [12, 51], [13, 57.5], [14, 64], [15, 70], [16, 76]];
  var c = h('div', {class:'ctrls'});
  var f1 = fld('Earned value to date', 'range', {value:41, min:34, max:74, step:0.5}, up);
  var f2 = fld('Actual time (months)', 'range', {value:14, min:9, max:16, step:0.1}, up);
  var f3 = fld('Planned duration (months)', 'range', {value:24, min:16, max:36, step:1}, up);
  [f1, f2, f3].forEach(function(f){ c.appendChild(f); });
  b.appendChild(c);
  var cv = canvas(b, 0.34, 'Planned value curve with the earned schedule point and the horizontal time gap marked');
  var out = h('div'); b.appendChild(out);
  function esOf(ev){
    if(ev <= PV[0][1]) return PV[0][0];
    for(var i = 0; i < PV.length - 1; i++){
      if(ev >= PV[i][1] && ev < PV[i + 1][1]){
        return PV[i][0] + (ev - PV[i][1]) / (PV[i + 1][1] - PV[i][1]);
      }
    }
    return PV[PV.length - 1][0];
  }
  function pvAt(m){
    if(m <= PV[0][0]) return PV[0][1];
    for(var i = 0; i < PV.length - 1; i++){
      if(m >= PV[i][0] && m <= PV[i + 1][0]){
        return PV[i][1] + (m - PV[i][0]) * (PV[i + 1][1] - PV[i][1]);
      }
    }
    return PV[PV.length - 1][1];
  }
  function up(){
    var EV = +f1.input.value, AT = +f2.input.value, PD = +f3.input.value;
    var ES = esOf(EV), PVnow = pvAt(AT);
    var SVt = ES - AT, SPIt = AT ? ES / AT : NaN;
    var SPI = PVnow ? EV / PVnow : NaN;
    var IEAC = SPIt ? PD / SPIt : NaN;
    out.innerHTML = '<div class="out">' +
      kpi('ES', num(ES, 2), 'months of plan earned', 'good') +
      kpi('AT', num(AT, 1), 'months elapsed') +
      kpi('SV(t)', num(SVt, 2), 'months', SVt >= 0 ? 'good' : 'bad') +
      kpi('SPI(t)', num(SPIt, 3), 'ES ÷ AT', SPIt >= 1 ? 'good' : 'bad') +
      kpi('SPI', num(SPI, 3), 'EV ÷ PV — currency', SPI >= 1 ? 'good' : 'bad') +
      kpi('IEAC(t)', num(IEAC, 1), 'forecast months', IEAC <= PD ? 'good' : 'bad') +
      '</div>' +
      '<div class="verdict ' + (SVt < -0.5 ? 'no' : 'ok') + '"><b>' +
      (SVt < 0 ? 'Behind by ' + num(-SVt, 2) + ' months.' : 'Ahead by ' + num(SVt, 2) + ' months.') +
      '</b> The conventional SPI reads ' + num(SPI, 3) + ' and the time-based SPI(t) reads ' + num(SPIt, 3) +
      '. They disagree, and that is normal — SPI is a ratio of money while SPI(t) is a ratio of time. ' +
      'IEAC(t) forecasts <b>' + num(IEAC, 1) + ' months</b> against a planned ' + PD +
      ', an overrun of ' + num(IEAC - PD, 1) + ' months. Use that as an independent challenge to the CPM forecast finish.</div>';
    cv.draw(function(g, w, ht){
      var pad = {l:52, r:18, t:18, b:34};
      var iw = w - pad.l - pad.r, ih = ht - pad.t - pad.b;
      var m0 = 9, m1 = 16, v0 = 30, v1 = 80;
      function X(m){ return pad.l + (m - m0) / (m1 - m0) * iw; }
      function Y(v){ return pad.t + ih - (v - v0) / (v1 - v0) * ih; }
      gridY(g, w, ht, pad, 4);
      poly(g, PV.map(function(p){ return [X(p[0]), Y(p[1])]; }), C.navy, 2.6);
      PV.forEach(function(p){
        dot(g, X(p[0]), Y(p[1]), 3, C.navy);
        tx(g, 'M' + p[0], X(p[0]), ht - pad.b + 15, C.mute, '10px Consolas', 'center');
      });
      g.strokeStyle = C.red; g.lineWidth = 1.6; g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(pad.l, Y(EV)); g.lineTo(X(AT), Y(EV)); g.stroke(); g.setLineDash([]);
      tx(g, 'EV ' + num(EV, 1), pad.l - 6, Y(EV) + 4, C.red, '700 10px Consolas', 'right');
      g.strokeStyle = C.rule; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(X(AT), pad.t); g.lineTo(X(AT), pad.t + ih); g.stroke(); g.setLineDash([]);
      tx(g, 'today', X(AT), pad.t - 4, C.navy, '700 10px Consolas', 'center');
      g.strokeStyle = C.amb; g.lineWidth = 6;
      g.beginPath(); g.moveTo(X(AT), Y(EV)); g.lineTo(X(AT), Y(pvAt(AT))); g.stroke();
      g.strokeStyle = C.vio; g.lineWidth = 6;
      g.beginPath(); g.moveTo(X(ES), Y(EV)); g.lineTo(X(AT), Y(EV)); g.stroke();
      dot(g, X(ES), Y(EV), 5.5, C.vio);
      tx(g, 'ES ' + num(ES, 2), X(ES), Y(EV) - 12, C.vio, '700 11px Consolas', 'center');
      tx(g, 'SV(t) = ' + num(SVt, 2) + ' months', (X(ES) + X(AT)) / 2, Y(EV) + 20, C.vio, '700 10.5px Consolas', 'center');
      tx(g, 'SV = ' + num(EV - pvAt(AT), 1), X(AT) + 8, (Y(EV) + Y(pvAt(AT))) / 2, C.amb, '700 10.5px Consolas');
      axes(g, w, ht, pad, '', '');
    });
    ctx.report({spit:SPIt, es:ES, at:AT});
  }
  up();
 }
};

/* -- 10. DCMA checker --------------------------------------------------------- */
WIDGETS.dcma = {
 t:"DCMA checker", tag:"nine thresholds · verdict on the dates",
 chal:{text:"Keep the activity count at 2,140 and adjust the rest until all nine tests pass.",
       test:function(s){ return s.total === 2140 && s.fails === 0; }},
 mount:function(b, ctx){
  var c = h('div', {class:'ctrls'});
  var F = {
    total:  fld('Total activities', 'number', {value:2140, min:1, step:10}, up),
    rels:   fld('Total relationships', 'number', {value:3880, min:1, step:10}, up),
    logic:  fld('Missing predecessor/successor', 'number', {value:206, min:0, step:1}, up),
    leads:  fld('Leads (negative lags)', 'number', {value:31, min:0, step:1}, up),
    lags:   fld('Relationships with lags', 'number', {value:174, min:0, step:1}, up),
    fs:     fld('Finish-to-Start relationships', 'number', {value:3240, min:0, step:10}, up),
    hard:   fld('Hard constraints', 'number', {value:58, min:0, step:1}, up),
    hifl:   fld('Activities TF > 44 d', 'number', {value:162, min:0, step:1}, up),
    negfl:  fld('Activities with negative float', 'number', {value:0, min:0, step:1}, up),
    hidur:  fld('Activities duration > 44 d', 'number', {value:94, min:0, step:1}, up),
    cpl:    fld('Critical path length (d)', 'number', {value:780, min:1, step:5}, up),
    tf:     fld('Total float on driving path', 'number', {value:34, step:1}, up)
  };
  for(var k in F) c.appendChild(F[k]);
  b.appendChild(c);
  var out = h('div'); b.appendChild(out);
  function v(k){ return +F[k].input.value || 0; }
  function up(){
    var tot = Math.max(1, v('total')), rels = Math.max(1, v('rels'));
    var cpl = Math.max(1, v('cpl'));
    var cpli = (cpl + v('tf')) / cpl;
    var T = [
      ['1', 'Logic', (v('logic') / tot * 100), '≤ 5%', v('logic') / tot <= 0.05, v('logic') + ' of ' + tot, '%'],
      ['2', 'Leads', v('leads'), '0', v('leads') === 0, 'count', ''],
      ['3', 'Lags', (v('lags') / rels * 100), '≤ 5%', v('lags') / rels <= 0.05, v('lags') + ' of ' + rels, '%'],
      ['4', 'Relationship types', (v('fs') / rels * 100), '≥ 90% FS', v('fs') / rels >= 0.90, v('fs') + ' FS of ' + rels, '%'],
      ['5', 'Hard constraints', (v('hard') / tot * 100), '≤ 5%', v('hard') / tot <= 0.05, v('hard') + ' of ' + tot, '%'],
      ['6', 'High float', (v('hifl') / tot * 100), '≤ 5%', v('hifl') / tot <= 0.05, v('hifl') + ' above 44 d TF', '%'],
      ['7', 'Negative float', v('negfl'), '0', v('negfl') === 0, 'activities', ''],
      ['8', 'High duration', (v('hidur') / tot * 100), '≤ 5%', v('hidur') / tot <= 0.05, v('hidur') + ' above 44 d', '%'],
      ['13', 'CPLI', cpli, '≥ 0.95', cpli >= 0.95, '(' + cpl + ' + ' + v('tf') + ') ÷ ' + cpl, 'x']
    ];
    var fails = T.filter(function(r){ return !r[4]; }).length;
    var rows = T.map(function(r){
      var val = r[6] === '%' ? num(r[2], 1) + '%' : (r[6] === 'x' ? num(r[2], 3) : r[2]);
      return '<tr style="background:' + (r[4] ? '#F2F9F5' : '#FCF2F1') + '"><td><b>' + r[0] + '</b></td><td>' + r[1] +
        '</td><td class="n"><b>' + val + '</b></td><td>' + r[3] + '</td><td>' + r[5] + '</td><td>' +
        (r[4] ? '<span class="tick">PASS</span>' : '<span class="cross">FAIL</span>') + '</td></tr>';
    }).join('');
    var verdict, vc;
    if(fails === 0){ verdict = 'The programme is mechanically sound. Every date is calculated by logic, so the critical path and float values can be relied on as a starting point. Now the real review begins — whether the logic reflects the construction method, whether the durations are achievable, and whether the histogram can be resourced.'; vc = 'ok'; }
    else if(fails <= 2){ verdict = 'Broadly sound with ' + fails + ' exception' + (fails > 1 ? 's' : '') + '. Justify each in the basis of schedule and the programme is usable. Dates can be trusted with the stated caveats.'; vc = 'hint'; }
    else if(fails <= 4){ verdict = fails + ' tests fail. Float values and the critical path are questionable. Treat the dates as indicative and require correction before the programme is used for entitlement or payment.'; vc = 'hint'; }
    else { verdict = fails + ' tests fail. The network does not calculate reliably, so the critical path, every float value and any future delay analysis built on this file are unsound. The dates cannot be trusted at all.'; vc = 'no'; }
    out.innerHTML = '<div class="out">' +
      kpi('Tests run', T.length) +
      kpi('Passed', T.length - fails, '', 'good') +
      kpi('Failed', fails, '', fails ? 'bad' : 'good') +
      kpi('CPLI', num(cpli, 3), 'threshold 0.95', cpli >= 0.95 ? 'good' : 'bad') +
      '</div>' +
      '<div class="tblwrap" style="margin-top:12px"><table class="dt"><thead><tr><th>#</th><th>Test</th><th>Result</th><th>Threshold</th><th>Basis</th><th>Verdict</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' +
      '<div class="verdict ' + vc + '"><b>How much can you trust the dates?</b> ' + verdict + '</div>' +
      '<div class="co warn" style="margin-top:12px"><b class="t">Do not game the tests</b><p>Every failure has a cosmetic fix. Too many open ends — link everything to the finish milestone. Too much high float — add constraints. Too many long activities — split them at day 44. Each fix passes the test and degrades the programme, and a reviewer who sees 200 activities linked directly to project completion now doubts everything else in the file.</p></div>';
    ctx.report({total:v('total'), fails:fails});
  }
  up();
 }
};

/* -- 11. PERT calculator ------------------------------------------------------ */
WIDGETS.pert = {
 t:"PERT calculator", tag:"te · SD · variances add, not SDs",
 chal:{text:"Set O, M and P on activity 1 so that te is exactly 30 days and its standard deviation is exactly 4 days.",
       test:function(s){ return Math.abs(s.te1 - 30) < 0.05 && Math.abs(s.sd1 - 4) < 0.05; }},
 mount:function(b, ctx){
  var c = h('div', {class:'ctrls'});
  var A = [
    {o:fld('Act 1 — Optimistic', 'range', {value:18, min:1, max:60, step:1}, up),
     m:fld('Act 1 — Most likely', 'range', {value:24, min:1, max:80, step:1}, up),
     p:fld('Act 1 — Pessimistic', 'range', {value:42, min:1, max:120, step:1}, up)},
    {o:fld('Act 2 — Optimistic', 'range', {value:11, min:1, max:60, step:1}, up),
     m:fld('Act 2 — Most likely', 'range', {value:15, min:1, max:80, step:1}, up),
     p:fld('Act 2 — Pessimistic', 'range', {value:23, min:1, max:120, step:1}, up)},
    {o:fld('Act 3 — Optimistic', 'range', {value:24, min:1, max:60, step:1}, up),
     m:fld('Act 3 — Most likely', 'range', {value:29, min:1, max:80, step:1}, up),
     p:fld('Act 3 — Pessimistic', 'range', {value:54, min:1, max:120, step:1}, up)}
  ];
  A.forEach(function(a){ c.appendChild(a.o); c.appendChild(a.m); c.appendChild(a.p); });
  b.appendChild(c);
  var cv = canvas(b, 0.30, 'Beta distribution curves for three activities with expected duration marked');
  var out = h('div'); b.appendChild(out);
  function up(){
    var clamped = false;
    var R = A.map(function(a){
      var O = +a.o.input.value, M = +a.m.input.value, P = +a.p.input.value;
      if(M < O){ M = O; clamped = true; }
      if(P < M){ P = M; clamped = true; }
      var te = (O + 4 * M + P) / 6, sd = (P - O) / 6;
      return {O:O, M:M, P:P, te:te, sd:sd, va:sd * sd};
    });
    var pathTe = R.reduce(function(s2, r){ return s2 + r.te; }, 0);
    var pathVar = R.reduce(function(s2, r){ return s2 + r.va; }, 0);
    var pathSd = Math.sqrt(pathVar);
    var wrongSd = R.reduce(function(s2, r){ return s2 + r.sd; }, 0);
    var rows = R.map(function(r, i){
      return '<tr><td><b>' + (i + 1) + '</b></td><td class="n">' + r.O + '</td><td class="n">' + r.M +
        '</td><td class="n">' + r.P + '</td><td class="n"><b>' + num(r.te, 2) + '</b></td><td class="n">' +
        num(r.sd, 3) + '</td><td class="n">' + num(r.va, 3) + '</td></tr>';
    }).join('');
    out.innerHTML = '<div class="out">' +
      kpi('Path te', num(pathTe, 2) + ' d', 'durations DO add', 'good') +
      kpi('Path variance', num(pathVar, 2), 'Σ of variances') +
      kpi('Path SD', num(pathSd, 2) + ' d', '√(Σ variances)', 'good') +
      kpi('If you added SDs', num(wrongSd, 2) + ' d', 'WRONG — overstates by ' + num((wrongSd / pathSd - 1) * 100, 0) + '%', 'bad') +
      '</div>' +
      '<div class="tblwrap" style="margin-top:12px"><table class="dt"><thead><tr><th>Act</th><th>O</th><th>M</th><th>P</th><th>te</th><th>SD</th><th>Variance</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' +
      '<div class="verdict ok"><b>Confidence ranges on the path.</b> With te ' + num(pathTe, 1) + ' d and SD ' + num(pathSd, 2) +
      ' d, roughly 68% of outcomes fall between <b>' + num(pathTe - pathSd, 1) + '</b> and <b>' + num(pathTe + pathSd, 1) +
      '</b> days (±1 SD), and about 95% between <b>' + num(pathTe - 2 * pathSd, 1) + '</b> and <b>' + num(pathTe + 2 * pathSd, 1) +
      '</b> days (±2 SD). This assumes approximate normality, which holds reasonably across a path of several activities.</div>' +
      '<div class="verdict no"><b>Variances add. Standard deviations do not.</b> Adding the three SDs directly gives ' +
      num(wrongSd, 2) + ' days against the correct ' + num(pathSd, 2) + ' — an overstatement of ' +
      num((wrongSd / pathSd - 1) * 100, 0) + '%. Adding SDs assumes every activity goes wrong simultaneously; in reality some run long while others run short, and that offsetting is real.</div>' +
      (clamped ? '<div class="verdict hint"><b>Values clamped.</b>A three-point estimate requires O ≤ M ≤ P. Where you have set them out of order the calculation has used the clamped values shown in the table.</div>' : '');
    cv.draw(function(g, w, ht){
      var pad = {l:40, r:16, t:16, b:28};
      var iw = w - pad.l - pad.r, ih = ht - pad.t - pad.b;
      var lo = Math.min.apply(null, R.map(function(r){ return r.O; })) - 4;
      var hi = Math.max.apply(null, R.map(function(r){ return r.P; })) + 4;
      function X(d){ return pad.l + (d - lo) / (hi - lo) * iw; }
      var cols = [C.teal, C.grn, C.vio];
      R.forEach(function(r, i){
        var pts = [], mxD = 0, tmp = [];
        /* Fixed step count. A float increment of (P−O)/60 becomes zero when the
           user drags O above P, which would loop forever. */
        var span = r.P - r.O;
        for(var s3 = 0; s3 <= 60; s3++){
          var d = r.O + span * (s3 / 60);
          var z = (d - r.te) / (r.sd || 1);
          var y = Math.exp(-z * z / 2);
          tmp.push([d, y]); if(y > mxD) mxD = y;
        }
        if(!mxD) mxD = 1;
        tmp.forEach(function(q){ pts.push([X(q[0]), pad.t + ih - (q[1] / mxD) * ih * 0.86]); });
        poly(g, pts, cols[i], 2.2);
        g.strokeStyle = cols[i]; g.lineWidth = 1.4; g.setLineDash([3, 3]);
        g.beginPath(); g.moveTo(X(r.te), pad.t + ih); g.lineTo(X(r.te), pad.t + ih * 0.14); g.stroke(); g.setLineDash([]);
        tx(g, 'te ' + num(r.te, 1), X(r.te), pad.t + 10 + i * 12, cols[i], '700 10px Consolas', 'center');
      });
      axes(g, w, ht, pad, 'duration (days) →', '');
      for(var d2 = Math.ceil(lo / 10) * 10; d2 <= hi; d2 += 10){
        tx(g, d2, X(d2), ht - pad.b + 15, C.mute, '10px Consolas', 'center');
      }
    });
    ctx.report({te1:R[0].te, sd1:R[0].sd});
  }
  up();
 }
};

/* -- 12. Crash optimiser ------------------------------------------------------ */
WIDGETS.crash = {
 t:"Crash optimiser", tag:"cheapest critical days first",
 chal:{text:"Save 12 days for under AED 350,000. Remember what crashing a non-critical activity buys you.",
       test:function(s){ return s.saved >= 12 && s.cost < 350000; }},
 mount:function(b, ctx){
  var ACT = [
    {n:'Piling',           crit:true,  max:8,  slope:22000},
    {n:'Steel erection',   crit:true,  max:10, slope:31000},
    {n:'Fencing',          crit:false, max:10, slope:9000, float:20}
  ];
  var PARALLEL_FLOAT = 15;
  var c = h('div', {class:'ctrls'});
  var F = ACT.map(function(a){
    return fld(a.n + (a.crit ? ' (critical)' : ' — ' + a.float + ' d float'), 'range',
      {value:0, min:0, max:a.max, step:1}, up);
  });
  F.forEach(function(f){ c.appendChild(f); });
  b.appendChild(c);
  var out = h('div'); b.appendChild(out);
  var cv = canvas(b, 0.30, 'Time cost trade-off showing cumulative days saved against cumulative cost');
  function up(){
    var cost = 0, critDays = 0, wasted = 0;
    ACT.forEach(function(a, i){
      var d = +F[i].input.value;
      cost += d * a.slope;
      if(a.crit) critDays += d; else wasted += d * a.slope;
    });
    var saved = Math.min(critDays, PARALLEL_FLOAT);
    var beyond = Math.max(0, critDays - PARALLEL_FLOAT);
    var eff = saved > 0 ? cost / saved : 0;
    var opt = [];
    var srt = ACT.map(function(a, i){ return {a:a, i:i}; })
                 .filter(function(x){ return x.a.crit; })
                 .sort(function(p, q){ return p.a.slope - q.a.slope; });
    var need = 12, optCost = 0;
    srt.forEach(function(x){
      var take = Math.min(need, x.a.max); need -= take; optCost += take * x.a.slope;
      if(take) opt.push(take + ' d from ' + x.a.n + ' @ ' + money(x.a.slope) + '/d = AED ' + money(take * x.a.slope));
    });
    out.innerHTML = '<div class="out">' +
      kpi('Days bought', critDays + ' d', 'on critical activities') +
      kpi('Days actually saved', saved + ' d', 'capped by parallel path', saved === critDays ? 'good' : 'bad') +
      kpi('Total cost', 'AED ' + money(cost), '', cost < 350000 ? 'good' : 'bad') +
      kpi('Effective rate', saved ? 'AED ' + money(eff) + '/d' : '—') +
      kpi('Wasted spend', 'AED ' + money(wasted), 'on non-critical work', wasted ? 'bad' : 'good') +
      '</div>' +
      (wasted > 0
        ? '<div class="verdict no"><b>You are compressing Fencing, which has ' + ACT[2].float + ' days of float.</b> It is the cheapest option per day at AED ' +
          money(ACT[2].slope) + ', and it saves the project nothing at all. Cost-per-day comparisons are only meaningful among activities that actually drive the completion date. AED ' +
          money(wasted) + ' spent for zero days.</div>'
        : '') +
      (beyond > 0
        ? '<div class="verdict no"><b>The critical path has moved.</b> A parallel chain carried ' + PARALLEL_FLOAT +
          ' days of float, so beyond ' + PARALLEL_FLOAT + ' days of compression that chain becomes critical and further crashing here buys nothing. You have paid for ' +
          beyond + ' days you did not get. Recalculate the critical path after every increment.</div>'
        : '') +
      '<div class="verdict ' + (saved >= 12 && cost < 350000 ? 'ok' : 'hint') + '"><b>Optimal solution for 12 days:</b> ' +
      opt.join(' &nbsp;+&nbsp; ') + ' &nbsp;=&nbsp; <b>AED ' + money(optCost) + '</b>. ' +
      'Buy the cheapest <i>critical</i> days first, exhaust that activity, then move to the next cheapest.</div>';
    cv.draw(function(g, w, ht){
      var pad = {l:60, r:20, t:18, b:32};
      var iw = w - pad.l - pad.r, ih = ht - pad.t - pad.b;
      var maxD = 18, maxC = 620000;
      function X(d){ return pad.l + d / maxD * iw; }
      function Y(v){ return pad.t + ih - v / maxC * ih; }
      gridY(g, w, ht, pad, 4);
      var pts = [[X(0), Y(0)]], cd = 0, cc = 0;
      srt.forEach(function(x){
        for(var k = 0; k < x.a.max; k++){ cd++; cc += x.a.slope; pts.push([X(cd), Y(cc)]); }
      });
      poly(g, pts, C.navy, 2.6);
      g.fillStyle = 'rgba(46,125,82,0.10)';
      g.fillRect(X(0), Y(350000), X(12) - X(0), Y(0) - Y(350000));
      g.strokeStyle = C.grn; g.setLineDash([5, 4]); g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(pad.l, Y(350000)); g.lineTo(w - pad.r, Y(350000)); g.stroke();
      g.beginPath(); g.moveTo(X(12), pad.t); g.lineTo(X(12), pad.t + ih); g.stroke(); g.setLineDash([]);
      tx(g, 'target 12 d', X(12), pad.t + 10, C.grn, '700 10px Consolas', 'center');
      tx(g, 'AED 350k', pad.l + 4, Y(350000) - 5, C.grn, '700 10px Consolas');
      g.strokeStyle = C.red; g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(X(PARALLEL_FLOAT), pad.t); g.lineTo(X(PARALLEL_FLOAT), pad.t + ih); g.stroke(); g.setLineDash([]);
      tx(g, 'parallel path becomes critical', X(PARALLEL_FLOAT) - 6, pad.t + 24, C.red, '700 10px Consolas', 'right');
      dot(g, X(saved), Y(cost), 6, C.amb);
      tx(g, 'you: ' + saved + ' d / AED ' + money(cost), X(saved), Y(cost) - 12, C.amb, '700 10.5px Consolas', 'center');
      axes(g, w, ht, pad, 'days saved →', '');
      for(var d = 0; d <= maxD; d += 3) tx(g, d, X(d), ht - pad.b + 15, C.mute, '10px Consolas', 'center');
      for(var v2 = 0; v2 <= maxC; v2 += 200000) tx(g, (v2 / 1000) + 'k', pad.l - 6, Y(v2) + 4, C.mute, '10px Consolas', 'right');
    });
    ctx.report({saved:saved, cost:cost});
  }
  up();
 }
};

/* -- 13. TIA simulator --------------------------------------------------------- */
WIDGETS.tia = {
 t:"TIA simulator", tag:"why the base programme changes the answer",
 chal:{text:"Set the baseline float so that Impacted As-Planned understates the delay by exactly 20 days.",
       test:function(s){ return s.diff === 20; }},
 mount:function(b, ctx){
  var c = h('div', {class:'ctrls'});
  var f1 = fld('Event duration (days)', 'range', {value:55, min:10, max:90, step:5}, up);
  var f2 = fld('Float on that chain — BASELINE', 'range', {value:20, min:0, max:60, step:1}, up);
  var f3 = fld('Float on that chain — AT EVENT DATE', 'range', {value:0, min:0, max:60, step:1}, up);
  [f1, f2, f3].forEach(function(f){ c.appendChild(f); });
  b.appendChild(c);
  b.appendChild(h('p', {class:'xs muted'},
    'Same event, same project. The only difference is which programme it is inserted into. By the event date the chain has consumed its float — which is exactly what happens on real projects.'));
  var cv = canvas(b, 0.32, 'Comparison of impact measured by impacted as-planned versus time impact analysis');
  var out = h('div'); b.appendChild(out);
  function up(){
    var ev = +f1.input.value, fB = +f2.input.value, fN = +f3.input.value;
    var iap = Math.max(0, ev - fB);
    var tia = Math.max(0, ev - fN);
    var diff = tia - iap;
    out.innerHTML = '<div class="out">' +
      kpi('Event duration', ev + ' d') +
      kpi('Impacted As-Planned', iap + ' d', 'MIP 3.6 — baseline base', 'bad') +
      kpi('Time Impact Analysis', tia + ' d', 'MIP 3.7 — updated base', 'good') +
      kpi('Difference', diff + ' d', 'understated by IAP', diff ? 'bad' : 'good') +
      '</div>' +
      '<div class="verdict ' + (diff ? 'no' : 'hint') + '"><b>' +
      (diff ? 'Impacted As-Planned understates the delay by ' + diff + ' days.'
            : 'With identical float in both programmes the two methods agree — which is the rare case.') +
      '</b> The baseline said this chain had ' + fB + ' days of float, so an analysis run on the untouched baseline absorbs ' +
      Math.min(ev, fB) + ' days of the event into float that <i>no longer existed</i> when the event actually struck. ' +
      'By the event date the chain had ' + fN + ' days. Time Impact Analysis uses the programme updated to immediately before the event and therefore measures ' +
      tia + ' days.</div>' +
      '<div class="co tip" style="margin-top:12px"><b class="t">The distinction in one line</b><p>Impacted As-Planned inserts the event into a programme that has already been overtaken by events. ' +
      'In the AACE taxonomy the difference between them is exactly <b>single base</b> (MIP 3.6) versus <b>multiple base</b> (MIP 3.7) — one fixed baseline, or a series of updated programmes.</p></div>';
    cv.draw(function(g, w, ht){
      var pad = {l:120, r:24, t:20, b:24};
      var iw = w - pad.l - pad.r;
      var mx = Math.max(ev + Math.max(fB, fN), 60) * 1.05;
      function X(d){ return pad.l + d / mx * iw; }
      [['BASELINE base', fB, iap, C.red, 0], ['UPDATED base', fN, tia, C.grn, 1]].forEach(function(r, i){
        var y = pad.t + i * 62;
        tx(g, r[0], pad.l - 10, y + 18, C.navy, '700 11px Arial', 'right');
        tx(g, i ? '(Time Impact Analysis)' : '(Impacted As-Planned)', pad.l - 10, y + 33, C.mute, '10px Consolas', 'right');
        g.fillStyle = C.navy; g.fillRect(pad.l, y, X(ev) - pad.l, 26);
        tx(g, 'event  ' + ev + ' d', pad.l + 8, y + 18, '#fff', '700 11px Arial');
        if(r[1] > 0){
          g.fillStyle = '#D7E2EA';
          g.fillRect(pad.l, y + 30, X(Math.min(r[1], ev)) - pad.l, 14);
          tx(g, r[1] + ' d float absorbs impact', pad.l + 6, y + 41, C.mute, '10px Consolas');
        }
        g.fillStyle = r[3];
        g.fillRect(X(Math.min(r[1], ev)), y + 30, X(r[2]) - X(0) , 14);
        tx(g, r[2] + ' d net impact', X(Math.min(r[1], ev)) + X(r[2]) - X(0) + 8, y + 41, r[3], '700 11px Consolas');
      });
      if(diff){
        var y2 = pad.t + 126;
        g.strokeStyle = C.amb; g.lineWidth = 5;
        g.beginPath(); g.moveTo(X(iap), y2); g.lineTo(X(tia), y2); g.stroke();
        tx(g, diff + ' days of delay that Impacted As-Planned simply loses',
           X(iap) + 8, y2 - 8, C.amb, '700 11px Consolas');
      }
    });
    ctx.report({diff:diff});
  }
  up();
 }
};

/* -- 15. EOT entitlement calculator -------------------------------------------- */
WIDGETS.eot = {
 t:"EOT entitlement calculator", tag:"time · money · residual LD exposure",
 chal:{text:"Set the concurrency overlap so the contractor keeps every day of extension of time but recovers money for only 75 of them.",
       test:function(s){ return s.eot === 117 && s.compensable === 75; }},
 mount:function(b, ctx){
  var EV = [
   {r:'DE-01', n:'Late site access — land handover', party:'E', d:62},
   {r:'DE-02', n:'GIS subcontractor mobilised late',  party:'C', d:40},
   {r:'DE-03', n:'Exceptionally adverse weather',     party:'N', d:18},
   {r:'DE-04', n:'Variation — two extra 33kV bays',   party:'E', d:55},
   {r:'DE-05', n:'Rework after failed internal QA',   party:'C', d:34}
  ];
  var PARTY = {E:['Employer', 'var(--grn)'], C:['Contractor', 'var(--red)'], N:['Neutral', 'var(--amb)']};
  var c = h('div', {class:'ctrls'});
  var F = EV.map(function(e){
    return fld(e.r + ' — ' + PARTY[e.party][0] + ' (days)', 'range', {value:e.d, min:0, max:90, step:1}, up);
  });
  var crit = EV.map(function(e){
    return fld(e.r + ' on the critical path?', 'select', {opts:[{v:'1', t:'Yes — driving completion'}, {v:'0', t:'No — has float'}]}, up);
  });
  F.forEach(function(f, i){ c.appendChild(f); c.appendChild(crit[i]); });
  var fOv = fld('Concurrency overlap (days)', 'range', {value:28, min:0, max:117, step:1}, up);
  var fLD = fld('LD rate (AED/day)', 'number', {value:145000, min:0, step:5000}, up);
  var fPr = fld('Prolongation rate (AED/day)', 'number', {value:62000, min:0, step:1000}, up);
  [fOv, fLD, fPr].forEach(function(f){ c.appendChild(f); });
  b.appendChild(c);
  var out = h('div'); b.appendChild(out);
  var cv = canvas(b, 0.26, 'Stacked bar showing days of delay split into compensable, time-only and non-excusable');
  function up(){
    var e = 0, cD = 0, n = 0, nonCrit = 0;
    EV.forEach(function(x, i){
      var d = +F[i].input.value, on = crit[i].input.value === '1';
      if(!on){ nonCrit += d; return; }
      if(x.party === 'E') e += d;
      else if(x.party === 'C') cD += d;
      else n += d;
    });
    var ov = Math.min(+fOv.input.value, e);
    var eot = e + n;                      // employer + neutral critical days
    var comp = Math.max(0, e - ov);       // employer days not concurrent
    var timeOnly = n + ov;                // neutral days + concurrent employer days
    var total = e + cD + n;
    var ldDays = cD;                      // contractor-caused lateness keeps LD exposure
    var ld = ldDays * (+fLD.input.value || 0);
    var pro = comp * (+fPr.input.value || 0);
    out.innerHTML = '<div class="out">' +
      kpi('Total delay', total + ' d', 'to completion') +
      kpi('EOT awarded', eot + ' d', 'employer + neutral', 'good') +
      kpi('Compensable', comp + ' d', 'time AND money', 'good') +
      kpi('Time only', timeOnly + ' d', 'neutral + concurrent', 'warn') +
      kpi('Non-excusable', cD + ' d', 'contractor risk', 'bad') +
      kpi('Off the critical path', nonCrit + ' d', 'no entitlement at all') +
      '</div><div class="out" style="margin-top:9px">' +
      kpi('Prolongation', 'AED ' + money(pro), comp + ' d × rate', 'good') +
      kpi('LD exposure', 'AED ' + money(ld), ldDays + ' d × rate', ld ? 'bad' : 'good') +
      kpi('Net position', (pro - ld >= 0 ? '+' : '−') + 'AED ' + money(Math.abs(pro - ld)), '', pro - ld >= 0 ? 'good' : 'bad') +
      '</div>' +
      '<div class="verdict ' + (comp < e ? 'hint' : 'ok') + '"><b>' +
      (ov > 0
        ? 'Concurrency separates time from money.' +
          ' The contractor still receives all ' + eot + ' days of extension of time, but ' + ov +
          ' of the employer days run concurrently with its own critical delay, so those ' + ov +
          ' days carry no prolongation cost. Money is recovered on ' + comp + ' days only.'
        : 'No concurrency asserted. All ' + e + ' employer days carry both time and money, and the ' + n +
          ' neutral days carry time alone.') +
      '</b></div>' +
      (nonCrit > 0
        ? '<div class="verdict no"><b>' + nonCrit + ' days sit off the critical path and earn nothing.</b> ' +
          'An employer event on a chain with float caused no delay to completion, so there is nothing to claim and nothing to be concurrent with. ' +
          'This is where most asserted concurrency dissolves — at test one.</div>'
        : '') +
      '<div class="co tip" style="margin-top:12px"><b class="t">Do not net the two sides</b>' +
      '<p>The contractor caused ' + cD + ' days and the employer caused ' + e + ' days. The extension of time is <b>' + eot +
      ' days</b>, not ' + (e - cD) + '. Contractor delay does not cancel employer delay — it simply earns no relief of its own, ' +
      'and shows up as the ' + cD + ' days on which liquidated damages still bite.</p></div>';
    cv.draw(function(g, w, ht){
      var pad = {l:16, r:16, t:26, b:34};
      var iw = w - pad.l - pad.r;
      var mx = Math.max(total + nonCrit, 1);
      var segs = [[comp, C.grn, 'compensable ' + comp + 'd'],
                  [timeOnly, C.amb, 'time only ' + timeOnly + 'd'],
                  [cD, C.red, 'non-excusable ' + cD + 'd'],
                  [nonCrit, '#B9C7D4', 'no entitlement ' + nonCrit + 'd']];
      var x = pad.l;
      segs.forEach(function(s2){
        var sw = s2[0] / mx * iw;
        if(sw <= 0) return;
        g.fillStyle = s2[1];
        g.fillRect(x, pad.t, sw, 40);
        if(sw > 74) tx(g, s2[2], x + sw / 2, pad.t + 25, '#fff', '700 11px Arial', 'center');
        x += sw + 1;
      });
      tx(g, 'Total delay to completion: ' + total + ' days', pad.l, pad.t - 8, C.navy, '700 11px Arial');
      var ex = pad.l + eot / mx * iw;
      g.strokeStyle = C.navy; g.lineWidth = 2; g.setLineDash([5, 3]);
      g.beginPath(); g.moveTo(ex, pad.t - 4); g.lineTo(ex, pad.t + 52); g.stroke(); g.setLineDash([]);
      tx(g, 'EOT ' + eot + ' d', ex, pad.t + 66, C.navy, '700 11px Consolas', 'center');
      var lx = pad.l;
      segs.forEach(function(s2){
        if(s2[0] <= 0) return;
        g.fillStyle = s2[1]; g.fillRect(lx, ht - 14, 10, 10);
        tx(g, s2[2], lx + 14, ht - 5, C.mute, '10px Consolas');
        lx += 14 + s2[2].length * 5.6 + 14;
      });
    });
    ctx.report({eot:eot, compensable:comp, timeOnly:timeOnly, nonExcusable:cD});
  }
  up();
 }
};

/* -- 16. Windows analysis ------------------------------------------------------- */
WIDGETS.windows = {
 t:"Windows analysis", tag:"the driving path moves between windows",
 chal:{text:"Build a case where the contractor caused MORE total delay than the employer, yet is still entitled to 40 days or more of extension of time.",
       test:function(s){ return s.contractor > s.employer && s.employer >= 40; }},
 mount:function(b, ctx){
  var WN = [
   {n:'W1  M1–M4',   p:'Access → earthworks → foundations'},
   {n:'W2  M5–M9',   p:'GIS procurement → manufacture → FAT'},
   {n:'W3  M10–M14', p:'New 33kV bays → cable → termination'},
   {n:'W4  M15–M18', p:'Panel wiring → pre-comm → energisation'}
  ];
  var c = h('div', {class:'ctrls'});
  var E = [], K = [];
  WN.forEach(function(w, i){
    E.push(fld(w.n + ' — employer days', 'range', {value:[41,0,55,0][i], min:0, max:60, step:1}, up));
    K.push(fld(w.n + ' — contractor days', 'range', {value:[0,40,0,34][i], min:0, max:60, step:1}, up));
    c.appendChild(E[i]); c.appendChild(K[i]);
  });
  b.appendChild(c);
  var cv = canvas(b, 0.34, 'Cumulative project slip by window split between employer and contractor causes');
  var out = h('div'); b.appendChild(out);
  function up(){
    var e = 0, k = 0, rows = WN.map(function(w, i){
      var ed = +E[i].input.value, kd = +K[i].input.value;
      e += ed; k += kd;
      return {w:w, e:ed, k:kd, drv: ed > kd ? 'Employer' : kd > ed ? 'Contractor' : (ed ? 'Both — concurrent' : 'No slip')};
    });
    var total = e + k;
    out.innerHTML = '<div class="out">' +
      kpi('Total slip', total + ' d') +
      kpi('Employer-caused', e + ' d', '', 'good') +
      kpi('Contractor-caused', k + ' d', '', 'bad') +
      kpi('EOT entitlement', e + ' d', 'NOT ' + (e - k) + ' d', 'good') +
      '</div>' +
      '<div class="tblwrap" style="margin-top:12px"><table class="dt"><thead><tr><th>Window</th><th>Driving path in that window</th><th>Employer</th><th>Contractor</th><th>Attributed to</th></tr></thead><tbody>' +
      rows.map(function(r){
        return '<tr><td><b>' + r.w.n + '</b></td><td>' + r.w.p + '</td><td class="n">' + r.e +
          ' d</td><td class="n">' + r.k + ' d</td><td>' + r.drv + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="verdict ' + (k > e && e >= 40 ? 'ok' : 'hint') + '"><b>' +
      (k > e
        ? 'The contractor caused more delay than the employer — and is still entitled to ' + e + ' days.'
        : 'The employer caused ' + e + ' days; the contractor ' + k + '.') +
      '</b> Entitlement is not a net figure. The contractor recovers ' + e +
      ' days of extension of time because the employer caused ' + e +
      ' days of critical delay, and separately bears its own ' + k +
      ' days as liquidated damages exposure. Netting them to ' + (e - k) +
      ' days is the most commonly argued error in delay disputes.</div>' +
      '<div class="co tip" style="margin-top:12px"><b class="t">Why windows, and not one whole-project analysis</b>' +
      '<p>The driving path is a different chain in every window above. In W3 it runs through scope that did not exist at baseline. ' +
      'Any method that inserts every event into the original baseline attributes all of them to whatever the baseline said was critical — ' +
      'and gets three of these four windows wrong, with complete internal consistency.</p></div>';
    cv.draw(function(g, w, ht){
      var pad = {l:52, r:16, t:20, b:44};
      var iw = w - pad.l - pad.r, ih = ht - pad.t - pad.b;
      var mx = Math.max(total, 20) * 1.1;
      function Y(v){ return pad.t + ih - v / mx * ih; }
      gridY(g, w, ht, pad, 4);
      var bw = iw / WN.length, run = 0;
      rows.forEach(function(r, i){
        var x = pad.l + i * bw;
        var eh = r.e / mx * ih, kh = r.k / mx * ih;
        g.fillStyle = C.grn;
        g.fillRect(x + bw * 0.12, Y(run + r.e), bw * 0.76, eh);
        g.fillStyle = C.red;
        g.fillRect(x + bw * 0.12, Y(run + r.e + r.k), bw * 0.76, kh);
        run += r.e + r.k;
        tx(g, r.w.n.split('  ')[0], x + bw / 2, ht - pad.b + 16, C.navy, '700 11px Consolas', 'center');
        tx(g, r.w.n.split('  ')[1] || '', x + bw / 2, ht - pad.b + 30, C.mute, '10px Consolas', 'center');
        if(r.e + r.k > 0) tx(g, '+' + (r.e + r.k) + 'd', x + bw / 2, Y(run) - 6, C.navy, '700 10.5px Consolas', 'center');
      });
      g.strokeStyle = C.navy; g.lineWidth = 1.4; g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(pad.l, Y(total)); g.lineTo(w - pad.r, Y(total)); g.stroke(); g.setLineDash([]);
      tx(g, 'total ' + total + ' d', w - pad.r - 4, Y(total) - 6, C.navy, '700 10px Consolas', 'right');
      axes(g, w, ht, pad, '', '');
      tx(g, 'cumulative slip (days)', pad.l - 6, pad.t + 8, C.mute, '10px Consolas', 'right');
      g.fillStyle = C.grn; g.fillRect(pad.l, pad.t - 12, 9, 9);
      tx(g, 'employer', pad.l + 13, pad.t - 4, C.mute, '10px Consolas');
      g.fillStyle = C.red; g.fillRect(pad.l + 76, pad.t - 12, 9, 9);
      tx(g, 'contractor', pad.l + 89, pad.t - 4, C.mute, '10px Consolas');
    });
    ctx.report({employer:e, contractor:k, total:total});
  }
  up();
 }
};

/* -- 14. The $1 rule ----------------------------------------------------------- */
WIDGETS.dollar = {
 t:"The $1 rule", tag:"unit price 1.00 versus contract rate",
 chal:{text:"Adjust GIS supply progress until the weightage basis and the cost basis report the same overall percent complete.",
       test:function(s){ return Math.abs(s.wPct - s.cPct) < 0.3; }},
 mount:function(b, ctx){
  var ACT = [
    {n:'Mobilisation',       units:100, cost:3000000,  p:100},
    {n:'Foundations',        units:400, cost:8000000,  p:60},
    {n:'GIS supply &amp; delivery', units:200, cost:40000000, p:30},
    {n:'GIS installation',   units:300, cost:9000000,  p:10}
  ];
  var c = h('div', {class:'ctrls'});
  var F = ACT.map(function(a){
    return fld(a.n.replace('&amp;', '&') + ' — % complete', 'range', {value:a.p, min:0, max:100, step:1}, up);
  });
  F.forEach(function(f){ c.appendChild(f); });
  var mode = fld('Resource priced at', 'select', {opts:[
    {v:'1', t:'1.00 — the weightage resource'}, {v:'c', t:'Contract rate — the cost resource'}]}, up);
  c.appendChild(mode);
  b.appendChild(c);
  var out = h('div'); b.appendChild(out);
  var cv = canvas(b, 0.26, 'Two progress bars comparing weightage-based and cost-based percent complete');
  function up(){
    var tu = 0, tc = 0, eu = 0, ec = 0;
    var rows = ACT.map(function(a, i){
      var p = +F[i].input.value / 100;
      tu += a.units; tc += a.cost; eu += a.units * p; ec += a.cost * p;
      return {a:a, p:p};
    });
    var wPct = tu ? eu / tu * 100 : 0;
    var cPct = tc ? ec / tc * 100 : 0;
    var m = mode.input.value;
    var shown = m === '1' ? wPct : cPct;
    var tbl = rows.map(function(r){
      return '<tr><td>' + r.a.n + '</td><td class="n">' + r.a.units + '</td><td class="n">' +
        num(r.a.units / tu * 100, 1) + '%</td><td class="n">' + money(r.a.cost) + '</td><td class="n">' +
        num(r.a.cost / tc * 100, 1) + '%</td><td class="n">' + num(r.p * 100, 0) + '%</td></tr>';
    }).join('');
    out.innerHTML = '<div class="out">' +
      kpi('Performance % (P6)', num(shown, 1) + '%', m === '1' ? 'unit price 1.00' : 'unit price = contract rate', 'good') +
      kpi('Weightage basis', num(wPct, 1) + '%', 'units ÷ total units') +
      kpi('Cost basis', num(cPct, 1) + '%', 'value ÷ total value') +
      kpi('Divergence', num(Math.abs(wPct - cPct), 1) + ' pts', '', Math.abs(wPct - cPct) < 0.3 ? 'good' : 'bad') +
      '</div>' +
      '<div class="tblwrap" style="margin-top:12px"><table class="dt"><thead><tr><th>Activity</th><th>Units</th><th>Weightage</th><th>Cost (AED)</th><th>Cost share</th><th>% done</th></tr></thead><tbody>' +
      tbl + '</tbody></table></div>' +
      '<div class="verdict ' + (Math.abs(wPct - cPct) < 0.3 ? 'ok' : 'hint') + '"><b>Same programme, same progress entries, ' +
      (Math.abs(wPct - cPct) < 0.3 ? 'and the two bases now agree.' : 'two different answers — ' + num(wPct, 1) + '% and ' + num(cPct, 1) + '%.') +
      '</b> Nothing changed except the unit price on the resource. GIS supply is ' + num(ACT[2].cost / tc * 100, 1) +
      '% of the money but only ' + num(ACT[2].units / tu * 100, 1) +
      '% of the weighted work, so cost-based progress leaps when equipment is delivered while physical work has barely moved. ' +
      'This is the whole argument for the two-resource structure: price the weightage resource at 1.00 so Performance % Complete reads weighted physical progress, and keep the money on a separate Material resource.</div>';
    cv.draw(function(g, w, ht){
      var pad = {l:110, r:56, t:18, b:16};
      var iw = w - pad.l - pad.r;
      [['Weightage', wPct, C.teal], ['Cost', cPct, C.grn]].forEach(function(r, i){
        var y = pad.t + i * 40;
        tx(g, r[0] + ' basis', pad.l - 10, y + 20, C.navy, '700 11px Arial', 'right');
        g.fillStyle = '#E9EEF3'; g.fillRect(pad.l, y, iw, 28);
        g.fillStyle = r[2]; g.fillRect(pad.l, y, iw * r[1] / 100, 28);
        tx(g, num(r[1], 1) + '%', pad.l + iw + 8, y + 20, r[2], '700 13px Consolas');
      });
      var d = Math.abs(wPct - cPct);
      if(d > 0.3){
        var x1 = pad.l + iw * Math.min(wPct, cPct) / 100, x2 = pad.l + iw * Math.max(wPct, cPct) / 100;
        g.fillStyle = 'rgba(176,49,39,0.12)';
        g.fillRect(x1, pad.t - 6, x2 - x1, 82);
        tx(g, num(d, 1) + ' points apart', (x1 + x2) / 2, pad.t + 88, C.red, '700 11px Consolas', 'center');
      }
    });
    ctx.report({wPct:wPct, cPct:cPct});
  }
  up();
 }
};
