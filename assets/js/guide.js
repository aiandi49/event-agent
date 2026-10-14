(function () {
  'use strict';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function meter(level) {
    var m = el('span', 'meter');
    m.setAttribute('data-level', level);
    m.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 3; i += 1) m.appendChild(document.createElement('i'));
    return m;
  }

  function safeUrl(url) {
    return typeof url === 'string' && /^https:\/\//.test(url) ? url : null;
  }

  function renderEntry(e) {
    var art = el('article', 'entry');
    art.id = e.id;
    art.setAttribute('aria-labelledby', e.id + '-title');

    var level = e.details && e.details['Pressure level'];
    if (e.kind === 'playbook' && level) {
      var top = el('p', 'entry-top' + (level === 'High' ? ' high' : ''));
      top.appendChild(meter(level));
      top.appendChild(document.createTextNode(level + ' pressure'));
      art.appendChild(top);
    }

    var h = el('h3', null, e.title);
    h.id = e.id + '-title';
    art.appendChild(h);
    art.appendChild(el('p', 'summary', e.summary));

    var body = el('div', 'body');
    (e.body || []).forEach(function (p) { body.appendChild(el('p', null, p)); });
    art.appendChild(body);

    var keys = Object.keys(e.details || {}).filter(function (k) { return k !== 'Pressure level'; });
    if (keys.length) {
      var dl = el('dl', 'facts');
      keys.forEach(function (k) {
        var row = document.createElement('div');
        row.appendChild(el('dt', null, k));
        row.appendChild(el('dd', null, e.details[k]));
        dl.appendChild(row);
      });
      art.appendChild(dl);
    }

    if (Array.isArray(e.sources) && e.sources.length) {
      var ul = el('ul', 'sources');
      e.sources.forEach(function (s) {
        var url = safeUrl(s.url);
        if (!url) return;
        var li = document.createElement('li');
        var a = el('a', null, s.label);
        a.href = url;
        a.rel = 'noopener noreferrer';
        a.target = '_blank';
        li.appendChild(a);
        ul.appendChild(li);
      });
      art.appendChild(ul);
    }

    if (Array.isArray(e.tags) && e.tags.length) {
      var tags = el('ul', 'tags');
      tags.setAttribute('aria-label', 'Topics');
      e.tags.slice(0, 6).forEach(function (t) { tags.appendChild(el('li', null, t)); });
      art.appendChild(tags);
    }

    if (e.kind === 'playbook') {
      var cta = el('a', 'entry-cta', 'Check an invite like this with the agent');
      cta.href = '/';
      art.appendChild(cta);
    }
    return art;
  }

  function showHash() {
    if (!location.hash) return;
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) target.scrollIntoView();
  }

  fetch('/data/gub.json', { headers: { Accept: 'application/json' } })
    .then(function (r) {
      if (!r.ok) throw new Error('load');
      return r.json();
    })
    .then(function (data) {
      var groups = { playbook: 'grid-playbook', 'field-note': 'grid-field-note', 'case': 'grid-case' };
      (data.entries || []).forEach(function (e) {
        var gridId = groups[e.kind];
        if (!gridId) return;
        document.getElementById(gridId).appendChild(renderEntry(e));
      });
      Object.keys(groups).forEach(function (k) { document.getElementById(groups[k]).removeAttribute('aria-busy'); });
      if (data.updated) {
        document.getElementById('updated').textContent = 'Guide last checked ' + new Date(data.updated + 'T12:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) + '.';
      }
      showHash();
    })
    .catch(function () {
      document.getElementById('load-error').hidden = false;
    });
})();
