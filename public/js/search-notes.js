// search-notes.js - Shakt Note Search System
// Search across all notes with highlighting and navigation

class ShaktSearchNotes {
  constructor(editorContainerId) {
    this.editorContainerId = editorContainerId;
    this.isSearchOpen = false;
    this.currentResults = [];
    this.currentResultIndex = -1;
    this.caseSensitive = false;
    this.searchTerm = '';

    this.createSearchUI();
    this.attachEventListeners();
  }

  createSearchUI() {
    // Create search panel HTML
    const searchHTML = `
      <div id="search-panel" class="search-panel" style="display: none;" role="search">
        <div class="search-header">
          <div class="search-input-wrapper">
            <span class="search-icon" aria-hidden="true">🔍</span>
            <input
              type="text"
              id="search-input"
              class="search-input"
              placeholder="Search in notes..."
              aria-label="Search in notes"
              autocomplete="off"
            />
            <button id="btn-clear-search" class="search-clear-btn" aria-label="Clear search" style="display: none;">
              ✕
            </button>
          </div>

          <div class="search-options">
            <label class="search-option-label">
              <input type="checkbox" id="search-case-sensitive" aria-label="Case sensitive search" />
              <span>Aa</span>
            </label>
          </div>

          <div class="search-navigation">
            <span id="search-result-count" class="search-result-count" role="status" aria-live="polite">No results</span>
            <button id="btn-search-prev" class="search-nav-btn" aria-label="Previous result" disabled>
              ↑
            </button>
            <button id="btn-search-next" class="search-nav-btn" aria-label="Next result" disabled>
              ↓
            </button>
          </div>

          <button id="btn-close-search" class="search-close-btn" aria-label="Close search">
            ✕
          </button>
        </div>
      </div>
    `;

    // Add to page (insert before note editor)
    const editorWrapper = document.querySelector('.note-editor-wrapper');
    if (editorWrapper) {
      editorWrapper.insertAdjacentHTML('afterbegin', searchHTML);
    }
  }

  attachEventListeners() {
    const searchInput = document.getElementById('search-input');
    const btnCloseSearch = document.getElementById('btn-close-search');
    const btnClearSearch = document.getElementById('btn-clear-search');
    const btnSearchNext = document.getElementById('btn-search-next');
    const btnSearchPrev = document.getElementById('btn-search-prev');
    const caseSensitiveCheckbox = document.getElementById('search-case-sensitive');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.handleSearchInput(e.target.value));
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) {
            this.navigateToPrevResult();
          } else {
            this.navigateToNextResult();
          }
        } else if (e.key === 'Escape') {
          this.closeSearch();
        }
      });
    }

    if (btnCloseSearch) {
      btnCloseSearch.addEventListener('click', () => this.closeSearch());
    }

    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => this.clearSearch());
    }

    if (btnSearchNext) {
      btnSearchNext.addEventListener('click', () => this.navigateToNextResult());
    }

    if (btnSearchPrev) {
      btnSearchPrev.addEventListener('click', () => this.navigateToPrevResult());
    }

    if (caseSensitiveCheckbox) {
      caseSensitiveCheckbox.addEventListener('change', (e) => {
        this.caseSensitive = e.target.checked;
        if (this.searchTerm) {
          this.performSearch(this.searchTerm);
        }
      });
    }
  }

  openSearch() {
    const panel = document.getElementById('search-panel');
    const searchInput = document.getElementById('search-input');

    if (panel && searchInput) {
      panel.style.display = 'block';
      this.isSearchOpen = true;
      searchInput.focus();
      searchInput.select();
    }
  }

  closeSearch() {
    const panel = document.getElementById('search-panel');

    if (panel) {
      panel.style.display = 'none';
      this.isSearchOpen = false;
      this.clearHighlights();
      this.currentResults = [];
      this.currentResultIndex = -1;
    }
  }

  clearSearch() {
    const searchInput = document.getElementById('search-input');
    const btnClearSearch = document.getElementById('btn-clear-search');

    if (searchInput) {
      searchInput.value = '';
      this.searchTerm = '';
      this.clearHighlights();
      this.currentResults = [];
      this.currentResultIndex = -1;
      this.updateResultCount();

      if (btnClearSearch) {
        btnClearSearch.style.display = 'none';
      }

      searchInput.focus();
    }
  }

  handleSearchInput(value) {
    const btnClearSearch = document.getElementById('btn-clear-search');

    if (btnClearSearch) {
      btnClearSearch.style.display = value ? 'flex' : 'none';
    }

    this.searchTerm = value;

    if (value.length >= 2) {
      this.performSearch(value);
    } else {
      this.clearHighlights();
      this.currentResults = [];
      this.currentResultIndex = -1;
      this.updateResultCount();
    }
  }

  performSearch(term) {
    this.clearHighlights();
    this.currentResults = [];
    this.currentResultIndex = -1;

    const editorContainer = document.getElementById(this.editorContainerId);
    if (!editorContainer) return;

    // Get all text blocks
    const textBlocks = editorContainer.querySelectorAll('.block-content[contenteditable="true"], .realisation-body');

    const regex = new RegExp(
      term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), // Escape special regex chars
      this.caseSensitive ? 'g' : 'gi'
    );

    textBlocks.forEach((block, blockIndex) => {
      const text = block.textContent;
      const matches = [...text.matchAll(regex)];

      matches.forEach((match) => {
        this.currentResults.push({
          block: block,
          blockIndex: blockIndex,
          matchIndex: match.index,
          matchText: match[0]
        });
      });
    });

    // Highlight all results
    this.highlightResults();
    this.updateResultCount();

    // Navigate to first result
    if (this.currentResults.length > 0) {
      this.currentResultIndex = 0;
      this.scrollToResult(0);
    }
  }

  highlightResults() {
    this.currentResults.forEach((result, index) => {
      const block = result.block;
      const originalHTML = block.innerHTML;

      // Create regex for this specific match
      const regex = new RegExp(
        result.matchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        this.caseSensitive ? 'g' : 'gi'
      );

      // Replace with highlighted version
      const highlightedHTML = originalHTML.replace(regex, (match) => {
        return `<mark class="search-highlight" data-search-index="${index}">${match}</mark>`;
      });

      block.innerHTML = highlightedHTML;
    });
  }

  clearHighlights() {
    const highlights = document.querySelectorAll('.search-highlight');
    highlights.forEach(mark => {
      const text = mark.textContent;
      mark.replaceWith(text);
    });

    // Remove active class
    const activeHighlights = document.querySelectorAll('.search-highlight-active');
    activeHighlights.forEach(el => el.classList.remove('search-highlight-active'));
  }

  updateResultCount() {
    const resultCount = document.getElementById('search-result-count');
    const btnNext = document.getElementById('btn-search-next');
    const btnPrev = document.getElementById('btn-search-prev');

    if (resultCount) {
      if (this.currentResults.length === 0) {
        resultCount.textContent = this.searchTerm.length >= 2 ? 'No results' : '';
      } else {
        resultCount.textContent = `${this.currentResultIndex + 1} of ${this.currentResults.length}`;
      }
    }

    const hasResults = this.currentResults.length > 0;
    if (btnNext) btnNext.disabled = !hasResults;
    if (btnPrev) btnPrev.disabled = !hasResults;
  }

  navigateToNextResult() {
    if (this.currentResults.length === 0) return;

    this.currentResultIndex = (this.currentResultIndex + 1) % this.currentResults.length;
    this.scrollToResult(this.currentResultIndex);
    this.updateResultCount();
  }

  navigateToPrevResult() {
    if (this.currentResults.length === 0) return;

    this.currentResultIndex = this.currentResultIndex - 1;
    if (this.currentResultIndex < 0) {
      this.currentResultIndex = this.currentResults.length - 1;
    }
    this.scrollToResult(this.currentResultIndex);
    this.updateResultCount();
  }

  scrollToResult(index) {
    // Remove previous active highlight
    const prevActive = document.querySelector('.search-highlight-active');
    if (prevActive) {
      prevActive.classList.remove('search-highlight-active');
    }

    // Find and highlight current result
    const highlight = document.querySelector(`[data-search-index="${index}"]`);
    if (highlight) {
      highlight.classList.add('search-highlight-active');

      // Scroll into view with smooth behavior
      highlight.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }

  toggleSearch() {
    if (this.isSearchOpen) {
      this.closeSearch();
    } else {
      this.openSearch();
    }
  }
}

// Export for use in app.js
window.ShaktSearchNotes = ShaktSearchNotes;
