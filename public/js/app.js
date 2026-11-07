// app.js - Shakt Master Application Controller
// Orchestrates PDF viewing, STEM AI conversion, KaTeX math, Rich Note Editing, Doubt Copilot & Auto-Edit

document.addEventListener('DOMContentLoaded', async () => {
  // --- Initialize Subsystems ---
  const pdfViewer = new window.ShaktPdfViewer('pdf-canvas-container');
  const aiConverter = new window.ShaktAiConverter('/api/claude');
  const noteEditor = new window.ShaktNoteEditor('note-editor-container');
  const aiDoubt = new window.ShaktAiDoubt('doubt-messages', 'doubt-input', 'btn-send-doubt', '/api/claude');
  const searchNotes = new window.ShaktSearchNotes('note-editor-container');
  const exportNotes = new window.ShaktExportNotes();
  const historyManager = new window.ShaktHistoryManager(50);
  const batchConverter = new window.ShaktBatchConverter(aiConverter, pdfViewer, window.shaktDB);

  // --- State ---
  let currentPdf = null;
  let currentTheme = 'dark';
  let currentViewMode = 'notes'; // 'notes', 'split', 'pdf'
  let isAiSidebarOpen = true;
  let activeMobileTab = 'notes';

  // --- DOM Elements ---
  const elAppContainer = document.getElementById('app-container');
  const elBtnUpload = document.getElementById('btn-upload-pdf');
  const elFileInput = document.getElementById('pdf-file-input');
  const elBtnSample = document.getElementById('btn-load-sample');
  const elBtnConvert = document.getElementById('btn-convert-page');
  const elBtnConvertTop = document.getElementById('btn-convert-page-top');
  const elBtnBatchConvertPdf = document.getElementById('btn-batch-convert-pdf');
  const elBtnPrevPage = document.getElementById('btn-prev-page');
  const elBtnNextPage = document.getElementById('btn-next-page');
  const elPageIndicator = document.getElementById('page-indicator');
  const elJumpPageInput = document.getElementById('jump-page-input');
  const elDocPageBadge = document.getElementById('doc-page-badge');

  // Mode Switcher (Read vs Edit)
  const elBtnModeRead = document.getElementById('btn-mode-read');
  const elBtnModeEdit = document.getElementById('btn-mode-edit');
  const elEditActionBar = document.getElementById('edit-mode-action-bar');
  const elBtnAddText = document.getElementById('btn-add-text-block');
  const elBtnAddFormula = document.getElementById('btn-add-formula-block');
  const elBtnUploadDiagram = document.getElementById('btn-upload-outer-diagram');
  const elBtnAddRealisation = document.getElementById('btn-add-realisation-block');

  // View Switcher (PDF / Split / Transformed Notes)
  const elBtnViewPdf = document.getElementById('btn-view-pdf');
  const elBtnViewSplit = document.getElementById('btn-view-split');
  const elBtnViewNotes = document.getElementById('btn-view-notes');

  // AI Sidebar
  const elBtnToggleAi = document.getElementById('btn-toggle-ai-sidebar');
  const elBtnCloseAi = document.getElementById('btn-close-ai-sidebar');
  const elPaneDoubts = document.getElementById('pane-doubts');
  const elBtnUndoAi = document.getElementById('btn-undo-ai-action');

  // Navigation & Tools
  const elBtnThemeToggle = document.getElementById('btn-theme-toggle');
  const elBtnSettings = document.getElementById('btn-settings');
  const elSettingsModal = document.getElementById('settings-modal');
  const elCloseSettings = document.getElementById('btn-close-settings');
  const elInputApiKey = document.getElementById('input-api-key');
  const elSelectModel = document.getElementById('select-model');
  const elBtnSaveSettings = document.getElementById('btn-save-settings');
  const elConversionModal = document.getElementById('conversion-modal');
  const elConversionStatus = document.getElementById('conversion-status');
  const elConversionProgressFill = document.getElementById('conversion-progress-fill');
  const elPdfSelectDropdown = document.getElementById('pdf-select-dropdown');
  const elResumeBanner = document.getElementById('resume-reading-banner');
  const elResumeBannerText = document.getElementById('resume-banner-text');
  const elBtnDismissResume = document.getElementById('btn-dismiss-resume');

  const elBtnUndo = document.getElementById('btn-undo');
  const elBtnRedo = document.getElementById('btn-redo');
  const elBtnSearch = document.getElementById('btn-search-notes');
  const elBtnExport = document.getElementById('btn-export-notes');

  // Diagram Lightbox
  const elLightboxModal = document.getElementById('diagram-lightbox-modal');
  const elLightboxImg = document.getElementById('lightbox-img');
  const elLightboxTitle = document.getElementById('lightbox-title');
  const elLightboxCaption = document.getElementById('lightbox-caption');
  const elBtnCloseLightbox = document.getElementById('btn-close-lightbox');

  // --- Theme Management ---
  const savedTheme = await window.shaktDB.getSetting('theme', 'dark');
  setTheme(savedTheme);

  elBtnThemeToggle.addEventListener('click', () => {
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  });

  function setTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    elBtnThemeToggle.innerHTML = theme === 'dark' ? '☀️' : '🌙';
    window.shaktDB.setSetting('theme', theme);
  }

  // --- View Mode Management (PDF / Split / Notes) ---
  function setViewMode(mode) {
    currentViewMode = mode;
    elAppContainer.classList.remove('view-pdf', 'view-split', 'view-notes');
    elAppContainer.classList.add(`view-${mode}`);

    elBtnViewPdf.classList.toggle('active', mode === 'pdf');
    elBtnViewSplit.classList.toggle('active', mode === 'split');
    elBtnViewNotes.classList.toggle('active', mode === 'notes');
  }

  elBtnViewPdf.addEventListener('click', () => setViewMode('pdf'));
  elBtnViewSplit.addEventListener('click', () => setViewMode('split'));
  elBtnViewNotes.addEventListener('click', () => setViewMode('notes'));

  // --- AI Copilot Sidebar Toggle ---
  function setAiSidebarState(isOpen) {
    isAiSidebarOpen = isOpen;
    if (isOpen) {
      elPaneDoubts.classList.remove('ai-sidebar-collapsed');
      elBtnToggleAi.classList.add('active');
    } else {
      elPaneDoubts.classList.add('ai-sidebar-collapsed');
      elBtnToggleAi.classList.remove('active');
    }
  }

  elBtnToggleAi.addEventListener('click', () => {
    setAiSidebarState(!isAiSidebarOpen);
  });

  elBtnCloseAi.addEventListener('click', () => {
    setAiSidebarState(false);
  });

  // --- Read Mode vs Edit Mode Management ---
  function setDocMode(isEdit) {
    noteEditor.setEditMode(isEdit);
    elBtnModeRead.classList.toggle('active', !isEdit);
    elBtnModeEdit.classList.toggle('active', isEdit);

    if (isEdit) {
      elEditActionBar.style.display = 'flex';
      showToast('✏️ Edit Mode Active: You and AI can modify notes & formulas', 'info');
    } else {
      elEditActionBar.style.display = 'none';
      showToast('📖 Read Mode: Clean study view with KaTeX math rendering', 'info');
    }
  }

  elBtnModeRead.addEventListener('click', () => setDocMode(false));
  elBtnModeEdit.addEventListener('click', () => setDocMode(true));

  // Edit Action Bar Buttons
  elBtnAddText.addEventListener('click', () => {
    noteEditor.insertBlock(-1, 'paragraph');
  });

  elBtnAddFormula.addEventListener('click', () => {
    noteEditor.insertBlock(-1, 'formula', '\\vec{F} = m \\vec{a}');
  });

  elBtnUploadDiagram.addEventListener('click', () => {
    noteEditor.triggerOuterDiagramUpload(-1);
  });

  elBtnAddRealisation.addEventListener('click', () => {
    noteEditor.addRealisation('Key conceptual takeaway or formula trick...');
  });

  // --- AI Automatic Edit Permission Callback ---
  aiDoubt.onExecuteAiActionCallback = (actionObj) => {
    // Record current state for undo
    historyManager.pushState(noteEditor.blocks, 'ai-edit');
    elBtnUndo.disabled = false;

    const modified = noteEditor.applyAiEditAction(actionObj);
    if (modified) {
      showToast(`⚡ AI updated your note: ${actionObj.action}`, 'success');
      // If was in split/pdf view, ensure notes view is visible
      if (currentViewMode === 'pdf') {
        setViewMode('split');
      }
    }
  };

  if (elBtnUndoAi) {
    elBtnUndoAi.addEventListener('click', () => {
      elBtnUndo.click();
      document.getElementById('ai-edit-notification-banner').style.display = 'none';
      showToast('Reverted AI edit', 'info');
    });
  }

  // --- Diagram Lightbox Zoom Modal ---
  noteEditor.onZoomDiagram = (imageUrl, title, caption) => {
    if (!imageUrl) return;
    elLightboxImg.src = imageUrl;
    elLightboxTitle.textContent = title || 'Diagram Zoom';
    elLightboxCaption.textContent = caption || '';
    elLightboxModal.style.display = 'flex';
  };

  elBtnCloseLightbox.addEventListener('click', () => {
    elLightboxModal.style.display = 'none';
  });

  elLightboxModal.addEventListener('click', (e) => {
    if (e.target === elLightboxModal) {
      elLightboxModal.style.display = 'none';
    }
  });

  // --- Keyboard Shortcuts ---
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K: Toggle AI Copilot sidebar
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      setAiSidebarState(!isAiSidebarOpen);
      if (isAiSidebarOpen) {
        document.getElementById('doubt-input')?.focus();
      }
    }

    // Ctrl/Cmd + E: Toggle Edit Mode
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      setDocMode(!noteEditor.isEditMode);
    }

    // Ctrl/Cmd + O: Open PDF
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      elBtnUpload.click();
    }

    // Ctrl/Cmd + Enter: Convert Page
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      elBtnConvert.click();
    }

    // Ctrl/Cmd + Z / Y: Undo / Redo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      elBtnUndo.click();
    } else if (((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) || ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
      e.preventDefault();
      elBtnRedo.click();
    }

    // Ctrl/Cmd + F: Search Notes
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchNotes.toggleSearch();
    }

    // Arrow navigation
    if (!['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      if (e.key === 'ArrowLeft' && !elBtnPrevPage.disabled) {
        e.preventDefault();
        pdfViewer.prevPage();
      } else if (e.key === 'ArrowRight' && !elBtnNextPage.disabled) {
        e.preventDefault();
        pdfViewer.nextPage();
      }
    }

    // Escape
    if (e.key === 'Escape') {
      if (elSettingsModal.style.display === 'flex') elSettingsModal.style.display = 'none';
      if (elLightboxModal.style.display === 'flex') elLightboxModal.style.display = 'none';
    }
  });

  // --- Undo / Redo Event Handlers ---
  elBtnUndo.addEventListener('click', () => {
    const state = historyManager.undo();
    if (state) {
      noteEditor.loadBlocks(state, currentPdf?.id, pdfViewer.currentPageNum);
      historyManager.finishUndoRedo();
      updateUndoRedoButtons();
    }
  });

  elBtnRedo.addEventListener('click', () => {
    const state = historyManager.redo();
    if (state) {
      noteEditor.loadBlocks(state, currentPdf?.id, pdfViewer.currentPageNum);
      historyManager.finishUndoRedo();
      updateUndoRedoButtons();
    }
  });

  function updateUndoRedoButtons() {
    elBtnUndo.disabled = !historyManager.canUndo();
    elBtnRedo.disabled = !historyManager.canRedo();
  }

  // --- Connect Search & Export ---
  elBtnSearch.addEventListener('click', () => searchNotes.toggleSearch());
  elBtnExport.addEventListener('click', () => exportNotes.showExportModal());

  // --- Subsystem Wiring ---
  noteEditor.onSave = async (blocks, pdfId, pageNumber) => {
    await window.shaktDB.savePageNote(pdfId, pageNumber, blocks);
    historyManager.pushState(blocks, 'save');
    updateUndoRedoButtons();
  };

  noteEditor.onContextChange = (pdfId, pageNumber) => {
    exportNotes.setContext(pdfId, pageNumber);
  };

  noteEditor.onAskDoubtAboutBlock = (diagramBlock) => {
    aiDoubt.setDiagramContext(diagramBlock);
    setAiSidebarState(true);
    document.getElementById('doubt-input').focus();
  };

  aiDoubt.onAddRealisationCallback = (realisationText) => {
    noteEditor.addRealisation(realisationText);
    showToast('💡 Realisation saved to your note!');
  };

  aiDoubt.getNoteContextCallback = () => {
    if (!noteEditor.blocks || noteEditor.blocks.length === 0) return 'No notes written yet.';
    return noteEditor.blocks.map(b => {
      if (b.type === 'diagram' || b.type === 'outer_diagram') {
        return `[Diagram: ${b.title || 'Untitled'}] - Caption: ${b.caption || 'None'}`;
      } else if (b.type === 'formula') {
        return `[Formula (LaTeX)]: $$${b.text}$$`;
      }
      return `[${b.type}]: ${b.text}`;
    }).join('\n');
  };

  // --- PDF Page Changed ---
  pdfViewer.onPageChanged = async (pageNum, totalPages) => {
    elPageIndicator.textContent = `Page ${pageNum} of ${totalPages}`;
    elDocPageBadge.textContent = `Page ${pageNum} of ${totalPages}`;
    elJumpPageInput.value = pageNum;
    elJumpPageInput.max = totalPages;

    elBtnPrevPage.disabled = pageNum <= 1;
    elBtnNextPage.disabled = pageNum >= totalPages;

    if (currentPdf) {
      await loadPageNotes(currentPdf.id, pageNum);
      await aiDoubt.loadChat(currentPdf.id, pageNum);
    }
  };

  async function loadPageNotes(pdfId, pageNum) {
    const saved = await window.shaktDB.getPageNote(pdfId, pageNum);
    if (saved && saved.blocks && saved.blocks.length > 0) {
      noteEditor.loadBlocks(saved.blocks, pdfId, pageNum);
      historyManager.pushState(saved.blocks, 'load');
    } else {
      noteEditor.loadBlocks([], pdfId, pageNum);
      historyManager.clear();
    }
    updateUndoRedoButtons();

    if (noteEditor.onContextChange) {
      noteEditor.onContextChange(pdfId, pageNum);
    }
  }

  // --- Open PDF ---
  async function openPdf(pdfRecord) {
    currentPdf = pdfRecord;
    await window.shaktDB.setSetting('activePdfId', pdfRecord.id);

    document.getElementById('current-doc-title').textContent = pdfRecord.name;

    if (pdfRecord.id === 'sample_physics_note') {
      openSamplePhysicsNote();
      return;
    }

    try {
      const savedPage = pdfRecord.lastOpenedPage || 1;
      await pdfViewer.loadPdfFromBlob(pdfRecord.blob, pdfRecord.id, savedPage);

      if (savedPage > 1) {
        elResumeBannerText.textContent = `Resumed from Page ${savedPage} (where you left off).`;
        elResumeBanner.style.display = 'flex';
        setTimeout(() => { elResumeBanner.style.display = 'none'; }, 6000);
      }
    } catch (err) {
      console.error('Failed to load PDF in viewer:', err);
      showToast('Could not open PDF: ' + err.message, 'error');
    }

    await refreshPdfDropdown();
  }

  function openSamplePhysicsNote() {
    currentPdf = {
      id: window.SHAKT_SAMPLE_NOTE.id,
      name: window.SHAKT_SAMPLE_NOTE.name,
      totalPages: window.SHAKT_SAMPLE_NOTE.totalPages,
      lastOpenedPage: window.SHAKT_SAMPLE_NOTE.lastOpenedPage
    };

    document.getElementById('current-doc-title').textContent = currentPdf.name;
    elPageIndicator.textContent = `Page 1 of ${currentPdf.totalPages}`;
    elDocPageBadge.textContent = `Page 1 of ${currentPdf.totalPages}`;

    noteEditor.loadBlocks(window.SHAKT_SAMPLE_NOTE.blocks, currentPdf.id, 1);
    aiDoubt.loadChat(currentPdf.id, 1);
    renderSampleCanvas();

    showToast('Loaded Sample Physics & Friction Notes (KaTeX + Diagrams)');
  }

  function renderSampleCanvas() {
    const container = document.getElementById('pdf-canvas-container');
    container.innerHTML = `
      <div class="sample-pdf-preview">
        <div class="sample-notice">
          <h4>📄 Sample Note Page: Friction & Inclined Plane</h4>
          <p>Full support for Physics, Chemistry, Maths, Greek symbols ($\\alpha, \\beta, \\theta, \\mu$), and diagrams.</p>
        </div>
        <div class="sample-diagram-view">
          ${window.SHAKT_SAMPLE_NOTE.blocks[3].imageUrl ? `<img src="${window.SHAKT_SAMPLE_NOTE.blocks[3].imageUrl}" style="max-width: 100%; border-radius: 8px;" />` : ''}
        </div>
      </div>
    `;
  }

  // --- Upload PDF Handler ---
  elBtnUpload.addEventListener('click', () => elFileInput.click());

  elFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      showToast('Please select a valid PDF file.', 'error');
      return;
    }

    showToast(`Opening "${file.name}"...`);

    const record = await window.shaktDB.savePdf({
      name: file.name,
      size: file.size,
      blob: file,
      lastOpenedPage: 1
    });

    await openPdf(record);
    elFileInput.value = '';
    // Switch to Split View when opening a new PDF
    setViewMode('split');
  });

  elBtnSample.addEventListener('click', () => {
    openSamplePhysicsNote();
    setViewMode('notes');
  });

  // Page Navigation Handlers
  elBtnPrevPage.addEventListener('click', () => pdfViewer.prevPage());
  elBtnNextPage.addEventListener('click', () => pdfViewer.nextPage());

  elJumpPageInput.addEventListener('change', (e) => {
    pdfViewer.goToPage(e.target.value);
  });

  elBtnDismissResume.addEventListener('click', () => {
    elResumeBanner.style.display = 'none';
  });

  // --- CONVERT CURRENT PAGE (STEM + Greek Letters + Diagrams) ---
  async function handleConvertCurrentPage() {
    if (!currentPdf) {
      showToast('Please open or upload a PDF first.', 'error');
      return;
    }

    const imageBase64 = pdfViewer.getPageImageBase64(0.92);
    if (!imageBase64) {
      if (currentPdf.id === 'sample_physics_note') {
        showToast('Sample note is already digitized! Upload your own PDF to test live AI conversion.', 'info');
        return;
      }
      showToast('Please wait for the PDF page to render first.', 'error');
      return;
    }

    elConversionModal.style.display = 'flex';
    elConversionStatus.textContent = '1/3: Reading note page with AI Vision (Physics, Chemistry, Maths, Greek)...';
    if (elConversionProgressFill) elConversionProgressFill.style.width = '35%';

    try {
      setTimeout(() => {
        elConversionStatus.textContent = '2/3: Transcribing LaTeX formulas, Greek symbols, and diagram bounding boxes...';
        if (elConversionProgressFill) elConversionProgressFill.style.width = '70%';
      }, 1500);

      const result = await aiConverter.convertPage(imageBase64, pdfViewer, pdfViewer.currentPageNum);

      elConversionStatus.textContent = '3/3: Auto-cropping diagrams & formatting KaTeX blocks...';
      if (elConversionProgressFill) elConversionProgressFill.style.width = '100%';

      // Save to IndexedDB
      await window.shaktDB.savePageNote(currentPdf.id, pdfViewer.currentPageNum, result.blocks);

      // Load into note editor
      noteEditor.loadBlocks(result.blocks, currentPdf.id, pdfViewer.currentPageNum);
      historyManager.pushState(result.blocks, 'convert');
      updateUndoRedoButtons();

      setTimeout(() => {
        elConversionModal.style.display = 'none';
        showToast('⚡ Notes & Diagrams successfully digitized!');
        // Automatically switch to Transformed Notes View for optimal reading
        setViewMode('notes');
      }, 600);

    } catch (err) {
      console.error('Conversion error:', err);
      elConversionModal.style.display = 'none';
      showToast('Conversion failed: ' + (err.message || 'Unknown error'), 'error');
    }
  }

  elBtnConvert.addEventListener('click', handleConvertCurrentPage);
  if (elBtnConvertTop) elBtnConvertTop.addEventListener('click', handleConvertCurrentPage);

  // --- CONVERT WHOLE PDF (All Pages Batch) ---
  if (elBtnBatchConvertPdf) {
    elBtnBatchConvertPdf.addEventListener('click', async () => {
      if (!currentPdf || !pdfViewer.pdfDoc) {
        showToast('Please open or upload a PDF first.', 'error');
        return;
      }

      const total = pdfViewer.totalPages;
      const confirmed = confirm(`Convert entire PDF (${total} pages)? All text, formulas, and diagrams will be extracted.`);
      if (!confirmed) return;

      elConversionModal.style.display = 'flex';

      try {
        const fullResult = await aiConverter.convertWholeDocument(pdfViewer, (progress) => {
          elConversionStatus.textContent = progress.message;
          if (elConversionProgressFill) elConversionProgressFill.style.width = `${progress.percent}%`;
        });

        // Load complete digitized notebook
        noteEditor.loadBlocks(fullResult.blocks, currentPdf.id, 1);
        historyManager.pushState(fullResult.blocks, 'batch-convert');
        updateUndoRedoButtons();

        setTimeout(() => {
          elConversionModal.style.display = 'none';
          showToast(`⚡ All ${total} pages converted successfully!`);
          setViewMode('notes');
        }, 600);

      } catch (err) {
        console.error('Batch conversion error:', err);
        elConversionModal.style.display = 'none';
        showToast('Batch conversion failed: ' + err.message, 'error');
      }
    });
  }

  // --- Mobile Tab Switching ---
  const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
  mobileNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchMobileTab(btn.dataset.tab);
    });
  });

  function switchMobileTab(tab) {
    activeMobileTab = tab;
    mobileNavBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

    const panePdf = document.getElementById('pane-pdf');
    const paneNotes = document.getElementById('pane-notes');
    const paneDoubts = document.getElementById('pane-doubts');

    if (window.innerWidth <= 960) {
      panePdf.style.display = tab === 'pdf' ? 'flex' : 'none';
      paneNotes.style.display = tab === 'notes' ? 'flex' : 'none';
      paneDoubts.style.display = tab === 'doubts' ? 'flex' : 'none';
    } else {
      panePdf.style.display = '';
      paneNotes.style.display = '';
      paneDoubts.style.display = '';
    }
  }

  window.addEventListener('resize', () => {
    if (window.innerWidth > 960) {
      document.getElementById('pane-pdf').style.display = '';
      document.getElementById('pane-notes').style.display = '';
      document.getElementById('pane-doubts').style.display = '';
    } else {
      switchMobileTab(activeMobileTab);
    }
  });

  // --- Token Badge ---
  let totalSessionTokens = 0;
  let totalCachedTokens = 0;
  const elTokenBadge = document.getElementById('token-usage-badge');

  window.addEventListener('shakt:token-usage', (e) => {
    const detail = e.detail;
    totalSessionTokens += (detail.inputTokens || 0) + (detail.outputTokens || 0);
    totalCachedTokens += (detail.cacheReadTokens || 0);

    if (elTokenBadge) {
      const displayTotal = totalSessionTokens > 1000 ? (totalSessionTokens / 1000).toFixed(1) + 'k' : totalSessionTokens;
      elTokenBadge.textContent = `⚡ ${displayTotal} tokens`;
    }
  });

  // --- Settings Modal Handlers ---
  elBtnSettings.addEventListener('click', async () => {
    const savedKey = await window.shaktDB.getSetting('apiKey', '');
    const savedModel = await window.shaktDB.getSetting('model', 'omni-route');

    elInputApiKey.value = savedKey;
    elSelectModel.value = savedModel;

    elSettingsModal.style.display = 'flex';
  });

  elCloseSettings.addEventListener('click', () => {
    elSettingsModal.style.display = 'none';
  });

  elBtnSaveSettings.addEventListener('click', async () => {
    const key = elInputApiKey.value.trim();
    const model = elSelectModel.value;

    await window.shaktDB.setSetting('apiKey', key);
    await window.shaktDB.setSetting('model', model);

    elSettingsModal.style.display = 'none';
    showToast('Settings saved successfully!');
  });

  // --- PDF Dropdown ---
  async function refreshPdfDropdown() {
    const pdfs = await window.shaktDB.getAllPdfs();
    elPdfSelectDropdown.innerHTML = '<option value="">-- Switch Note PDF --</option>';

    const sampleOpt = document.createElement('option');
    sampleOpt.value = 'sample_physics_note';
    sampleOpt.textContent = '🌟 Sample: Physics & Friction (KaTeX + Diagrams)';
    if (currentPdf && currentPdf.id === 'sample_physics_note') sampleOpt.selected = true;
    elPdfSelectDropdown.appendChild(sampleOpt);

    pdfs.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `📄 ${p.name} (Page ${p.lastOpenedPage || 1}/${p.totalPages || 1})`;
      if (currentPdf && currentPdf.id === p.id) opt.selected = true;
      elPdfSelectDropdown.appendChild(opt);
    });
  }

  elPdfSelectDropdown.addEventListener('change', async (e) => {
    const selectedId = e.target.value;
    if (!selectedId) return;

    if (selectedId === 'sample_physics_note') {
      openSamplePhysicsNote();
      setViewMode('notes');
    } else {
      const record = await window.shaktDB.getPdf(selectedId);
      if (record) {
        await openPdf(record);
        setViewMode('split');
      }
    }
  });

  // --- Toast Notification Helper ---
  function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-fade-out');
      setTimeout(() => toast.remove(), 400);
    }, 3200);
  }

  // --- Check Server Configuration ---
  try {
    const cfgRes = await fetch('/api/config');
    if (cfgRes.ok) {
      const cfg = await cfgRes.json();
      if (cfg.hasServerApiKey) {
        const badge = document.createElement('span');
        badge.className = 'server-api-badge';
        badge.style.cssText = 'color: #10B981; font-size: 0.75rem; margin-left: 6px; font-weight: 600;';
        badge.textContent = '● AI Ready';
        badge.title = `AI service connected with model: ${cfg.defaultModel}`;
        document.querySelector('.brand-badge')?.after(badge);
      }
    }
  } catch (_) {}

  // --- Initial App Load ---
  await refreshPdfDropdown();

  const lastActivePdfId = await window.shaktDB.getSetting('activePdfId');
  if (lastActivePdfId) {
    if (lastActivePdfId === 'sample_physics_note') {
      openSamplePhysicsNote();
    } else {
      const lastPdf = await window.shaktDB.getPdf(lastActivePdfId);
      if (lastPdf) {
        await openPdf(lastPdf);
      } else {
        openSamplePhysicsNote();
      }
    }
  } else {
    // Default to sample note for instant welcoming experience
    openSamplePhysicsNote();
  }

  // Set default view to notes for clear document focus
  setViewMode('notes');
});
