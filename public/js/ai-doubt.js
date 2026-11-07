// ai-doubt.js - Shakt AI Doubt Solver & Copilot with Automatic Edit Permission
// Multilingual (English, Hinglish, Hindi), STEM (LaTeX Math), and Direct Document Action Execution

class ShaktAiDoubt {
  constructor(messagesContainerId, inputId, sendBtnId, apiEndpoint = '/api/claude') {
    this.container = document.getElementById(messagesContainerId);
    this.input = document.getElementById(inputId);
    this.sendBtn = document.getElementById(sendBtnId);
    this.apiEndpoint = apiEndpoint;

    this.currentPdfId = null;
    this.currentPageNumber = 1;
    this.getNoteContextCallback = null;
    this.onAddRealisationCallback = null;
    this.onExecuteAiActionCallback = null;
    this.activeDiagramContext = null;

    this.initEvents();
  }

  initEvents() {
    this.sendBtn.addEventListener('click', () => this.handleSend());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });
  }

  async loadChat(pdfId, pageNumber) {
    this.currentPdfId = pdfId;
    this.currentPageNumber = pageNumber;
    this.container.innerHTML = '';

    const messages = await window.shaktDB.getDoubtMessages(pdfId, pageNumber);
    if (messages.length === 0) {
      this.renderWelcomeMessage();
    } else {
      messages.forEach(msg => this.renderMessageBubble(msg));
    }
    this.scrollToBottom();
    this.renderKaTeXMath();
  }

  renderWelcomeMessage() {
    this.container.innerHTML = `
      <div class="doubt-welcome-card">
        <div class="welcome-header">
          <span class="welcome-icon">⚡</span>
          <h4>Shakt AI Doubt & Edit Copilot</h4>
        </div>
        <p>Ask doubts or command edits in <strong>English</strong>, <strong>Hinglish</strong>, or <strong>Hindi</strong>. AI has direct permission to edit notes!</p>
        <div class="sample-prompts">
          <button class="sample-prompt-btn" data-prompt="Add a summary of this page to my notes.">"Add a summary of this page to my notes"</button>
          <button class="sample-prompt-btn" data-prompt="Is formula me Greek symbols kya represent kar rahe hain?">"Greek symbols kya represent kar rahe hain?"</button>
          <button class="sample-prompt-btn" data-prompt="Insert practice questions at the bottom of the notes.">"Insert practice questions at the bottom"</button>
          <button class="sample-prompt-btn" data-prompt="Is diagram ka explanation notes me add kar do.">"Diagram ka explanation notes me add karo"</button>
        </div>
      </div>
    `;

    this.container.querySelectorAll('.sample-prompt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.input.value = btn.dataset.prompt;
        this.handleSend();
      });
    });
  }

  setDiagramContext(diagramBlock) {
    this.activeDiagramContext = diagramBlock;
    const banner = document.getElementById('doubt-diagram-context-banner');
    if (banner) {
      banner.style.display = 'flex';
      banner.querySelector('.banner-text').textContent = `Active Context: ${diagramBlock.title || 'Diagram'}`;
    }
  }

  clearDiagramContext() {
    this.activeDiagramContext = null;
    const banner = document.getElementById('doubt-diagram-context-banner');
    if (banner) {
      banner.style.display = 'none';
    }
  }

  async handleSend() {
    const text = this.input.value.trim();
    if (!text) return;

    this.input.value = '';
    this.sendBtn.disabled = true;

    // Save user message to IndexedDB and UI
    const userMsg = await window.shaktDB.addDoubtMessage(
      this.currentPdfId,
      this.currentPageNumber,
      'user',
      text
    );
    this.renderMessageBubble(userMsg);
    this.scrollToBottom();
    this.renderKaTeXMath();

    // Show typing indicator
    const typingIndicator = this.showTypingIndicator();

    try {
      // Build conversation context
      const noteContext = this.getNoteContextCallback ? this.getNoteContextCallback() : '';
      const previousMessages = await window.shaktDB.getDoubtMessages(this.currentPdfId, this.currentPageNumber);

      const systemPrompt = `You are Shakt Copilot (शक्ति सहायक) — a brilliant, patient, empathetic academic mentor for Physics, Chemistry, Mathematics, and General Studies.
You help the student master their notes, resolve doubts, and directly maintain their digital notebook.

Language Rules:
- The user may ask questions in English, Hinglish (e.g. "Mujhe ye batao ki friction aur normal force me kya relation hai?"), or Hindi (Devanagari).
- Always reply in the exact language style and tone the user uses.
- If they ask in Hinglish, reply in clear, friendly, natural Hinglish.
- Keep explanations intuitive, grounded in first principles, and easy to retain.

STEM & Formula Rules:
- Use standard LaTeX notation for equations ($...$ for inline, $$...$$ for display).
- Preserves all Greek letters (\\alpha, \\beta, \\theta, \\lambda, \\mu, \\omega, \\Delta, etc.).

AUTOMATIC DOCUMENT EDIT PERMISSION:
You have direct, automatic permission to edit the student's document!
If the user tells you to add, edit, format, summarize, or modify notes (e.g. "Add a summary", "Insert formula", "Add practice questions", "Save this realisation", "Fix the typo in block 2"):
You MUST append a document action tag at the very end of your message in this exact format:
[[DOC_ACTION:{"action":"add_block","type":"paragraph|heading|subheading|formula|realisation","text":"..."}]]
Or for formulas:
[[DOC_ACTION:{"action":"insert_formula","latex":"..."}]]
Or for realisations:
[[DOC_ACTION:{"action":"insert_realisation","text":"..."}]]
Or for updates:
[[DOC_ACTION:{"action":"update_block","index":0,"text":"..."}]]

For any core insight you explain, ALWAYS also include:
💡 Realisation: <A crisp 1-2 sentence golden takeaway that the student should remember forever>`;

      // Sliding Context Window (last 8 messages)
      const recentHistory = previousMessages.slice(-8);
      const formattedHistory = recentHistory.map(m => ({
        role: m.role,
        content: m.content
      }));

      // Add note context into the latest message
      let fullUserPrompt = `[Context of Current Note Page]:\n${noteContext}\n\n`;
      if (this.activeDiagramContext) {
        fullUserPrompt += `[Focused Diagram Context]: Title: "${this.activeDiagramContext.title || ''}", Caption: "${this.activeDiagramContext.caption || ''}"\n\n`;
      }
      fullUserPrompt += `[Student's Question/Instruction]:\n${text}`;

      const messagesToSend = formattedHistory.slice(0, -1);
      messagesToSend.push({
        role: 'user',
        content: fullUserPrompt
      });

      const apiKey = await window.shaktDB.getSetting('apiKey');
      let selectedModel = (await window.shaktDB.getSetting('model')) || 'omni-route';

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey,
          model: selectedModel,
          system: systemPrompt,
          max_tokens: 2000,
          messages: messagesToSend
        })
      });

      typingIndicator.remove();

      if (!response.ok) {
        const errText = await response.text();
        let parsedErr = errText;
        try {
          const json = JSON.parse(errText);
          parsedErr = json.error?.message || json.message || json.error || errText;
          if (typeof parsedErr === 'object') {
            parsedErr = JSON.stringify(parsedErr);
          }
        } catch (_) {}
        throw new Error(`AI Request Failed: ${parsedErr}`);
      }

      const data = await response.json();
      const rawAssistantText = data.content?.[0]?.text || 'No response from AI.';

      // Track Token & Credit Usage
      if (data.usage) {
        window.dispatchEvent(new CustomEvent('shakt:token-usage', {
          detail: {
            model: selectedModel,
            inputTokens: data.usage.input_tokens || 0,
            outputTokens: data.usage.output_tokens || 0,
            cacheReadTokens: data.usage.cache_read_input_tokens || 0,
            cacheCreationTokens: data.usage.cache_creation_input_tokens || 0
          }
        }));
      }

      // Check for Document Action tags
      let cleanAssistantText = rawAssistantText;
      let detectedAction = null;

      const actionMatch = rawAssistantText.match(/\[\[DOC_ACTION:\s*([\s\S]+?)\s*\]\]/);
      if (actionMatch && actionMatch[1]) {
        try {
          detectedAction = JSON.parse(actionMatch[1]);
          cleanAssistantText = rawAssistantText.replace(/\[\[DOC_ACTION:\s*[\s\S]+?\s*\]\]/, '').trim();
        } catch (e) {
          console.warn('Could not parse DOC_ACTION JSON:', e);
        }
      }

      const assistantMsg = await window.shaktDB.addDoubtMessage(
        this.currentPdfId,
        this.currentPageNumber,
        'assistant',
        cleanAssistantText,
        true
      );

      this.renderMessageBubble(assistantMsg, detectedAction);
      this.scrollToBottom();
      this.renderKaTeXMath();

      // Automatically execute detected action on the note document!
      if (detectedAction && this.onExecuteAiActionCallback) {
        this.onExecuteAiActionCallback(detectedAction);
        this.showActionNotification('⚡ AI auto-updated your document');
      }

      // Clear one-time diagram focus after sending
      this.clearDiagramContext();

    } catch (err) {
      if (typingIndicator) typingIndicator.remove();
      this.renderErrorMessage('Error: ' + err.message);
    } finally {
      this.sendBtn.disabled = false;
    }
  }

  renderMessageBubble(msg, actionExecuted = null) {
    const bubble = document.createElement('div');
    bubble.className = `doubt-message ${msg.role === 'user' ? 'msg-user' : 'msg-assistant'}`;

    let bodyHtml = this.escapeHtml(msg.content).replace(/\n/g, '<br>');

    // Format `code` backticks
    bodyHtml = bodyHtml.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    let actionBadgeHtml = '';
    if (actionExecuted) {
      actionBadgeHtml = `
        <div class="msg-action-executed-pill">
          <span>⚡ Applied edit: <strong>${this.escapeHtml(actionExecuted.action || 'updated block')}</strong></span>
        </div>
      `;
    }

    bubble.innerHTML = `
      <div class="msg-header">
        <span class="msg-sender">${msg.role === 'user' ? '👤 You' : '⚡ Shakt AI'}</span>
        <span class="msg-time">${new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div class="msg-content katex-target">${bodyHtml}</div>
      ${actionBadgeHtml}
    `;

    // If assistant message, append "Add Realisation" button
    if (msg.role === 'assistant') {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'msg-actions';
      actionsDiv.innerHTML = `
        <button class="shakt-btn ghost btn-xs btn-save-realisation" title="Add this insight directly into notes">
          💡 Add to Notes
        </button>
      `;

      const saveBtn = actionsDiv.querySelector('.btn-save-realisation');
      saveBtn.addEventListener('click', () => {
        this.extractAndAddRealisation(msg.content);
      });

      bubble.appendChild(actionsDiv);
    }

    this.container.appendChild(bubble);
  }

  extractAndAddRealisation(fullText) {
    let realisationText = fullText;
    const match = fullText.match(/💡\s*Realisation:\s*([\s\S]+)$/i);
    if (match && match[1]) {
      realisationText = match[1].trim();
    }
    if (this.onAddRealisationCallback) {
      this.onAddRealisationCallback(realisationText);
    }
  }

  showActionNotification(msg) {
    const banner = document.getElementById('ai-edit-notification-banner');
    if (banner) {
      banner.querySelector('.notif-text').textContent = msg;
      banner.style.display = 'flex';
      setTimeout(() => {
        banner.style.display = 'none';
      }, 5000);
    }
  }

  showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'doubt-message msg-assistant typing-indicator-bubble';
    indicator.innerHTML = `
      <div class="msg-sender">⚡ Shakt AI is thinking...</div>
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    `;
    this.container.appendChild(indicator);
    this.scrollToBottom();
    return indicator;
  }

  renderErrorMessage(errText) {
    const errEl = document.createElement('div');
    errEl.className = 'doubt-error-banner';
    errEl.textContent = errText;
    this.container.appendChild(errEl);
    this.scrollToBottom();
  }

  scrollToBottom() {
    this.container.scrollTop = this.container.scrollHeight;
  }

  renderKaTeXMath() {
    if (typeof window.renderMathInElement === 'function') {
      window.renderMathInElement(this.container, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false,
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
      });
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

window.ShaktAiDoubt = ShaktAiDoubt;
