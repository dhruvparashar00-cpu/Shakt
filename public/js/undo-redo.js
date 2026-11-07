// undo-redo.js - Shakt History Management for Note Editor
// Track changes and enable undo/redo functionality

class ShaktHistoryManager {
  constructor(maxHistory = 50) {
    this.maxHistory = maxHistory;
    this.history = [];
    this.currentIndex = -1;
    this.isUndoRedoAction = false;
  }

  pushState(state, description = 'edit') {
    // Don't record if we're in the middle of undo/redo
    if (this.isUndoRedoAction) return;

    // Remove any states after current index (if we undid and then made a change)
    this.history = this.history.slice(0, this.currentIndex + 1);

    // Add new state
    this.history.push({
      state: JSON.parse(JSON.stringify(state)), // Deep clone
      description: description,
      timestamp: Date.now()
    });

    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }

    // Update UI buttons
    this.updateButtons();
  }

  undo() {
    if (!this.canUndo()) return null;

    this.currentIndex--;
    this.isUndoRedoAction = true;

    const state = this.history[this.currentIndex];
    this.updateButtons();

    return state ? state.state : null;
  }

  redo() {
    if (!this.canRedo()) return null;

    this.currentIndex++;
    this.isUndoRedoAction = true;

    const state = this.history[this.currentIndex];
    this.updateButtons();

    return state ? state.state : null;
  }

  canUndo() {
    return this.currentIndex > 0;
  }

  canRedo() {
    return this.currentIndex < this.history.length - 1;
  }

  clear() {
    this.history = [];
    this.currentIndex = -1;
    this.updateButtons();
  }

  updateButtons() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');

    if (btnUndo) {
      btnUndo.disabled = !this.canUndo();
      btnUndo.title = this.canUndo()
        ? `Undo: ${this.history[this.currentIndex - 1]?.description || 'previous action'}`
        : 'Nothing to undo';
    }

    if (btnRedo) {
      btnRedo.disabled = !this.canRedo();
      btnRedo.title = this.canRedo()
        ? `Redo: ${this.history[this.currentIndex + 1]?.description || 'next action'}`
        : 'Nothing to redo';
    }
  }

  finishUndoRedo() {
    // Call this after applying undo/redo state
    this.isUndoRedoAction = false;
  }

  getCurrentState() {
    return this.history[this.currentIndex]?.state || null;
  }
}

// Export for use in app.js
window.ShaktHistoryManager = ShaktHistoryManager;
