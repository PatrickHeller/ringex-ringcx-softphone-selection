(function () {
  'use strict';

  console.log('RC_RingEX adapter script loaded and executing');

  // SuiteCRM 8 renders every phone field detail-view as <a href="tel:...">
  // (core/app/core/src/lib/fields/phone/templates/detail/phone.component.ts) --
  // module-agnostic, so a single delegated click listener covers Contacts,
  // Accounts, Leads, Cases and anywhere else a phone field is shown.
  // RingCentral Embeddable exposes RCAdapter.clickToCall(number) directly, so
  // we don't need the separate RingCentralC2D text-scanning library -- our
  // pages already render explicit tel: links.
  document.addEventListener('click', function (e) {
    var target = e.target && e.target.closest && e.target.closest('a[href^="tel:"]');
    if (!target) {
      return;
    }
    if (!window.RCAdapter || !window.RCAdapter.clickToCall) {
      return;
    }
    e.preventDefault();
    var number = target.getAttribute('href').replace(/^tel:/, '');
    console.log('RC_RingEX clickToCall: href="' + target.getAttribute('href') + '" number="' + number + '"');
    window.RCAdapter.clickToCall(number);
  }, true);

  function getAdapterFrame() {
    return document.querySelector('#rc-widget-adapter-frame');
  }

  function postToWidget(message) {
    var frame = getAdapterFrame();
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage(message, '*');
    } else {
      console.error('RC_RingEX adapter: #rc-widget-adapter-frame not found, cannot postMessage', message);
    }
  }

  function waitForFrame(callback) {
    if (getAdapterFrame()) {
      console.log('RC_RingEX: #rc-widget-adapter-frame found, proceeding');
      callback();
    } else {
      setTimeout(function () { waitForFrame(callback); }, 300);
    }
  }

  console.log('RC_RingEX: waiting for #rc-widget-adapter-frame...');

  function normalizeE164(raw) {
    if (!raw) {
      return '';
    }
    return String(raw).replace(/[^\d+]/g, '');
  }

  function apiGet(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) {
        throw new Error('HTTP ' + r.status);
      }
      return r.json();
    });
  }

  function apiPost(url, body) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      if (!r.ok) {
        throw new Error('HTTP ' + r.status);
      }
      return r.json();
    });
  }

  // Reuses the same generic, product-agnostic phone-match entry point the
  // RingCX adapter uses -- pure phone-number-to-record lookup, unrelated to
  // which RingCentral product initiated the call.
  function lookupByPhone(phoneNumber) {
    var e164 = normalizeE164(phoneNumber);
    if (!e164) {
      return Promise.resolve({ matches: [], related_cases: [] });
    }
    return apiGet('/index.php?entryPoint=RC_RingCX_ContactMatch_Route&phone=' + encodeURIComponent(e164));
  }

  // Per docs/integration/address-book.md: request arrives as
  // {type:'rc-post-message-request', path:'/contacts/match', requestId, body:{phoneNumbers}},
  // reply as {type:'rc-post-message-response', responseId, response:{data:{<phoneNumber>: [contacts]}}}.
  function handleContactMatch(req) {
    console.log('RC_RingEX /contacts/match request: ' + JSON.stringify(req));
    var phoneNumbers = (req.body && req.body.phoneNumbers) || [];
    var promises = phoneNumbers.map(function (phoneNumber) {
      return lookupByPhone(phoneNumber).then(function (result) {
        var contacts = (result.matches || []).map(function (m) {
          return {
            id: m.id,
            type: m.module,
            name: m.name,
            phoneNumbers: [{ phoneNumber: phoneNumber }],
          };
        });
        return { phoneNumber: phoneNumber, contacts: contacts };
      }).catch(function () {
        return { phoneNumber: phoneNumber, contacts: [] };
      });
    });
    Promise.all(promises).then(function (results) {
      var out = {};
      results.forEach(function (r) { out[r.phoneNumber] = r.contacts; });
      console.log('RC_RingEX /contacts/match response: ' + JSON.stringify(out));
      postToWidget({ type: 'rc-post-message-response', responseId: req.requestId, response: { data: out } });
    });
  }

  // Per docs/integration/call-logging.md: request arrives as
  // {type:'rc-post-message-request', path:'/callLogger', requestId, body:{call}},
  // reply as {type:'rc-post-message-response', responseId, response:{data:'ok'}}.
  // Reuses the same generic Calls-bean-creation entry point the RingCX adapter uses.
  var loggedCallSessions = {};

  function handleCallLogger(req) {
    console.log('RC_RingEX /callLogger request: ' + JSON.stringify(req));
    var call = (req.body && req.body.call) || {};

    // RingEX auto-log fires /callLogger multiple times per real phone call, all
    // sharing the same sessionId: once on connect, once on disconnect (with the
    // real duration), and once more as a callLogSync record for a secondary/failed
    // leg (e.g. a desk phone that didn't pick up, result "IP Phone Offline"). Only
    // the "Disconnected" trigger has the authoritative final duration, so that's
    // the only one we actually write to SuiteCRM -- the others are just ack'd so
    // the widget's request/response contract is satisfied without duplicate Calls.
    var sessionKey = call.sessionId || call.id;
    var isFinal = call.result === 'Disconnected';
    if (!isFinal || (sessionKey && loggedCallSessions.hasOwnProperty(sessionKey))) {
      postToWidget({ type: 'rc-post-message-response', responseId: req.requestId, response: { data: 'ok' } });
      return;
    }
    if (sessionKey) {
      loggedCallSessions[sessionKey] = true;
    }

    var direction = (String(call.direction || '').toUpperCase() === 'OUTBOUND') ? 'Outbound' : 'Inbound';
    var customerNumber = direction === 'Outbound'
      ? (call.to && call.to.phoneNumber)
      : (call.from && call.from.phoneNumber) || getInboundCustomerNumber(call);

    // Reuse the match already found for the screen-pop (keyed by call id) so the
    // logged Call links to the exact same record, instead of a second ANI lookup
    // that could disagree if multiple records share a phone suffix.
    var callId = call.id || call.sessionId || call.telephonySessionId;
    var cachedMatch = callId ? lastMatchByCallId[callId] : null;
    var top = cachedMatch && cachedMatch.matches && cachedMatch.matches[0];

    apiPost('/index.php?entryPoint=RC_RingCX_CallLog_Entry', {
      direction: direction,
      phone: normalizeE164(customerNumber),
      duration_seconds: call.duration || 0,
      disposition: '',
      notes: call.subject || call.note || '',
      started_at: call.startTime ? new Date(call.startTime).toISOString() : new Date().toISOString(),
      module: top ? top.module : '',
      record_id: top ? top.id : '',
      source: 'RingEX',
    }).then(function () {
      postToWidget({ type: 'rc-post-message-response', responseId: req.requestId, response: { data: 'ok' } });
    }).catch(function (err) {
      console.error('RC_RingEX adapter: call log failed', err);
      // Always ack -- the widget has no retry UI for a failed logger response,
      // and a stuck "logging..." state is worse than a silently missed log entry.
      postToWidget({ type: 'rc-post-message-response', responseId: req.requestId, response: { data: 'ok' } });
    });
  }

  var SCREEN_POP_MODULES = { Contacts: true, Accounts: true, Leads: true };
  var lastMatchByCallId = {};

  function screenPop(matchResult) {
    if (!matchResult || !matchResult.matches || !matchResult.matches.length) {
      return;
    }
    var top = matchResult.matches[0];
    if (!SCREEN_POP_MODULES[top.module]) {
      return;
    }
    window.location.hash = '#/' + top.module + '/record/' + top.id;
  }

  // Best-effort extraction -- docs/integration/events.md doesn't document the exact
  // shape of data.call for rc-active-call-notify (only shows "console.log(data.call)"),
  // so this checks a few plausible shapes. Watch the console log on a real call and
  // adjust field access here if the pop doesn't fire (same as had to be done for the
  // RingCX adapter's rc-ev-newCall handling).
  function getInboundCustomerNumber(call) {
    if (!call) {
      return '';
    }
    var candidate = (call.from && call.from.phoneNumber) || call.fromNumber || call.from || '';
    return typeof candidate === 'string' ? candidate : '';
  }

  function isRingingInboundCall(call) {
    if (!call) {
      return false;
    }
    var direction = String(call.direction || '').toUpperCase();
    var status = String(call.telephonyStatus || call.status || '').toUpperCase();
    return direction === 'INBOUND' && status === 'RINGING';
  }

  // Per docs/integration/call-pop.md ("Call Pop"): not a built-in widget feature --
  // we listen for rc-active-call-notify ourselves and act on it.
  function handleActiveCallNotify(data) {
    var call = data.call || {};
    console.log('RC_RingEX rc-active-call-notify: ' + JSON.stringify(call));
    if (!isRingingInboundCall(call)) {
      return;
    }
    var callId = call.id || call.sessionId || call.telephonySessionId;
    if (callId && lastMatchByCallId.hasOwnProperty(callId)) {
      return; // already handled or in progress for this call (event can re-fire rapidly as status is polled)
    }
    if (callId) {
      // Mark as in-progress synchronously, before the async lookup below, so a second
      // rc-active-call-notify arriving while the first lookup is still in flight doesn't
      // also pass this guard and trigger a second, overlapping screen-pop navigation.
      lastMatchByCallId[callId] = null;
    }
    var customerNumber = getInboundCustomerNumber(call);
    if (!customerNumber) {
      console.log('RC_RingEX: no customer phone number found on call object, skipping screen-pop lookup');
      return;
    }
    lookupByPhone(customerNumber).then(function (result) {
      console.log('RC_RingEX screenPop lookup result: ' + JSON.stringify(result));
      if (callId) {
        lastMatchByCallId[callId] = result;
      }
      screenPop(result);
    }).catch(function (err) {
      console.error('RC_RingEX adapter: contact lookup failed', err);
    });
  }

  waitForFrame(function () {
    console.log('RC_RingEX: sending rc-adapter-register-third-party-service');
    postToWidget({
      type: 'rc-adapter-register-third-party-service',
      service: {
        name: 'SuiteCRM',
        contactMatchPath: '/contacts/match',
        callLoggerPath: '/callLogger',
        callLoggerTitle: 'Log to SuiteCRM',
      },
    });
    console.log('RC_RingEX: registration message sent');

    window.addEventListener('message', function (e) {
      var data = e.data;
      if (!data || !data.type) {
        return;
      }
      if (data.type === 'rc-active-call-notify') {
        handleActiveCallNotify(data);
        return;
      }
      if (data.type !== 'rc-post-message-request') {
        return;
      }
      console.log('RC_RingEX request ' + data.path + ': ' + JSON.stringify(data));
      if (data.path === '/contacts/match') {
        handleContactMatch(data);
      } else if (data.path === '/callLogger') {
        handleCallLogger(data);
      }
    });
  });
})();
