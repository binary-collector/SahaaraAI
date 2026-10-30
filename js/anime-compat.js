/**
 * Sahaara AI / CareTrack — Anime.js Compatibility Shim
 */


(function () {
  if (window.anime && typeof window.anime.animate === 'function') return;
  var active = new Set();
  var rafRunning = false;
  function tick(ts) {
    active.forEach(function (t) { try { t._step(ts); } catch (e) { active.delete(t); } });
    if (active.size) requestAnimationFrame(tick); else rafRunning = false;
  }
  function start(t) { active.add(t); if (!rafRunning) { rafRunning = true; requestAnimationFrame(tick); } }
  var eases = {
    linear: function () { return function (t) { return t; }; },
    out: function (n) { n = n || 2; return function (t) { return 1 - Math.pow(1 - t, n); }; },
    'in': function (n) { n = n || 2; return function (t) { return Math.pow(t, n); }; },
    inOut: function (n) {
      n = n || 2;
      return function (t) { return t < 0.5 ? Math.pow(2, n - 1) * Math.pow(t, n) : 1 - Math.pow(2 - 2 * t, n) / 2; };
    }
  };
  function resolveEase(e) {
    if (typeof e === 'function') return e;
    if (typeof e === 'string' && eases[e]) return eases[e](2);
    return eases.out(2);
  }
  function isEl(x) { return !!(x && x.nodeType === 1); }
  function getStart(el, prop) {
    try {
      var cs = getComputedStyle(el);
      if (prop === 'opacity') { var o = parseFloat(cs.opacity); return isNaN(o) ? 1 : o; }
      if (prop === 'height') return parseFloat(cs.height) || 0;
      if (prop === 'scale') return 1;
      return parseFloat(cs[prop]) || 0;
    } catch (e) { return 0; }
  }
  function applyEl(el, prop, v) {
    if (prop === 'opacity') el.style.opacity = v;
    else if (prop === 'height') el.style.height = v + 'px';
    else if (prop === 'scale') el.style.transform = 'scale(' + v + ')';
    else if (prop === 'rotate') el.style.transform = 'rotate(' + v + 'deg)';
    else try { el.style[prop] = v; } catch (e) {}
  }
  function Tween(target, props, opts) {
    opts = opts || {};
    var self = this;
    this.target = target; this.el = isEl(target);
    var OPTION_KEYS = ['duration', 'delay', 'loop', 'ease', 'easing', 'onUpdate', 'onComplete', 'autoplay'];
    var cleanProps = {};
    Object.keys(props || {}).forEach(function (key) {
      if (OPTION_KEYS.indexOf(key) === -1) cleanProps[key] = props[key];
      else if (opts[key] === undefined) {
        if (key === 'easing') opts.ease = props[key]; else opts[key] = props[key];
      }
    });
    props = cleanProps;
    this.duration = Math.max(1, opts.duration || 1000);
    this.delay = opts.delay || 0;
    this.loop = !!opts.loop;
    this.ease = resolveEase(opts.ease);
    this.onUpdate = opts.onUpdate || null;
    this.onComplete = opts.onComplete || null;
    this.paused = false; this._t0 = null; this._tracks = [];
    Object.keys(props || {}).forEach(function (key) {
      var spec = props[key], kf, base;
      base = self.el ? getStart(target, key) : (typeof target[key] === 'number' ? target[key] : 0);
      if (Array.isArray(spec)) {
        if (spec.length && spec[0] !== null && typeof spec[0] === 'object' && ('to' in spec[0])) {
          kf = [base];
          spec.forEach(function (k) { kf.push(Number(k.to) || 0); });
        } else {
          kf = spec.map(Number);
        }
      } else {
        kf = [base, Number(spec) || 0];
      }
      if (kf.length >= 2 && kf.every(function (v) { return !isNaN(v); })) self._tracks.push({ key: key, kf: kf });
    });
    this._step = function (ts) {
      if (self.paused || !self._tracks.length) { active.delete(self); return; }
      if (self._t0 === null) self._t0 = ts + self.delay;
      var t = (ts - self._t0) / self.duration;
      if (t < 0) return;
      if (t > 1) t = 1;
      var e = self.ease(t);
      self._tracks.forEach(function (tr) {
        var kf = tr.kf, seg = (kf.length - 1) * e;
        var i = Math.min(Math.floor(seg), kf.length - 2), f = seg - i;
        var v = kf[i] + (kf[i + 1] - kf[i]) * f;
        if (self.el) applyEl(self.target, tr.key, v); else self.target[tr.key] = v;
      });
      if (self.onUpdate) { try { self.onUpdate(self); } catch (e2) {} }
      if (t >= 1) {
        if (self.loop) self._t0 = ts;
        else {
          active.delete(self);
          if (self.onComplete) { try { self.onComplete(self); } catch (e3) {} }
        }
      }
    };
    this.pause = function () { self.paused = true; active.delete(self); };
    this.play = function () { self.paused = false; start(self); };
  }
  window.anime = {
    animate: function (target, props, opts) {
      var tw = new Tween(target, props, opts || {});
      start(tw);
      return tw;
    },
    eases: eases,
    easing: eases,
    version: 'caretrack-shim-1.0'
  };
})();
