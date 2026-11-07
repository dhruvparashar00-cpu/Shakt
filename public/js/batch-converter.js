// batch-converter.js - Shakt Batch PDF Page Conversion System
// Convert multiple pages sequentially with progress tracking

class ShaktBatchConverter {
  constructor(aiConverter, pdfViewer, dbInstance) {
    this.aiConverter = aiConverter;
    this.pdfViewer = pdfViewer;
    this.db = dbInstance;
    this.isConverting = false;
    this.shouldCancel = false;
    this.delayBetweenPages = 2000; // 2 seconds between API calls
  }

  async showBatchModal(pdfId, totalPages, currentPage) {
    const modalHTML = `
      <div id="batch-modal" class="shakt-modal-overlay">
        <div class="shakt-modal-card">
          <div class="modal-header">
            <h3>⚡ Batch Convert Pages</h3>
            <button id="btn-close-batch-modal" class="btn-dismiss" aria-label="Close">✕</button>
          </div>

          <div class="export-modal-content">
            <div class="form-group">
              <label class="form-label">Conversion Scope</label>
              <div class="export-scope-options">
                <label class="export-scope-option">
                  <input type="radio" name="batch-scope" value="all" checked />
                  <div class="export-scope-label">
                    <div class="export-scope-title">Convert All Pages</div>
                    <div class="export-scope-desc">Process entire document (${totalPages} pages)</div>
                  </div>
                </label>
                <label class="export-scope-option">
                  <input type="radio" name="batch-scope" value="range" />
                  <div class="export-scope-label">
                    <div class="export-scope-title">Convert Page Range</div>
                    <div class="export-scope-desc">Choose specific pages to process</div>
                  </div>
                </label>
                <label class="export-scope-option">
                  <input type="radio" name="batch-scope" value="remaining" />
                  <div class="export-scope-label">
                    <div class="export-scope-title">From Current to End</div>
                    <div class="export-scope-desc">Pages ${currentPage} to ${totalPages}</div>
                  </div>
                </label>
              </div>
            </div>

            <div class="form-group" id="range-inputs" style="display: none;">
              <label class="form-label">Page Range</label>
              <div style="display: flex; gap: 12px; align-items: center;">
                <input type="number" id="batch-start-page" class="form-input" min="1" max="${totalPages}" value="1" placeholder="Start" />
                <span style="color: var(--text-muted);">to</span>
                <input type="number" id="batch-end-page" class="form-input" min="1" max="${totalPages}" value="${totalPages}" placeholder="End" />
              </div>
            </div>

            <div class="form-group">
              <label class="search-option-label" style="padding: 12px; background: var(--bg-surface-elevated); border-radius: var(--radius-md);">
                <input type="checkbox" id="batch-skip-converted" checked />
                <span>Skip pages that already have notes</span>
              </label>
            </div>

            <div class="form-group">
              <label class="form-label">Rate Limiting</label>
              <div style="display: flex; gap: 12px; align-items: center;">
                <span style="font-size: 0.9rem; color: var(--text-muted);">Delay between pages:</span>
                <select id="batch-delay" class="form-select" style="width: auto;">
                  <option value="1000">1 second</option>
                  <option value="2000" selected>2 seconds (recommended)</option>
                  <option value="3000">3 seconds</option>
                  <option value="5000">5 seconds (safe)</option>
                </select>
              </div>
              <div class="form-help">Prevents API rate limiting and reduces costs</div>
            </div>
          </div>

          <div class="modal-actions">
            <button class="shakt-btn secondary" id="btn-cancel-batch">Cancel</button>
            <button class="shakt-btn primary" id="btn-start-batch">
              <span aria-hidden="true">⚡</span> Start Conversion
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.attachBatchModalListeners(pdfId, totalPages, currentPage);
  }

  attachBatchModalListeners(pdfId, totalPages, currentPage) {
    const modal = document.getElementById('batch-modal');
    const btnClose = document.getElementById('btn-close-batch-modal');
    const btnCancel = document.getElementById('btn-cancel-batch');
    const btnStart = document.getElementById('btn-start-batch');
    const rangeInputs = document.getElementById('range-inputs');
    const scopeRadios = document.querySelectorAll('input[name="batch-scope"]');

    // Show/hide range inputs
    scopeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        rangeInputs.style.display = e.target.value === 'range' ? 'block' : 'none';
      });
    });

    const closeModal = () => {
      if (modal) modal.remove();
    };

    btnClose?.addEventListener('click', closeModal);
    btnCancel?.addEventListener('click', closeModal);

    btnStart?.addEventListener('click', async () => {
      const scope = document.querySelector('input[name="batch-scope"]:checked')?.value || 'all';
      const skipConverted = document.getElementById('batch-skip-converted')?.checked || false;
      const delay = parseInt(document.getElementById('batch-delay')?.value) || 2000;

      let startPage = 1;
      let endPage = totalPages;

      if (scope === 'range') {
        startPage = parseInt(document.getElementById('batch-start-page')?.value) || 1;
        endPage = parseInt(document.getElementById('batch-end-page')?.value) || totalPages;
      } else if (scope === 'remaining') {
        startPage = currentPage;
        endPage = totalPages;
      }

      closeModal();
      await this.startBatchConversion(pdfId, startPage, endPage, skipConverted, delay);
    });
  }

  async startBatchConversion(pdfId, startPage, endPage, skipConverted, delay) {
    if (this.isConverting) {
      this.showToast('Batch conversion already in progress', 'error');
      return;
    }

    this.isConverting = true;
    this.shouldCancel = false;
    this.delayBetweenPages = delay;

    // Show progress modal
    this.showProgressModal();

    const results = {
      total: endPage - startPage + 1,
      converted: 0,
      skipped: 0,
      failed: 0,
      startTime: Date.now()
    };

    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      if (this.shouldCancel) {
        this.showToast('Batch conversion cancelled', 'info');
        break;
      }

      // Check if page already has notes
      if (skipConverted) {
        const existing = await this.db.getPageNote(pdfId, pageNum);
        if (existing && existing.blocks && existing.blocks.length > 0) {
          results.skipped++;
          this.updateProgressModal(pageNum, endPage, results);
          continue;
        }
      }

      // Update progress
      this.updateProgressModal(pageNum, endPage, results, 'converting');

      try {
        // Load page in viewer
        await this.pdfViewer.goToPage(pageNum);
        await this.sleep(500); // Wait for page to render

        // Get page image
        const imageBase64 = this.pdfViewer.getPageImageBase64(0.92);
        if (!imageBase64) {
          throw new Error('Failed to capture page image');
        }

        // Convert with AI
        const result = await this.aiConverter.convertPage(imageBase64, this.pdfViewer);

        // Save to database
        await this.db.savePageNote(pdfId, pageNum, result.blocks);

        results.converted++;
        this.updateProgressModal(pageNum, endPage, results, 'success');

        // Delay before next page (rate limiting)
        if (pageNum < endPage) {
          await this.sleep(this.delayBetweenPages);
        }

      } catch (error) {
        console.error(`Failed to convert page ${pageNum}:`, error);
        results.failed++;
        this.updateProgressModal(pageNum, endPage, results, 'error');

        // Still delay before continuing
        if (pageNum < endPage) {
          await this.sleep(this.delayBetweenPages);
        }
      }
    }

    this.isConverting = false;

    // Show completion summary
    const elapsed = Math.round((Date.now() - results.startTime) / 1000);
    this.showCompletionSummary(results, elapsed);
  }

  showProgressModal() {
    const modalHTML = `
      <div id="batch-progress-modal" class="shakt-modal-overlay">
        <div class="shakt-modal-card">
          <div class="modal-header">
            <h3>⚡ Converting Pages</h3>
          </div>

          <div class="batch-progress-container">
            <div class="batch-current-page" id="batch-current-status">
              Preparing...
            </div>

            <div class="batch-progress-bar">
              <div class="batch-progress-fill" id="batch-progress-fill" style="width: 0%"></div>
            </div>

            <div class="batch-progress-text" id="batch-progress-text">
              Starting conversion...
            </div>

            <div class="batch-stats">
              <div class="batch-stat">
                <div class="batch-stat-value" id="stat-converted">0</div>
                <div class="batch-stat-label">Converted</div>
              </div>
              <div class="batch-stat">
                <div class="batch-stat-value" id="stat-skipped">0</div>
                <div class="batch-stat-label">Skipped</div>
              </div>
              <div class="batch-stat">
                <div class="batch-stat-value" id="stat-failed">0</div>
                <div class="batch-stat-label">Failed</div>
              </div>
            </div>
          </div>

          <div class="modal-actions">
            <button class="shakt-btn secondary" id="btn-cancel-batch-conversion">
              Cancel
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const btnCancel = document.getElementById('btn-cancel-batch-conversion');
    btnCancel?.addEventListener('click', () => {
      this.shouldCancel = true;
      btnCancel.disabled = true;
      btnCancel.textContent = 'Cancelling...';
    });
  }

  updateProgressModal(currentPage, totalPages, results, status = 'converting') {
    const progressFill = document.getElementById('batch-progress-fill');
    const currentStatus = document.getElementById('batch-current-status');
    const progressText = document.getElementById('batch-progress-text');
    const statConverted = document.getElementById('stat-converted');
    const statSkipped = document.getElementById('stat-skipped');
    const statFailed = document.getElementById('stat-failed');

    const progress = ((currentPage - 1) / totalPages) * 100;

    if (progressFill) progressFill.style.width = `${progress}%`;

    if (currentStatus) {
      const statusEmoji = {
        converting: '⚡',
        success: '✓',
        error: '✗'
      };
      currentStatus.textContent = `${statusEmoji[status] || '⚡'} Page ${currentPage} of ${totalPages}`;
    }

    if (progressText) {
      const remaining = totalPages - currentPage + 1;
      const estimatedTime = Math.round((remaining * this.delayBetweenPages) / 1000);
      progressText.textContent = status === 'converting'
        ? `Processing page ${currentPage}... (Est. ${estimatedTime}s remaining)`
        : `Completed page ${currentPage}`;
    }

    if (statConverted) statConverted.textContent = results.converted;
    if (statSkipped) statSkipped.textContent = results.skipped;
    if (statFailed) statFailed.textContent = results.failed;
  }

  showCompletionSummary(results, elapsedSeconds) {
    const modal = document.getElementById('batch-progress-modal');
    if (modal) modal.remove();

    const summaryHTML = `
      <div id="batch-summary-modal" class="shakt-modal-overlay">
        <div class="shakt-modal-card">
          <div class="modal-header">
            <h3>✓ Batch Conversion Complete</h3>
            <button id="btn-close-summary" class="btn-dismiss">✕</button>
          </div>

          <div class="batch-progress-container">
            <div class="batch-stats">
              <div class="batch-stat">
                <div class="batch-stat-value" style="color: var(--accent-success);">${results.converted}</div>
                <div class="batch-stat-label">Successfully Converted</div>
              </div>
              <div class="batch-stat">
                <div class="batch-stat-value" style="color: var(--text-muted);">${results.skipped}</div>
                <div class="batch-stat-label">Skipped</div>
              </div>
              <div class="batch-stat">
                <div class="batch-stat-value" style="color: #FF4757;">${results.failed}</div>
                <div class="batch-stat-label">Failed</div>
              </div>
            </div>

            <div class="batch-progress-text" style="margin-top: 20px; text-align: center;">
              <p style="color: var(--text-main); font-weight: 600;">
                Total time: ${elapsedSeconds} seconds
              </p>
              <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 8px;">
                Average: ${(elapsedSeconds / results.total).toFixed(1)}s per page
              </p>
            </div>
          </div>

          <div class="modal-actions">
            <button class="shakt-btn primary" id="btn-finish-batch">Done</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const closeModal = () => {
      const summaryModal = document.getElementById('batch-summary-modal');
      if (summaryModal) summaryModal.remove();
    };

    document.getElementById('btn-close-summary')?.addEventListener('click', closeModal);
    document.getElementById('btn-finish-batch')?.addEventListener('click', closeModal);

    // Show toast
    if (results.converted > 0) {
      this.showToast(`✓ Successfully converted ${results.converted} pages!`, 'success');
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  showToast(message, type = 'info') {
    window.dispatchEvent(new CustomEvent('shakt:toast', {
      detail: { message, type }
    }));
  }
}

// Export for use in app.js
window.ShaktBatchConverter = ShaktBatchConverter;
