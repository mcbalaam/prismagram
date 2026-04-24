(function () {
  'use strict';

  let _pluginId = '';
  let _hostOrigin = '*';
  let _isReady = false;
  let _capabilities = [];
  const _readyCallbacks = [];
  const _pending = new Map();
  const _eventHandlers = new Map();
  const _methodHandlers = new Map();
  let _slotClickHandler;
  let _callCounter = 0;

  function _generateId() {
    return 'rpc_' + (++_callCounter) + '_' + Date.now();
  }

  function _send(msg) {
    window.parent.postMessage(msg, _hostOrigin);
  }

  function call(method) {
    const params = Array.prototype.slice.call(arguments, 1);
    const id = _generateId();
    _send({ type: 'rpc:request', id: id, method: method, params: params });
    return new Promise(function (resolve, reject) {
      _pending.set(id, { resolve: resolve, reject: reject });
    });
  }

  function on(eventName, handler) {
    const existing = _eventHandlers.get(eventName) || [];
    existing.push(handler);
    _eventHandlers.set(eventName, existing);
  }

  function off(eventName, handler) {
    const existing = _eventHandlers.get(eventName);
    if (!existing) return;
    _eventHandlers.set(eventName, existing.filter(function (h) { return h !== handler; }));
  }

  // Register a method that the host can call on this plugin.
  // handler receives the first argument directly (not a params array).
  function register(method, handler) {
    _methodHandlers.set(method, handler);
  }

  function ready(callback) {
    if (_isReady) {
      Promise.resolve().then(function () { callback(); });
    } else {
      _readyCallbacks.push(callback);
    }
  }

  function onSlotClick(handler) {
    _slotClickHandler = handler;
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    const msg = event.data;
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'rpc:ready') {
      _pluginId = msg.pluginId || '';
      _capabilities = msg.capabilities || [];
      if (event.origin && event.origin !== 'null') _hostOrigin = event.origin;
      _isReady = true;
      _readyCallbacks.forEach(function (cb) { cb(); });
      _readyCallbacks.length = 0;
      return;
    }

    if (msg.type === 'rpc:request') {
      const id = msg.id;
      const handler = _methodHandlers.get(msg.method);
      if (!handler) {
        _send({ type: 'rpc:response', id: id, error: 'No handler for ' + msg.method });
        return;
      }
      Promise.resolve()
        .then(function () { return handler((msg.params || [])[0]); })
        .then(function (result) { _send({ type: 'rpc:response', id: id, result: result }); })
        .catch(function (err) {
          _send({ type: 'rpc:response', id: id, error: err instanceof Error ? err.message : String(err) });
        });
      return;
    }

    if (msg.type === 'rpc:response') {
      const p = _pending.get(msg.id);
      if (!p) return;
      _pending.delete(msg.id);
      if (msg.error !== undefined) {
        p.reject(new Error(msg.error));
      } else {
        p.resolve(msg.result);
      }
      return;
    }

    if (msg.type === 'rpc:event') {
      var name = msg.name;
      var data = msg.data;
      if (name === 'dom:zone:mount' || name === 'dom:zone:unmount') {
        var zoneCbs = _zoneWatchers.get(data && data.zone);
        if (zoneCbs) {
          if (name === 'dom:zone:mount') { if (zoneCbs.onMount) zoneCbs.onMount(); }
          else { if (zoneCbs.onUnmount) zoneCbs.onUnmount(); }
        }
      } else if (name === 'dom:observer:match') {
        var obsCb = _domObservers.get(data && data.observerId);
        if (obsCb) obsCb(data);
      } else if (name === 'dom:event') {
        var domCb = _domListeners.get(data && data.listenerId);
        if (domCb) domCb(data);
      } else {
        (_eventHandlers.get(name) || []).forEach(function (h) { h(data); });
      }
      return;
    }

    if (msg.type === 'rpc:slot:click') {
      if (_slotClickHandler) _slotClickHandler(msg);
      return;
    }
  });

  window.parent.postMessage({ type: 'rpc:handshake', pluginId: '' }, '*');

  var _zoneWatchers = new Map();
  var _domListeners = new Map();
  var _domObservers = new Map();

  var dom = {
    watchZone: function (zone, onMount, onUnmount) {
      _zoneWatchers.set(zone, { onMount: onMount, onUnmount: onUnmount });
      return call('dom.watchZone', zone);
    },
    query: function (zone, selector) {
      return call('dom.query', zone, selector);
    },
    queryAll: function (zone, selector) {
      return call('dom.queryAll', zone, selector);
    },
    createElement: function (tag, props) {
      return call('dom.createElement', tag, props || {});
    },
    setStyle: function (handleId, prop, value) {
      return call('dom.setStyle', handleId, prop, value);
    },
    addClass: function (handleId, className) {
      return call('dom.addClass', handleId, className);
    },
    setText: function (handleId, text) {
      return call('dom.setText', handleId, text);
    },
    appendChild: function (parentId, childId) {
      return call('dom.appendChild', parentId, childId);
    },
    insertBefore: function (refId, newId) {
      return call('dom.insertBefore', refId, newId);
    },
    remove: function (handleId) {
      return call('dom.remove', handleId);
    },
    on: function (handleId, event, callback) {
      var listenerId = _generateId();
      _domListeners.set(listenerId, callback);
      return call('dom.on', handleId, event, listenerId);
    },
    observeSelector: function (zone, selector, callback) {
      var observerId = _generateId();
      _domObservers.set(observerId, callback);
      return call('dom.observeSelector', zone, selector, observerId);
    },
    injectStyle: function (css) {
      return call('dom.injectStyle', css);
    },
  };

  window.PrismaSDK = {
    get pluginId() { return _pluginId; },
    get capabilities() { return _capabilities; },
    call: call,
    on: on,
    off: off,
    register: register,
    ready: ready,
    onSlotClick: onSlotClick,
    dom: dom,
  };
})();
