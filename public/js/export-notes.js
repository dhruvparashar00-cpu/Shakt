// export-notes.js - Shakt Note Export System
// Export notes as Markdown, JSON, or HTML

class ShaktExportNotes {
  constructor() {
    this.currentPdf = null;
    this.currentPage = null;
  }

  setContext(pdfId, pageNumber) {
    this.currentPdf = pdfId;
    this.currentPage = pageNumber;
  }

  async showExportModal() {
    // Create modal HTML
    const modalHTML = `
      <div id="export-modal" class="shakt-modal-overlay">
        <div class="shakt-modal-card">
          <div class="modal-header">
            <h3>📤 Export Notes</h3>
            <button id="btn-close-export-modal" class="btn-dismiss" aria-label="Close">✕</button>
          </div>

          <div class="export-modal-content">
            <div class="form-group">
              <label class="form-label">Export Format</label>
              <div class="export-format-options">
                <div class="export-format-card" data-format="markdown">
                  <div class="export-format-icon">📝</div>
                  <div class="export-format-name">Markdown</div>
                  <div class="export-format-desc">Text with formatting</div>
                </div>
                <div class="export-format-card" data-format="html">
                  <div class="export-format-icon">🌐</div>
                  <div class="export-format-name">HTML</div>
                  <div class="export-format-desc">Styled web page</div>
                </div>
                <div class="export-format-card" data-format="json">
                  <div class="export-format-icon">📦</div>
                  <div class="export-format-name">JSON</div>
                  <div class="export-format-desc">Full backup</div>
                </div>
                <div class="export-format-card" data-format="text">
                  <div class="export-format-icon">📄</div>
                  <div class="export-format-name">Plain Text</div>
                  <div class="export-format-desc">No formatting</div>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Export Scope</label>
              <div class="export-scope-options">
                <label class="export-scope-option">
                  <input type="radio" name="export-scope" value="current" checked />
                  <div class="export-scope-label">
                    <div class="export-scope-title">Current Page Only</div>
                    <div class="export-scope-desc">Export notes from this page</div>
                  </div>
                </label>
                <label class="export-scope-option">
                  <input type="radio" name="export-scope" value="all" />
                  <div class="export-scope-label">
                    <div class="export-scope-title">Entire Document</div>
                    <div class="export-scope-desc">Export all pages with notes</div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div class="modal-actions">
            <button class="shakt-btn secondary" id="btn-cancel-export">Cancel</button>
            <button class="shakt-btn primary" id="btn-confirm-export">
              <span aria-hidden="true">⬇️</span> Export
            </button>
          </div>
        </div>
      </div>
    `;

    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Attach event listeners
    this.attachModalListeners();
  }

  attachModalListeners() {
    const modal = document.getElementById('export-modal');
    const btnClose = document.getElementById('btn-close-export-modal');
    const btnCancel = document.getElementById('btn-cancel-export');
    const btnConfirm = document.getElementById('btn-confirm-export');
    const formatCards = document.querySelectorAll('.export-format-card');

    let selectedFormat = 'markdown';

    // Format selection
    formatCards.forEach(card => {
      card.addEventListener('click', () => {
        formatCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedFormat = card.dataset.format;
      });
    });

    // Default select markdown
    formatCards[0]?.classList.add('selected');

    // Close handlers
    const closeModal = () => {
      if (modal) modal.remove();
    };

    btnClose?.addEventListener('click', closeModal);
    btnCancel?.addEventListener('click', closeModal);

    // Export handler
    btnConfirm?.addEventListener('click', async () => {
      const scope = document.querySelector('input[name="export-scope"]:checked')?.value || 'current';
      closeModal();
      await this.performExport(selectedFormat, scope);
    });
  }

  async performExport(format, scope) {
    try {
      let data;
      let filename;

      if (scope === 'current') {
        // Export current page
        const blocks = await window.shaktDB.getPageNote(this.currentPdf, this.currentPage);
        if (!blocks || !blocks.blocks || blocks.blocks.length === 0) {
          this.showToast('No notes found on this page to export', 'error');
          return;
        }

        const pdfInfo = await window.shaktDB.getPdf(this.currentPdf);
        const pdfName = pdfInfo?.name || 'notes';
        filename = `${this.sanitizeFilename(pdfName)}-page-${this.currentPage}`;

        data = this.convertToFormat(blocks.blocks, format, {
          title: `${pdfName} - Page ${this.currentPage}`,
          page: this.currentPage
        });

      } else {
        // Export all pages
        const allPages = await this.getAllPagesWithNotes(this.currentPdf);
        if (allPages.length === 0) {
          this.showToast('No notes found in this document', 'error');
          return;
        }

        const pdfInfo = await window.shaktDB.getPdf(this.currentPdf);
        const pdfName = pdfInfo?.name || 'notes';
        filename = `${this.sanitizeFilename(pdfName)}-all-pages`;

        data = this.convertMultiplePagesToFormat(allPages, format, {
          title: pdfName,
          pdfName: pdfName
        });
      }

      // Download file
      this.downloadFile(data, filename, format);
      this.showToast(`✓ Exported as ${format.toUpperCase()}`, 'success');

    } catch (err) {
      console.error('Export error:', err);
      this.showToast('Export failed: ' + err.message, 'error');
    }
  }

  async getAllPagesWithNotes(pdfId) {
    const db = await window.shaktDB.db;
    const tx = db.transaction(['pageNotes'], 'readonly');
    const store = tx.objectStore('pageNotes');
    const allNotes = await store.getAll();

    return allNotes
      .filter(note => note.pdfId === pdfId && note.blocks && note.blocks.length > 0)
      .sort((a, b) => a.pageNumber - b.pageNumber);
  }

  convertToFormat(blocks, format, metadata) {
    switch (format) {
      case 'markdown':
        return this.toMarkdown(blocks, metadata);
      case 'html':
        return this.toHTML(blocks, metadata);
      case 'json':
        return this.toJSON(blocks, metadata);
      case 'text':
        return this.toPlainText(blocks, metadata);
      default:
        return this.toMarkdown(blocks, metadata);
    }
  }

  convertMultiplePagesToFormat(pages, format, metadata) {
    switch (format) {
      case 'markdown':
        return pages.map(page => {
          const pageHeader = `\n\n---\n\n# Page ${page.pageNumber}\n\n`;
          return pageHeader + this.toMarkdown(page.blocks, { page: page.pageNumber });
        }).join('\n');

      case 'html':
        const pagesHTML = pages.map(page => {
          const pageSection = `
            <section class="page-section" data-page="${page.pageNumber}">
              <h2 class="page-heading">Page ${page.pageNumber}</h2>
              ${this.blocksToHTML(page.blocks)}
            </section>
          `;
          return pageSection;
        }).join('\n');

        return this.wrapHTMLDocument(pagesHTML, metadata);

      case 'json':
        return JSON.stringify({
          ...metadata,
          exportDate: new Date().toISOString(),
          pages: pages.map(p => ({
            pageNumber: p.pageNumber,
            blocks: p.blocks,
            timestamp: p.timestamp
          }))
        }, null, 2);

      case 'text':
        return pages.map(page => {
          return `\n========== Page ${page.pageNumber} ==========\n\n` +
                 this.toPlainText(page.blocks, { page: page.pageNumber });
        }).join('\n\n');

      default:
        return '';
    }
  }

  toMarkdown(blocks, metadata) {
    let md = '';

    if (metadata.title) {
      md += `# ${metadata.title}\n\n`;
    }

    blocks.forEach((block, index) => {
      switch (block.type) {
        case 'text':
          const level = this.getFontSizeLevel(block.fontSize);
          if (level === 'title') {
            md += `# ${block.text}\n\n`;
          } else if (level === 'heading') {
            md += `## ${block.text}\n\n`;
          } else {
            md += `${block.text}\n\n`;
          }
          break;

        case 'diagram':
          md += `### 📊 Diagram: ${block.caption || 'Untitled'}\n\n`;
          md += `![${block.caption || 'Diagram'}](${block.imageUrl})\n\n`;
          if (block.caption) {
            md += `*${block.caption}*\n\n`;
          }
          break;

        case 'realisation':
          md += `> 💡 **Realisation**\n>\n> ${block.text}\n\n`;
          break;

        case 'spacer':
          md += `\n`;
          break;

        default:
          md += `${block.text || ''}\n\n`;
      }
    });

    return md;
  }

  toHTML(blocks, metadata) {
    const bodyHTML = this.blocksToHTML(blocks);
    return this.wrapHTMLDocument(bodyHTML, metadata);
  }

  blocksToHTML(blocks) {
    let html = '';

    blocks.forEach(block => {
      switch (block.type) {
        case 'text':
          const level = this.getFontSizeLevel(block.fontSize);
          if (level === 'title') {
            html += `<h1>${this.escapeHTML(block.text)}</h1>\n`;
          } else if (level === 'heading') {
            html += `<h2>${this.escapeHTML(block.text)}</h2>\n`;
          } else {
            html += `<p>${this.escapeHTML(block.text)}</p>\n`;
          }
          break;

        case 'diagram':
          html += `
            <figure class="diagram">
              <img src="${block.imageUrl}" alt="${this.escapeHTML(block.caption || 'Diagram')}" />
              ${block.caption ? `<figcaption>${this.escapeHTML(block.caption)}</figcaption>` : ''}
            </figure>\n
          `;
          break;

        case 'realisation':
          html += `
            <aside class="realisation">
              <strong>💡 Realisation</strong>
              <p>${this.escapeHTML(block.text)}</p>
            </aside>\n
          `;
          break;

        case 'spacer':
          html += `<div class="spacer"></div>\n`;
          break;
      }
    });

    return html;
  }

  wrapHTMLDocument(bodyContent, metadata) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHTML(metadata.title || 'Shakt Notes')}</title>
  <style>
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.7;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
      color: #1A202E;
      background: #FAFBFC;
    }
    h1, h2, h3 { font-weight: 700; margin-top: 1.5em; margin-bottom: 0.5em; }
    h1 { font-size: 2rem; border-bottom: 2px solid #E5E9EF; padding-bottom: 0.3em; }
    h2 { font-size: 1.5rem; color: #4F7EFF; }
    p { margin-bottom: 1em; }
    .diagram { margin: 2em 0; text-align: center; }
    .diagram img { max-width: 100%; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .diagram figcaption { margin-top: 0.5em; font-style: italic; color: #5D6B82; }
    .realisation {
      background: #E6FBF4;
      border-left: 5px solid #00C48C;
      padding: 1em 1.5em;
      margin: 1.5em 0;
      border-radius: 8px;
    }
    .realisation strong { color: #00C48C; display: block; margin-bottom: 0.5em; }
    .spacer { height: 2em; }
    .page-section { margin-bottom: 3em; }
    .page-heading {
      background: #F8F9FB;
      padding: 0.5em 1em;
      border-radius: 8px;
      margin: 2em 0 1em;
    }
    @media print {
      body { max-width: 100%; margin: 0; }
      .page-section { page-break-after: always; }
    }
  </style>
</head>
<body>
  ${bodyContent}
  <footer style="margin-top: 3em; padding-top: 1em; border-top: 1px solid #E5E9EF; color: #8B95A8; font-size: 0.85rem;">
    <p>Exported from Shakt on ${new Date().toLocaleDateString()}</p>
  </footer>
</body>
</html>`;
  }

  toJSON(blocks, metadata) {
    return JSON.stringify({
      ...metadata,
      exportDate: new Date().toISOString(),
      version: '1.0',
      blocks: blocks
    }, null, 2);
  }

  toPlainText(blocks, metadata) {
    let text = '';

    if (metadata.title) {
      text += `${metadata.title}\n${'='.repeat(metadata.title.length)}\n\n`;
    }

    blocks.forEach(block => {
      switch (block.type) {
        case 'text':
          text += `${block.text}\n\n`;
          break;

        case 'diagram':
          text += `[DIAGRAM: ${block.caption || 'Untitled'}]\n`;
          if (block.caption) {
            text += `Caption: ${block.caption}\n`;
          }
          text += `\n`;
          break;

        case 'realisation':
          text += `💡 REALISATION:\n${block.text}\n\n`;
          break;

        case 'spacer':
          text += `\n`;
          break;
      }
    });

    return text;
  }

  getFontSizeLevel(fontSize) {
    if (fontSize === 'font-size-xl') return 'title';
    if (fontSize === 'font-size-lg') return 'heading';
    return 'normal';
  }

  escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  sanitizeFilename(filename) {
    return filename
      .replace(/[^a-z0-9]/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }

  downloadFile(content, filename, format) {
    const mimeTypes = {
      markdown: 'text/markdown',
      html: 'text/html',
      json: 'application/json',
      text: 'text/plain'
    };

    const extensions = {
      markdown: 'md',
      html: 'html',
      json: 'json',
      text: 'txt'
    };

    const blob = new Blob([content], { type: mimeTypes[format] || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${extensions[format] || 'txt'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  showToast(message, type = 'info') {
    // Dispatch event for app.js to handle
    window.dispatchEvent(new CustomEvent('shakt:toast', {
      detail: { message, type }
    }));
  }
}

// Export for use in app.js
window.ShaktExportNotes = ShaktExportNotes;
