(function () {
  'use strict';

  /* ---------- Settings ---------- */
  var SILENCE_MS = 10000;           // mic turns off after this much silence
  var SLOW_NOTE_MS = 8000;          // first "still working" note
  var CLOSING_NOTE_MS = 30000;      // second note
  var STORE_KEY = 'event-agent-chat';
  var MAX_SEND_CHARS = 30000;
  var MAX_MSG_CHARS = 6000;
  var AGENT_NAME = 'Event Agent';
  var PROJECT_SLUG = 'event-agent';

  /* ---------- Elements ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var log = $('log');
  var logEmpty = $('log-empty');
  var input = $('chat-input');
  var sendBtn = $('send-btn');
  var micBtn = $('mic-btn');
  var micStatus = $('mic-status');
  var errorLine = $('error-line');
  var countChip = $('count-chip');
  var downloadBtn = $('download-btn');
  var resetBtn = $('reset-btn');
  var fullBtn = $('full-btn');
  var chatCard = document.querySelector('.chat-card');
  var chatSlot = document.querySelector('.chat-slot');

  /* ---------- State ---------- */
  var state = { messages: [], matches: [], selectedId: null };
  var busy = false;

  function saveState() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }
  function loadState() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (s && Array.isArray(s.messages)) {
        state.messages = s.messages.filter(function (m) {
          return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
        });
        state.matches = Array.isArray(s.matches) ? s.matches.map(cleanMatch).filter(Boolean) : [];
        state.selectedId = typeof s.selectedId === 'string' ? s.selectedId : null;
      }
    } catch (e) { /* ignore broken storage */ }
  }

  /* ---------- MATCH parsing ---------- */
  var MATCH_LINE = /^\s*MATCH:/;

  function cleanMatch(m) {
    if (!m || typeof m !== 'object') return null;
    var id = typeof m.id === 'string' ? m.id.trim().toLowerCase() : '';
    var title = typeof m.title === 'string' ? m.title.trim() : '';
    if (!id || !title) return null;
    var score = Math.round(Number(m.score));
    if (!isFinite(score)) score = 0;
    score = Math.max(0, Math.min(100, score));
    var details = {};
    if (m.details && typeof m.details === 'object') {
      Object.keys(m.details).slice(0, 12).forEach(function (k) {
        var v = m.details[k];
        if (typeof v === 'string' || typeof v === 'number') details[String(k).slice(0, 60)] = String(v).slice(0, 400);
      });
    }
    return {
      id: id.slice(0, 80),
      title: title.slice(0, 120),
      score: score,
      why: typeof m.why === 'string' ? m.why.slice(0, 400) : '',
      details: details
    };
  }

  function parseMatches(text) {
    var out = [];
    String(text).split(/\r?\n/).forEach(function (line) {
      if (!MATCH_LINE.test(line)) return;
      var json = line.replace(MATCH_LINE, '').trim();
      try {
        var m = cleanMatch(JSON.parse(json));
        if (m && !out.some(function (x) { return x.id === m.id; })) out.push(m);
      } catch (e) { /* malformed MATCH line: ignore */ }
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  function visibleText(text) {
    return String(text).split(/\r?\n/)
      .filter(function (line) { return !MATCH_LINE.test(line); })
      .map(function (line) { return line.replace(/\*\*/g, '').replace(/^#{1,6}\s+/, ''); })
      .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* ---------- Safe rich text (textContent only) ---------- */
  var URL_RE = /https:\/\/[^\s<>"')\]]+/g;

  function appendLinked(el, str) {
    var last = 0;
    var m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(str)) !== null) {
      var url = m[0].replace(/[.,;:!?]+$/, '');
      if (m.index > last) el.appendChild(document.createTextNode(str.slice(last, m.index)));
      var a = document.createElement('a');
      a.href = url;
      a.textContent = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      el.appendChild(a);
      last = m.index + url.length;
      URL_RE.lastIndex = last;
    }
    if (last < str.length) el.appendChild(document.createTextNode(str.slice(last)));
  }

  function renderRich(container, text) {
    var blocks = text.split(/\n\s*\n/);
    blocks.forEach(function (block) {
      var lines = block.split('\n').filter(function (l) { return l.trim() !== ''; });
      var p = null;
      var ul = null;
      lines.forEach(function (l) {
        if (/^\s*[-•]\s+/.test(l)) {
          p = null;
          if (!ul) { ul = document.createElement('ul'); container.appendChild(ul); }
          var li = document.createElement('li');
          appendLinked(li, l.replace(/^\s*[-•]\s+/, ''));
          ul.appendChild(li);
        } else {
          ul = null;
          if (!p) { p = document.createElement('p'); container.appendChild(p); }
          else p.appendChild(document.createElement('br'));
          appendLinked(p, l);
        }
      });
    });
  }

  /* ---------- Log rendering ---------- */
  function addBubble(role, text) {
    var div = document.createElement('div');
    div.className = 'msg ' + (role === 'user' ? 'user' : 'bot');
    var label = document.createElement('span');
    label.className = 'sr-only';
    label.textContent = role === 'user' ? 'You said: ' : AGENT_NAME + ' said: ';
    div.appendChild(label);
    renderRich(div, role === 'user' ? text : visibleText(text));
    log.appendChild(div);
    return div;
  }

  function addErrorBubble(text) {
    var div = document.createElement('div');
    div.className = 'msg error';
    div.setAttribute('role', 'alert');
    div.textContent = text;
    log.appendChild(div);
    scrollLog();
  }

  function scrollLog() { log.scrollTop = log.scrollHeight; }

  function renderLog() {
    while (log.firstChild) log.removeChild(log.firstChild);
    log.appendChild(logEmpty);
    logEmpty.hidden = state.messages.length > 0;
    state.messages.forEach(function (m) { addBubble(m.role, m.content); });
    updateCount();
    updateDownload();
    scrollLog();
  }

  function updateCount() {
    var n = state.messages.length;
    countChip.textContent = n === 0 ? 'No messages yet' : (n === 1 ? '1 message' : n + ' messages');
  }

  function hasReply() {
    return state.messages.some(function (m) { return m.role === 'assistant'; });
  }

  function updateDownload() { downloadBtn.disabled = !hasReply(); }

  /* ---------- Side cards ---------- */
  function guideHref(id) {
    return /^[a-z0-9-]{1,80}$/.test(id) ? '/guide#' + id : '/guide';
  }

  function latestNextStep() {
    for (var i = state.messages.length - 1; i >= 0; i -= 1) {
      if (state.messages[i].role !== 'assistant') continue;
      var lines = visibleText(state.messages[i].content).split('\n');
      for (var j = 0; j < lines.length; j += 1) {
        var m = lines[j].match(/^\s*Next step:\s*(.+)$/i);
        if (m) return m[1].trim();
      }
      return '';
    }
    return '';
  }

  function renderSide() {
    var matches = state.matches;
    var top = matches[0];
    $('match-name').textContent = top ? top.title : 'Waiting for your first question';
    $('match-score').textContent = top ? String(top.score) : '—';
    $('match-why').textContent = top ? (top.why || 'Closest playbook so far.') : "The closest sales playbook appears here after the agent's first verdict.";

    var fill = $('gauge-fill');
    fill.setAttribute('stroke-dasharray', (top ? top.score : 0) + ' 100');
    $('gauge-num').textContent = top ? String(top.score) : '—';

    var list = $('match-list');
    while (list.firstChild) list.removeChild(list.firstChild);
    $('list-empty').hidden = matches.length > 0;
    matches.forEach(function (m) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'match-btn';
      b.setAttribute('data-id', m.id);
      b.setAttribute('aria-pressed', m.id === state.selectedId ? 'true' : 'false');
      var t = document.createElement('span');
      t.className = 'match-title';
      t.textContent = m.title;
      var s = document.createElement('span');
      s.className = 'score';
      s.textContent = m.score + '/100';
      b.appendChild(t);
      b.appendChild(s);
      li.appendChild(b);
      list.appendChild(li);
    });

    var sel = matches.filter(function (m) { return m.id === state.selectedId; })[0] || top;
    var dl = $('detail-list');
    while (dl.firstChild) dl.removeChild(dl.firstChild);
    var link = $('guide-link');
    var nextWrap = $('next-step');
    if (!sel) {
      $('detail-name').textContent = 'Pick a match to see its details.';
      link.hidden = true;
      nextWrap.hidden = true;
      return;
    }
    $('detail-name').textContent = sel.title;
    Object.keys(sel.details).forEach(function (k) {
      if (/^(next step|guide)$/i.test(k)) return;
      var row = document.createElement('div');
      var dt = document.createElement('dt');
      dt.textContent = k;
      var dd = document.createElement('dd');
      dd.textContent = sel.details[k];
      row.appendChild(dt);
      row.appendChild(dd);
      dl.appendChild(row);
    });
    link.href = guideHref(sel.id);
    link.hidden = false;
    var next = sel.details['Next step'] || latestNextStep();
    $('next-text').textContent = next;
    nextWrap.hidden = !next;
  }

  $('match-list').addEventListener('click', function (e) {
    var b = e.target.closest('.match-btn');
    if (!b) return;
    state.selectedId = b.getAttribute('data-id');
    saveState();
    renderSide();
  });

  /* ---------- Composer ---------- */
  function autosize() {
    input.style.height = 'auto';
    var max = parseFloat(getComputedStyle(input).maxHeight) || 128;
    var h = input.scrollHeight + 2;
    input.style.height = Math.min(h, max) + 'px';
    input.classList.toggle('scrolls', h > max);
  }
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', function (e) {
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });

  /* ---------- Thinking indicator ---------- */
  function showThinking() {
    var div = document.createElement('div');
    div.className = 'msg bot thinking';
    var dots = document.createElement('span');
    dots.className = 'dots';
    dots.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 3; i += 1) dots.appendChild(document.createElement('span'));
    var sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = 'The agent is reading your invitation.';
    var note = document.createElement('p');
    note.className = 'wait-note';
    note.hidden = true;
    div.appendChild(dots);
    div.appendChild(sr);
    div.appendChild(note);
    log.appendChild(div);
    scrollLog();
    var t1 = setTimeout(function () {
      note.textContent = 'Still working. Live searches can take up to a minute.';
      note.hidden = false;
      scrollLog();
    }, SLOW_NOTE_MS);
    var t2 = setTimeout(function () {
      note.textContent = 'Almost there. Checking the fine print and reviews.';
      note.hidden = false;
    }, CLOSING_NOTE_MS);
    return function remove() {
      clearTimeout(t1);
      clearTimeout(t2);
      if (div.parentNode) div.parentNode.removeChild(div);
    };
  }

  function setBusy(on) {
    busy = on;
    sendBtn.disabled = on;
    if (on) sendBtn.setAttribute('aria-busy', 'true');
    else sendBtn.removeAttribute('aria-busy');
  }

  /* ---------- Sending ---------- */
  function payload() {
    var msgs = state.messages.map(function (m) {
      return { role: m.role, content: m.content.length > MAX_MSG_CHARS ? m.content.slice(0, MAX_MSG_CHARS) : m.content };
    });
    while (msgs.length > 1 && JSON.stringify({ messages: msgs }).length > MAX_SEND_CHARS) msgs.shift();
    while (msgs.length > 1 && msgs[0].role !== 'user') msgs.shift();
    return JSON.stringify({ messages: msgs.slice(-30) });
  }

  function send() {
    if (busy) return;
    var text = input.value.trim();
    if (!text) { input.focus(); return; }
    stopListening(true);
    hideError();
    state.messages.push({ role: 'user', content: text });
    saveState();
    logEmpty.hidden = true;
    addBubble('user', text);
    updateCount();
    input.value = '';
    autosize();
    scrollLog();
    setBusy(true);
    var removeThinking = showThinking();

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload()
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) { return { ok: r.ok, data: data }; });
    }).then(function (res) {
      removeThinking();
      if (!res.ok || !res.data || typeof res.data.reply !== 'string') {
        var msg = res.data && typeof res.data.error === 'string' ? res.data.error : 'The agent could not answer. Check your connection and try again.';
        addErrorBubble(msg);
        return;
      }
      var reply = res.data.reply;
      state.messages.push({ role: 'assistant', content: reply });
      var found = parseMatches(reply);
      if (found.length) {
        state.matches = found;
        state.selectedId = found[0].id;
      }
      saveState();
      addBubble('assistant', reply);
      updateCount();
      updateDownload();
      renderSide();
      scrollLog();
    }).catch(function () {
      removeThinking();
      addErrorBubble('The agent could not be reached. Check your connection and try again.');
    }).then(function () {
      setBusy(false);
    });
  }

  sendBtn.addEventListener('click', send);

  /* ---------- Start over ---------- */
  resetBtn.addEventListener('click', function () {
    stopListening(true);
    hideError();
    state = { messages: [], matches: [], selectedId: null };
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    input.value = '';
    autosize();
    renderLog();
    renderSide();
    input.focus();
  });

  /* ---------- Full page ---------- */
  function setFull(on) {
    if (on) {
      chatSlot.style.height = chatSlot.offsetHeight + 'px';
      chatCard.classList.add('is-full');
      document.body.classList.add('has-full');
      fullBtn.setAttribute('aria-pressed', 'true');
      fullBtn.setAttribute('aria-label', 'Exit full page');
      input.focus();
    } else {
      chatCard.classList.remove('is-full');
      document.body.classList.remove('has-full');
      chatSlot.style.height = '';
      fullBtn.setAttribute('aria-pressed', 'false');
      fullBtn.setAttribute('aria-label', 'Full page');
      fullBtn.focus();
    }
    scrollLog();
  }
  fullBtn.addEventListener('click', function () { setFull(!chatCard.classList.contains('is-full')); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && chatCard.classList.contains('is-full')) setFull(false);
  });

  /* ---------- Errors ---------- */
  function showError(text) { errorLine.textContent = text; errorLine.hidden = false; }
  function hideError() { errorLine.textContent = ''; errorLine.hidden = true; }

  /* ---------- Voice input ---------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var isAndroid = /Android/i.test(navigator.userAgent || '');
  var listening = false;
  var rec = null;
  var silenceTimer = null;
  var lastSpeech = 0;
  var baseText = '';
  var heard = '';
  var sessionFinals = [];

  if (!SR) micBtn.hidden = true;

  function joinText(a, b) {
    a = a || '';
    b = (b || '').trim();
    if (!b) return a;
    if (!a) return b;
    return /\s$/.test(a) ? a + b : a + ' ' + b;
  }

  function armSilence() {
    clearTimeout(silenceTimer);
    var wait = Math.max(0, SILENCE_MS - (Date.now() - lastSpeech));
    silenceTimer = setTimeout(function () {
      if (listening) stopListening(false);
    }, wait);
  }

  function sessionText() {
    return sessionFinals.filter(Boolean).join(' ');
  }

  function micErrorMessage(code) {
    if (code === 'not-allowed' || code === 'service-not-allowed') return 'Microphone access is blocked. Allow the mic for this site in your browser settings, then tap the mic again.';
    if (code === 'audio-capture') return 'No microphone was found. Connect one or check your device settings, then tap the mic again.';
    if (code === 'network') return 'Voice input lost its connection. Check your internet, then tap the mic to try again.';
    return 'Voice input could not start. Tap the mic to try again, or type instead.';
  }

  function startSession() {
    var r = new SR();
    rec = r;
    sessionFinals = [];
    r.lang = navigator.language || 'en-US';
    r.continuous = !isAndroid;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onresult = function (e) {
      if (rec !== r) return;
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i += 1) {
        var t = e.results[i][0] ? e.results[i][0].transcript : '';
        if (e.results[i].isFinal) sessionFinals[i] = t.trim();
        else interim += t;
      }
      lastSpeech = Date.now();
      armSilence();
      input.value = joinText(joinText(baseText, joinText(heard, sessionText())), interim);
      autosize();
    };

    r.onerror = function (e) {
      if (rec !== r) return;
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      stopListening(true);
      showError(micErrorMessage(e.error));
    };

    r.onend = function () {
      if (rec !== r) return;
      heard = joinText(heard, sessionText());
      sessionFinals = [];
      input.value = joinText(baseText, heard);
      autosize();
      if (listening && Date.now() - lastSpeech < SILENCE_MS) {
        try {
          startSession();
        } catch (err) {
          stopListening(true);
          showError(micErrorMessage('start'));
        }
      } else if (listening) {
        stopListening(false);
      }
    };

    r.start();
  }

  function startListening() {
    hideError();
    baseText = input.value.replace(/\s+$/, '');
    heard = '';
    lastSpeech = Date.now();
    listening = true;
    micBtn.setAttribute('aria-pressed', 'true');
    micBtn.setAttribute('aria-label', 'Stop voice input');
    micStatus.textContent = 'Listening. Take your time; the mic turns off after ' + Math.round(SILENCE_MS / 1000) + ' seconds of silence.';
    micStatus.hidden = false;
    armSilence();
    try {
      startSession();
    } catch (err) {
      stopListening(true);
      showError(micErrorMessage('start'));
    }
  }

  function stopListening(hard) {
    clearTimeout(silenceTimer);
    var wasListening = listening;
    listening = false;
    micBtn.setAttribute('aria-pressed', 'false');
    micBtn.setAttribute('aria-label', 'Start voice input');
    micStatus.hidden = true;
    micStatus.textContent = '';
    if (rec) {
      var r = rec;
      if (hard) {
        rec = null;
        try { r.abort(); } catch (e) { /* ignore */ }
      } else {
        try { r.stop(); } catch (e) { /* ignore */ }
      }
    }
    return wasListening;
  }

  micBtn.addEventListener('click', function () {
    if (listening) stopListening(false);
    else startListening();
  });

  /* ---------- Download ---------- */
  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function buildDownload() {
    var now = new Date();
    var L = [];
    L.push(AGENT_NAME + ': event check, saved ' + now.toLocaleString());
    L.push('');
    L.push('Prices, policies and facts were checked during the conversation where possible. Confirm them with the organizer and official sources before you sign up, pay or share personal details.');
    L.push('');
    L.push('RANKED OPTIONS');
    L.push('--------------');
    if (!state.matches.length) L.push('No playbook matches yet.');
    state.matches.forEach(function (m, i) {
      L.push((i + 1) + '. ' + m.title + ' (fit ' + m.score + '/100)');
      if (m.why) L.push('   Why: ' + m.why);
      Object.keys(m.details).forEach(function (k) {
        if (/^guide$/i.test(k)) return;
        L.push('   ' + k + ': ' + m.details[k]);
      });
      L.push('');
    });
    L.push('');
    L.push('LATEST PLAN');
    L.push('-----------');
    var latest = '';
    for (var i = state.messages.length - 1; i >= 0; i -= 1) {
      if (state.messages[i].role === 'assistant') { latest = visibleText(state.messages[i].content); break; }
    }
    L.push(latest || 'No reply yet.');
    L.push('');
    L.push('FULL CONVERSATION');
    L.push('-----------------');
    state.messages.forEach(function (m) {
      L.push((m.role === 'user' ? 'You: ' : AGENT_NAME + ': ') + (m.role === 'user' ? m.content : visibleText(m.content)));
      L.push('');
    });
    var text = L.join('\n').split('\n').filter(function (l) { return !MATCH_LINE.test(l); }).join('\r\n');
    var name = PROJECT_SLUG + '-check-' + now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + '.txt';
    return { name: name, text: '\uFEFF' + text };
  }

  downloadBtn.addEventListener('click', function () {
    if (!hasReply()) return;
    var file = buildDownload();
    var blob = new Blob([file.text], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  });

  /* ---------- Boot ---------- */
  loadState();
  renderLog();
  renderSide();
  autosize();
})();
