// note-editor.js - Shakt Rich STEM Block Editor with KaTeX Math & Dynamic Space Reflow
// Designed for non-stylus note taking, LaTeX formulas, diagram preservation, and AI auto-edits

class ShaktNoteEditor {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.blocks = [];
    this.isEditMode = false;
    this.pdfId = null;
    this.pageNumber = 1;
    this.saveTimeout = null;
    this.onSave = null;
    this.onAskDoubtAboutBlock = null;
    this.onZoomDiagram = null;

    // Clipboard paste listener for outer diagrams
    document.addEventListener('paste', (e) => this.handleClipboardPaste(e));
  }

  loadBlocks(blocks, pdfId, pageNumber) {
    this.blocks = JSON.parse(JSON.stringify(blocks || []));
    this.pdfId = pdfId;
    this.pageNumber = pageNumber;
    this.render();
  }

  setEditMode(enabled) {
    this.isEditMode = enabled;
    this.render();
  }

  toggleEditMode() {
    this.setEditMode(!this.isEditMode);
    return this.isEditMode;
  }

  render() {
    this.container.innerHTML = '';

    if (this.blocks.length === 0) {
      this.container.innerHTML = `
        <div class="empty-editor-state">
          <div class="empty-icon">📝</div>
          <h3>No Notes for this Page Yet</h3>
          <p>Click <strong>"⚡ Convert Page"</strong> to auto-digitize text, formulas (KaTeX), and diagrams with AI, or add blocks below.</p>
          <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 14px;">
            <button class="shakt-btn primary" id="btn-add-first-block">
              <span class="icon">+</span> Add Note Block
            </button>
            <button class="shakt-btn secondary" id="btn-add-first-formula">
              <span class="icon">∑</span> Add Formula
            </button>
          </div>
        </div>
      `;
      const btnBlock = this.container.querySelector('#btn-add-first-block');
      if (btnBlock) {
        btnBlock.addEventListener('click', () => this.insertBlock(0, 'paragraph'));
      }
      const btnFormula = this.container.querySelector('#btn-add-first-formula');
      if (btnFormula) {
        btnFormula.addEventListener('click', () => this.insertBlock(0, 'formula', 'E = mc^2'));
      }
      return;
    }

    // Top insertion trigger (Edit Mode only)
    if (this.isEditMode) {
      this.container.appendChild(this.createInsertDivider(0));
    }

    this.blocks.forEach((block, index) => {
      const blockEl = this.createBlockElement(block, index);
      this.container.appendChild(blockEl);

      // Divider to make space & add text between any blocks (Edit Mode only)
      if (this.isEditMode) {
        this.container.appendChild(this.createInsertDivider(index + 1));
      }
    });

    // Auto-render KaTeX math across all rendered blocks
    this.renderKaTeXMath();
  }

  createInsertDivider(insertIndex) {
    const divider = document.createElement('div');
    divider.className = 'editor-insert-divider';
    divider.innerHTML = `
      <div class="divider-line"></div>
      <div class="divider-buttons">
        <button class="divider-btn divider-add-text" title="Add text note here">
          <span>+ Note</span>
        </button>
        <button class="divider-btn divider-add-formula" title="Add math/science formula (KaTeX)">
          <span>∑ Formula</span>
        </button>
        <button class="divider-btn divider-add-diagram" title="Upload or insert outer diagram">
          <span>🖼️ Diagram</span>
        </button>
        <button class="divider-btn divider-add-space" title="Make vertical blank space">
          <span>⇕ Space</span>
        </button>
      </div>
      <div class="divider-line"></div>
    `;

    divider.querySelector('.divider-add-text').addEventListener('click', () => {
      this.insertBlock(insertIndex, 'paragraph');
    });

    divider.querySelector('.divider-add-formula').addEventListener('click', () => {
      this.insertBlock(insertIndex, 'formula', '\\vec{F} = m \\vec{a}');
    });

    divider.querySelector('.divider-add-diagram').addEventListener('click', () => {
      this.triggerOuterDiagramUpload(insertIndex);
    });

    divider.querySelector('.divider-add-space').addEventListener('click', () => {
      this.insertBlock(insertIndex, 'spacer');
    });

    return divider;
  }

  createBlockElement(block, index) {
    const el = document.createElement('div');
    el.className = `note-block note-block-${block.type} ${this.isEditMode ? 'in-edit-mode' : 'in-read-mode'}`;
    el.dataset.id = block.id;

    // Apply custom vertical spacing (Dynamic space slider)
    const spacing = block.spacingBottom !== undefined ? block.spacingBottom : 16;
    el.style.marginBottom = `${spacing}px`;

    // Apply font size
    const fontSizeClass = `font-size-${block.fontSize || 'md'}`;
    el.classList.add(fontSizeClass);

    // Render depending on type
    if (block.type === 'diagram' || block.type === 'outer_diagram') {
      el.innerHTML = this.renderDiagramBlockHtml(block);
    } else if (block.type === 'formula') {
      el.innerHTML = this.renderFormulaBlockHtml(block);
    } else if (block.type === 'realisation') {
      el.innerHTML = this.renderRealisationBlockHtml(block);
    } else if (block.type === 'spacer') {
      el.innerHTML = this.renderSpacerBlockHtml(block);
    } else {
      el.innerHTML = this.renderStandardBlockHtml(block);
    }

    // Attach Edit Controls Toolbar if in Edit Mode
    if (this.isEditMode) {
      const toolbar = this.createBlockToolbar(block, index);
      el.insertBefore(toolbar, el.firstChild);

      // Handle in-place editing for editable text elements
      const contentEl = el.querySelector('.block-editable-text');
      if (contentEl) {
        contentEl.contentEditable = 'true';
        contentEl.addEventListener('input', () => {
          block.text = contentEl.innerText;
          this.triggerAutoSave();
        });
      }

      // Handle formula LaTeX editing
      const formulaInput = el.querySelector('.formula-latex-input');
      if (formulaInput) {
        formulaInput.addEventListener('input', () => {
          block.text = formulaInput.value;
          this.updateFormulaPreview(el, formulaInput.value);
          this.triggerAutoSave();
        });
      }

      // Handle caption editing for diagrams
      const captionEl = el.querySelector('.diagram-caption-editable');
      if (captionEl) {
        captionEl.contentEditable = 'true';
        captionEl.addEventListener('input', () => {
          block.caption = captionEl.innerText;
          this.triggerAutoSave();
        });
      }
    }

    // Diagram interactive actions (Doubt about diagram, zoom modal)
    if (block.type === 'diagram' || block.type === 'outer_diagram') {
      const askBtn = el.querySelector('.btn-ask-diagram');
      if (askBtn) {
        askBtn.addEventListener('click', () => {
          if (this.onAskDoubtAboutBlock) {
            this.onAskDoubtAboutBlock(block);
          }
        });
      }

      const imgEl = el.querySelector('.diagram-img');
      if (imgEl) {
        imgEl.addEventListener('click', () => {
          if (this.onZoomDiagram) {
            this.onZoomDiagram(block.imageUrl, block.title, block.caption);
          }
        });
      }
    }

    return el;
  }

  renderStandardBlockHtml(block) {
    const tag = block.type === 'heading' ? 'h2' : (block.type === 'subheading' ? 'h3' : 'div');
    const textHtml = this.escapeHtml(block.text || '').replace(/\n/g, '<br>');
    return `<${tag} class="block-content block-editable-text katex-target">${textHtml || (this.isEditMode ? '<em>Click to type note...</em>' : '')}</${tag}>`;
  }

  renderFormulaBlockHtml(block) {
    const formulaLatex = block.text || '';
    let renderedMath = '';

    try {
      if (window.katex) {
        renderedMath = window.katex.renderToString(formulaLatex, {
          displayMode: true,
          throwOnError: false
        });
      } else {
        renderedMath = `<code class="formula-fallback">$$${this.escapeHtml(formulaLatex)}$$</code>`;
      }
    } catch (err) {
      renderedMath = `<div class="katex-error">Formula syntax: ${this.escapeHtml(formulaLatex)}</div>`;
    }

    if (this.isEditMode) {
      return `
        <div class="formula-card in-editor">
          <div class="formula-header">
            <span class="formula-badge">∑ Formula / Equation (LaTeX)</span>
            <span class="formula-hint">Standard LaTeX syntax: \\frac{a}{b}, \\alpha, \\beta, \\vec{F}, \\int</span>
          </div>
          <div class="formula-latex-editor">
            <textarea class="formula-latex-input" rows="2" placeholder="e.g. \\vec{F} = m \\vec{a} or f_{max} = \\mu_s N">${this.escapeHtml(formulaLatex)}</textarea>
          </div>
          <div class="formula-preview-container">
            <div class="formula-preview-label">Live KaTeX Render:</div>
            <div class="formula-rendered-view">${renderedMath}</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="formula-card">
        <div class="formula-header">
          <span class="formula-badge">∑ Formula</span>
        </div>
        <div class="formula-rendered-view">${renderedMath}</div>
      </div>
    `;
  }

  updateFormulaPreview(blockEl, latex) {
    const previewEl = blockEl.querySelector('.formula-rendered-view');
    if (!previewEl) return;

    try {
      if (window.katex) {
        previewEl.innerHTML = window.katex.renderToString(latex, {
          displayMode: true,
          throwOnError: false
        });
      } else {
        previewEl.innerHTML = `<code>$$${this.escapeHtml(latex)}$$</code>`;
      }
    } catch (e) {
      previewEl.innerHTML = `<span class="katex-error">${e.message}</span>`;
    }
  }

  renderRealisationBlockHtml(block) {
    const textHtml = this.escapeHtml(block.text || '').replace(/\n/g, '<br>');
    return `
      <div class="realisation-card">
        <div class="realisation-header">
          <span class="realisation-icon">💡</span>
          <span class="realisation-label">Realisation / आत्मबोध</span>
        </div>
        <div class="realisation-body block-editable-text katex-target">${textHtml}</div>
      </div>
    `;
  }

  renderDiagramBlockHtml(block) {
    const isOuter = block.type === 'outer_diagram';
    const tagLabel = isOuter ? '🖼️ Outer Diagram' : '📊 Extracted Diagram';

    return `
      <div class="diagram-card ${isOuter ? 'diagram-card-outer' : ''}">
        <div class="diagram-header">
          <span class="diagram-tag">${tagLabel}</span>
          <span class="diagram-title">${this.escapeHtml(block.title || (isOuter ? 'Outer Study Diagram' : 'Note Diagram'))}</span>
          <div class="diagram-header-actions">
            <button class="shakt-btn ghost btn-xs btn-ask-diagram" title="Ask AI copilot about this diagram">
              🤖 Ask AI
            </button>
            <button class="shakt-btn ghost btn-xs btn-zoom-diagram" title="Zoom in full-screen">
              🔍 Zoom
            </button>
          </div>
        </div>
        <div class="diagram-image-container">
          ${block.imageUrl
            ? `<img src="${block.imageUrl}" alt="${this.escapeHtml(block.title || 'Diagram')}" class="diagram-img" title="Click to expand" />`
            : '<div class="no-diagram-img">No diagram image attached</div>'}
        </div>
        <div class="diagram-caption ${this.isEditMode ? 'diagram-caption-editable' : ''} katex-target">
          ${this.escapeHtml(block.caption || 'Diagram illustration')}
        </div>
      </div>
    `;
  }

  renderSpacerBlockHtml(block) {
    const height = block.spacingBottom || 60;
    return `
      <div class="spacer-block" style="height: ${height}px;">
        <span class="spacer-label">Blank Space (${height}px)</span>
      </div>
    `;
  }

  createBlockToolbar(block, index) {
    const toolbar = document.createElement('div');
    toolbar.className = 'block-toolbar';

    toolbar.innerHTML = `
      <div class="toolbar-left">
        <!-- Block Type Selector -->
        <select class="tb-select tb-type-select">
          <option value="paragraph" ${block.type === 'paragraph' ? 'selected' : ''}>Paragraph</option>
          <option value="heading" ${block.type === 'heading' ? 'selected' : ''}>Heading 1</option>
          <option value="subheading" ${block.type === 'subheading' ? 'selected' : ''}>Heading 2</option>
          <option value="formula" ${block.type === 'formula' ? 'selected' : ''}>∑ Formula (KaTeX)</option>
          <option value="realisation" ${block.type === 'realisation' ? 'selected' : ''}>💡 Realisation</option>
        </select>

        <!-- Font Size Selector -->
        <select class="tb-select tb-font-select" title="Change text size">
          <option value="sm" ${block.fontSize === 'sm' ? 'selected' : ''}>Small</option>
          <option value="md" ${block.fontSize === 'md' || !block.fontSize ? 'selected' : ''}>Normal</option>
          <option value="lg" ${block.fontSize === 'lg' ? 'selected' : ''}>Large</option>
          <option value="xl" ${block.fontSize === 'xl' ? 'selected' : ''}>Title</option>
        </select>

        <!-- Dynamic Space Control Slider -->
        <div class="tb-spacing-control" title="Push down content below dynamically">
          <label class="tb-slider-label">Space: <span class="space-val">${block.spacingBottom || 16}px</span></label>
          <input type="range" min="4" max="180" step="4" value="${block.spacingBottom || 16}" class="tb-space-slider" />
        </div>
      </div>

      <div class="toolbar-right">
        <button class="tb-btn tb-move-up" title="Move Up" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button class="tb-btn tb-move-down" title="Move Down" ${index === this.blocks.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="tb-btn tb-delete" title="Delete Block">✕</button>
      </div>
    `;

    // Type Change
    toolbar.querySelector('.tb-type-select').addEventListener('change', (e) => {
      block.type = e.target.value;
      this.triggerAutoSave();
      this.render();
    });

    // Font Size Change
    toolbar.querySelector('.tb-font-select').addEventListener('change', (e) => {
      block.fontSize = e.target.value;
      this.triggerAutoSave();
      this.render();
    });

    // Dynamic Spacing Slider
    const spaceSlider = toolbar.querySelector('.tb-space-slider');
    const spaceValLabel = toolbar.querySelector('.space-val');
    spaceSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      block.spacingBottom = val;
      spaceValLabel.textContent = `${val}px`;
      const blockEl = toolbar.parentElement;
      if (blockEl) {
        blockEl.style.marginBottom = `${val}px`;
      }
      this.triggerAutoSave();
    });

    // Move Up
    toolbar.querySelector('.tb-move-up').addEventListener('click', () => {
      if (index > 0) {
        const temp = this.blocks[index];
        this.blocks[index] = this.blocks[index - 1];
        this.blocks[index - 1] = temp;
        this.triggerAutoSave();
        this.render();
      }
    });

    // Move Down
    toolbar.querySelector('.tb-move-down').addEventListener('click', () => {
      if (index < this.blocks.length - 1) {
        const temp = this.blocks[index];
        this.blocks[index] = this.blocks[index + 1];
        this.blocks[index + 1] = temp;
        this.triggerAutoSave();
        this.render();
      }
    });

    // Delete
    toolbar.querySelector('.tb-delete').addEventListener('click', () => {
      this.blocks.splice(index, 1);
      this.triggerAutoSave();
      this.render();
    });

    return toolbar;
  }

  insertBlock(index, type = 'paragraph', text = '', imageUrl = null, title = null, caption = null) {
    const newBlock = {
      id: 'b_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      type: type,
      text: text,
      title: title || (type === 'outer_diagram' ? 'Outer Diagram' : ''),
      caption: caption || '',
      fontSize: type === 'heading' ? 'xl' : (type === 'formula' ? 'lg' : 'md'),
      spacingBottom: type === 'spacer' ? 60 : (type === 'diagram' || type === 'outer_diagram' ? 24 : 16),
      imageUrl: imageUrl
    };

    if (index < 0 || index > this.blocks.length) {
      this.blocks.push(newBlock);
    } else {
      this.blocks.splice(index, 0, newBlock);
    }

    this.triggerAutoSave();
    this.render();

    // Scroll to the newly inserted block
    setTimeout(() => {
      const newEl = this.container.querySelector(`[data-id="${newBlock.id}"]`);
      if (newEl) {
        newEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        newEl.classList.add('ai-highlight-added');
        setTimeout(() => newEl.classList.remove('ai-highlight-added'), 2000);
        const textTarget = newEl.querySelector('.block-editable-text, .formula-latex-input');
        if (textTarget) textTarget.focus();
      }
    }, 60);

    return newBlock;
  }

  addRealisation(text) {
    return this.insertBlock(this.blocks.length, 'realisation', text);
  }

  addFormula(latex) {
    return this.insertBlock(this.blocks.length, 'formula', latex);
  }

  addOuterDiagram(imageUrl, title = 'Outer Diagram', caption = '') {
    return this.insertBlock(this.blocks.length, 'outer_diagram', '', imageUrl, title, caption);
  }

  // ============================================================================
  // AI AUTOMATIC PERMISSION TO EDIT MODE (Action Executor)
  // ============================================================================
  applyAiEditAction(actionObj) {
    if (!actionObj || !actionObj.action) return false;

    let modified = false;

    switch (actionObj.action) {
      case 'add_block':
      case 'insert_block': {
        const type = actionObj.type || actionObj.block?.type || 'paragraph';
        const text = actionObj.text || actionObj.block?.text || '';
        const index = actionObj.index !== undefined ? actionObj.index : this.blocks.length;
        const targetIndex = index === -1 ? this.blocks.length : index;
        this.insertBlock(targetIndex, type, text, actionObj.imageUrl, actionObj.title, actionObj.caption);
        modified = true;
        break;
      }

      case 'insert_formula': {
        const latex = actionObj.latex || actionObj.text || '';
        const targetIndex = actionObj.index !== undefined && actionObj.index !== -1 ? actionObj.index : this.blocks.length;
        this.insertBlock(targetIndex, 'formula', latex);
        modified = true;
        break;
      }

      case 'insert_realisation': {
        const text = actionObj.text || '';
        this.addRealisation(text);
        modified = true;
        break;
      }

      case 'update_block': {
        let blockToUpdate = null;
        if (actionObj.id) {
          blockToUpdate = this.blocks.find(b => b.id === actionObj.id);
        } else if (actionObj.index !== undefined && this.blocks[actionObj.index]) {
          blockToUpdate = this.blocks[actionObj.index];
        }

        if (blockToUpdate) {
          if (actionObj.text !== undefined) blockToUpdate.text = actionObj.text;
          if (actionObj.type !== undefined) blockToUpdate.type = actionObj.type;
          if (actionObj.title !== undefined) blockToUpdate.title = actionObj.title;
          if (actionObj.caption !== undefined) blockToUpdate.caption = actionObj.caption;
          this.triggerAutoSave();
          this.render();

          const targetEl = this.container.querySelector(`[data-id="${blockToUpdate.id}"]`);
          if (targetEl) {
            targetEl.classList.add('ai-highlight-added');
            setTimeout(() => targetEl.classList.remove('ai-highlight-added'), 2000);
          }
          modified = true;
        }
        break;
      }

      case 'delete_block': {
        let deleteIdx = -1;
        if (actionObj.id) {
          deleteIdx = this.blocks.findIndex(b => b.id === actionObj.id);
        } else if (actionObj.index !== undefined) {
          deleteIdx = actionObj.index;
        }

        if (deleteIdx >= 0 && deleteIdx < this.blocks.length) {
          this.blocks.splice(deleteIdx, 1);
          this.triggerAutoSave();
          this.render();
          modified = true;
        }
        break;
      }

      case 'batch_update':
      case 'batch_replace': {
        if (Array.isArray(actionObj.blocks)) {
          this.blocks = actionObj.blocks;
          this.triggerAutoSave();
          this.render();
          modified = true;
        }
        break;
      }
    }

    return modified;
  }

  // ============================================================================
  // CLIPBOARD & FILE UPLOAD FOR OUTER DIAGRAMS
  // ============================================================================
  handleClipboardPaste(e) {
    if (!this.isEditMode) return;
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => {
          this.addOuterDiagram(event.target.result, 'Pasted Diagram', 'Pasted from clipboard');
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  }

  triggerOuterDiagramUpload(insertIndex = -1) {
    const fileInput = document.getElementById('outer-diagram-file-input');
    if (!fileInput) return;

    const onFileSelected = (e) => {
      const file = e.target.files[0];
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const idx = insertIndex === -1 ? this.blocks.length : insertIndex;
          this.insertBlock(idx, 'outer_diagram', '', event.target.result, file.name.replace(/\.[^.]+$/, ''), 'Uploaded diagram');
        };
        reader.readAsDataURL(file);
      }
      fileInput.removeEventListener('change', onFileSelected);
      fileInput.value = '';
    };

    fileInput.addEventListener('change', onFileSelected);
    fileInput.click();
  }

  // ============================================================================
  // KATEX AUTO-RENDERING (STEM Support)
  // ============================================================================
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
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'input']
      });
    }
  }

  triggerAutoSave() {
    clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      if (this.onSave && this.pdfId) {
        this.onSave(this.blocks, this.pdfId, this.pageNumber);
      }
    }, 400);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

window.ShaktNoteEditor = ShaktNoteEditor;
