/* ================================================
   Cheeseburger Hick-Nick — Fishing AI Chatbot Widget
   Proxies to /api/chat which calls Gemini server-side.
   API key is NEVER sent to or stored on the client.
   ================================================ */

(function () {
  'use strict';

  var SYSTEM_PROMPT =
    'You are Cheeseburger Hick-Nick, a crusty but lovable backwoods local fisherman who\'s spent his whole\n' +
    'life on Lake Ontario and its tributaries on both the American and Canadian shores. You talk with a\n' +
    'friendly Southern/rural dialect — y\'all, ain\'t, reckon, feller, yonder, holler — and you drop your g\'s\n' +
    '(fishin\', trollin\', seein\'). You\'ve got nicknames for just about everything.\n\n' +
    'YOUR PERSONALITY:\n' +
    '- Gruff but warm-hearted, like everyone\'s favorite fishin\' uncle\n' +
    '- Call people "partner", "boss", "bud", "chief", or "hoss" — pick one per conversation\n' +
    '- Use colorful backwoods fishing expressions and local lake lore\n' +
    '- Genuinely passionate about Lake Ontario — fished every inch of it for decades\n' +
    '- A little superstitious (full moons, lucky lures, readin\' the skies)\n' +
    '- Got a tall tale or two about the fish that got away — and the ones that didn\'t\n' +
    '- Occasionally mentions how you got your nickname — always a different, food-related story\n\n' +
    'WHAT YOU KNOW:\n' +
    '- Lake Ontario fishing: Chinook salmon, coho, steelhead, brown trout, lake trout, walleye, yellow perch, pike\n' +
    '- Seasonal patterns: spring browns, summer kings on the open lake, fall staging and river runs, winter steelhead\n' +
    '- Key spots on both shores: Salmon River, Oswego Harbor, Mexico Bay, Sodus Bay, Port of Rochester,\n' +
    '  Niagara Bar, Wilson/Olcott, Henderson Harbor, Port Hope/Ganaraska River, Port Credit/Credit River,\n' +
    '  Toronto Waterfront, Cobourg/Presquile, Kingston approaches, Mid-Lake thermal zones\n' +
    '- Lures, rigs, colors, flashers, spoons, stickbaits, flies, and trolling techniques\n' +
    '- Downriggers, lead core, copper line, flatlines, dipsy divers — the whole toolbox\n' +
    '- Reading the water: thermoclines, current seams, baitfish schools, temperature breaks\n' +
    '- Weather reading for fishermen: pressure drops, wind effects, wave heights, fog\n' +
    '- Charter fishing on both the US and Canadian shores\n' +
    '- Boat safety, running the lake in rough weather, reading navigation charts\n' +
    '- Solunar tables, moon phases, best feeding windows\n\n' +
    'STRICT RULES:\n' +
    '- ONLY talk about fishing, Lake Ontario, its tributaries, and directly related topics. Nothing else.\n' +
    '- If asked about non-fishing topics, say something like:\n' +
    '  "Ha! I only know fishin\', partner. Ask me \'bout Lake Ontario an\' I\'ll jaw yer ear plumb off all day, but that other stuff is way over ol\' Hick-Nick\'s head."\n' +
    '- Keep responses conversational and punchy — like chattin\' at the bait shop counter\n' +
    '- Aim for 2-4 short paragraphs max. Don\'t write novels.\n' +
    '- Never say you\'re an AI, a chatbot, or mention Gemini or Google. You\'re Cheeseburger Hick-Nick, plain and simple.\n' +
    '- Throw in a fishing saying or bit of local wisdom every now and then.';

  var MAX_HISTORY = 20;
  var history = [];

  /* ── Build the widget DOM ── */
  function buildWidget() {
    var toggle = document.createElement('button');
    toggle.className = 'chatbot-toggle';
    toggle.setAttribute('aria-label', 'Chat with Cheeseburger Hick-Nick');
    toggle.innerHTML =
      '<div class="chatbot-bubble">🎣</div>' +
      '<span class="chatbot-toggle-label">Hick-Nick</span>';

    var panel = document.createElement('div');
    panel.className = 'chatbot-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat with Cheeseburger Hick-Nick');
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML =
      '<div class="chatbot-header">' +
        '<div class="chatbot-avatar">🎣</div>' +
        '<div class="chatbot-header-info">' +
          '<div class="chatbot-header-name">Cheeseburger Hick-Nick</div>' +
          '<div class="chatbot-header-status"><span class="chatbot-status-dot"></span> your local fishing guide</div>' +
        '</div>' +
        '<button class="chatbot-header-close" aria-label="Close chat">✕</button>' +
      '</div>' +
      '<div class="chatbot-messages" id="chatbot-messages"></div>' +
      '<div class="chatbot-typing" id="chatbot-typing">' +
        '<span class="typing-avatar">🎣</span>' +
        '<div class="typing-dots"><span></span><span></span><span></span></div>' +
      '</div>' +
      '<div class="chatbot-input-area">' +
        '<textarea class="chatbot-input" id="chatbot-input" placeholder="Ask Hick-Nick about fishin\'!" rows="1" aria-label="Message Hick-Nick"></textarea>' +
        '<button class="chatbot-send" id="chatbot-send" aria-label="Send message">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>' +
          '</svg>' +
        '</button>' +
      '</div>' +
      '<div class="chatbot-footer">' +
        '<span class="chatbot-footer-hint">🎣 Lake Ontario fishing only</span>' +
      '</div>';

    document.body.appendChild(toggle);
    document.body.appendChild(panel);
    return { toggle: toggle, panel: panel };
  }

  /* ── Safe HTML renderer for bot messages ── */
  function renderBotText(text) {
    var lines = text.split('\n');
    var html = '';
    var inList = false;

    lines.forEach(function (line) {
      var safe = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>');

      if (/^[-•]\s/.test(line)) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + safe.replace(/^[-•]\s+/, '') + '</li>';
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        if (safe.trim()) {
          html += '<p>' + safe + '</p>';
        }
      }
    });
    if (inList) html += '</ul>';
    return html;
  }

  /* ── Append a message bubble ── */
  function appendMessage(role, text) {
    var messages = document.getElementById('chatbot-messages');
    if (!messages) return;

    var div = document.createElement('div');
    div.className = 'chat-message ' + role;

    var bubble = document.createElement('div');
    bubble.className = 'chat-bubble';

    var avatarDiv = document.createElement('div');
    avatarDiv.className = 'chat-message-avatar';

    if (role === 'bot') {
      avatarDiv.textContent = '🎣';
      bubble.innerHTML = renderBotText(text);
      div.appendChild(avatarDiv);
      div.appendChild(bubble);
    } else {
      avatarDiv.textContent = '🧑';
      var p = document.createElement('p');
      p.textContent = text;
      bubble.appendChild(p);
      div.appendChild(bubble);
      div.appendChild(avatarDiv);
    }

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  /* ── Send to server proxy ── */
  function sendMessage(text) {
    if (!text.trim()) return;

    appendMessage('user', text);
    history.push({ role: 'user', parts: [{ text: text }] });
    if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

    var typingEl = document.getElementById('chatbot-typing');
    if (typingEl) typingEl.classList.add('visible');

    var inputEl  = document.getElementById('chatbot-input');
    var sendBtn  = document.getElementById('chatbot-send');
    if (inputEl) inputEl.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history, systemPrompt: SYSTEM_PROMPT })
    })
    .then(function (resp) {
      return resp.json().then(function (data) {
        if (!resp.ok) throw new Error(data.error || ('Server error ' + resp.status));
        return data;
      });
    })
    .then(function (data) {
      var reply = data.text;
      history.push({ role: 'model', parts: [{ text: reply }] });
      if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
      appendMessage('bot', reply);
    })
    .catch(function (err) {
      appendMessage('bot',
        'Well shoot, partner — somethin\' went sideways on my end. Give it another try in a spell! (' + err.message + ')'
      );
    })
    .finally(function () {
      if (typingEl) typingEl.classList.remove('visible');
      if (inputEl) { inputEl.disabled = false; inputEl.focus(); }
      if (sendBtn) sendBtn.disabled = false;
    });
  }

  /* ── Greeting ── */
  var GREETINGS = [
    'Well, howdy there, partner! I\'m Cheeseburger Hick-Nick — been fishin\' Lake Ontario since before most folks could tie a surgeon\'s knot. Ask me anythin\' about salmon, trout, or where the fish are bitin\' right now. What\'re ya after?',
    'Hey there, boss! Cheeseburger Hick-Nick here. Named that on account of a legendary portside incident involvin\' a double cheeseburger and a 30-pound king — but that\'s a story for another time. What can I help ya catch today?',
    'Howdy, hoss! I\'m Hick-Nick, and I know every current seam and temperature break on this lake. Fifty-odd years of fishin\' will do that to ya. What\'s on yer mind — salmon? Steelhead? Where to put in?'
  ];

  /* ── Init ── */
  function init() {
    var els    = buildWidget();
    var toggle = els.toggle;
    var panel  = els.panel;
    var isOpen = false;
    var greeted = false;

    function openPanel() {
      isOpen = true;
      panel.classList.add('open');
      toggle.classList.add('active');
      var inputEl = document.getElementById('chatbot-input');
      if (inputEl) setTimeout(function () { inputEl.focus(); }, 100);

      if (!greeted) {
        greeted = true;
        var msg = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
        setTimeout(function () { appendMessage('bot', msg); }, 300);
      }
    }

    function closePanel() {
      isOpen = false;
      panel.classList.remove('open');
      toggle.classList.remove('active');
    }

    toggle.addEventListener('click', function () {
      if (isOpen) closePanel(); else openPanel();
    });

    panel.querySelector('.chatbot-header-close').addEventListener('click', closePanel);

    var inputEl = document.getElementById('chatbot-input');
    var sendBtn = document.getElementById('chatbot-send');

    function handleSend() {
      var text = inputEl ? inputEl.value.trim() : '';
      if (!text) return;
      if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; }
      sendMessage(text);
    }

    if (sendBtn) sendBtn.addEventListener('click', handleSend);
    if (inputEl) {
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      });
      inputEl.addEventListener('input', function () {
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
