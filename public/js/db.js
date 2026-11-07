// db.js - Shakt IndexedDB Storage Layer
// Manages local-first persistence for PDFs, reading positions, converted blocks, realisations, and doubts

class ShaktDB {
  constructor() {
    this.dbName = 'ShaktDB';
    this.version = 1;
    this.db = null;
    this.ready = this.init();
  }

  init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Store for PDF files and their metadata
        if (!db.objectStoreNames.contains('pdfs')) {
          const pdfStore = db.createObjectStore('pdfs', { keyPath: 'id' });
          pdfStore.createIndex('lastOpenedAt', 'lastOpenedAt', { unique: false });
        }

        // Store for converted notes and custom blocks per page
        if (!db.objectStoreNames.contains('pages')) {
          const pageStore = db.createObjectStore('pages', { keyPath: 'id' });
          pageStore.createIndex('pdfId', 'pdfId', { unique: false });
          pageStore.createIndex('pdfPage', ['pdfId', 'pageNumber'], { unique: true });
        }

        // Store for AI doubt conversations and realisations
        if (!db.objectStoreNames.contains('doubts')) {
          const doubtStore = db.createObjectStore('doubts', { keyPath: 'id' });
          doubtStore.createIndex('pdfPage', ['pdfId', 'pageNumber'], { unique: false });
          doubtStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Store for App Settings
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => {
        console.error('IndexedDB error:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  async _tx(storeName, mode, callback) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req = callback(store);

      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- PDF Management ---
  async savePdf(pdfData) {
    const record = {
      id: pdfData.id || 'pdf_' + Date.now(),
      name: pdfData.name || 'Untitled Note.pdf',
      size: pdfData.size || 0,
      blob: pdfData.blob,
      totalPages: pdfData.totalPages || 1,
      lastOpenedPage: pdfData.lastOpenedPage || 1,
      scrollOffset: pdfData.scrollOffset || 0,
      zoom: pdfData.zoom || 1.0,
      createdAt: pdfData.createdAt || Date.now(),
      lastOpenedAt: Date.now()
    };
    await this._tx('pdfs', 'readwrite', (store) => store.put(record));
    await this.setSetting('activePdfId', record.id);
    return record;
  }

  async getPdf(id) {
    return this._tx('pdfs', 'readonly', (store) => store.get(id));
  }

  async getAllPdfs() {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('pdfs', 'readonly');
      const store = tx.objectStore('pdfs');
      const req = store.getAll();
      req.onsuccess = () => {
        const sorted = (req.result || []).sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));
        resolve(sorted);
      };
      req.onerror = () => reject(tx.error);
    });
  }

  async updateReadingProgress(pdfId, pageNumber, scrollOffset = 0, zoom = 1.0) {
    const pdf = await this.getPdf(pdfId);
    if (!pdf) return;
    pdf.lastOpenedPage = pageNumber;
    pdf.scrollOffset = scrollOffset;
    pdf.zoom = zoom;
    pdf.lastOpenedAt = Date.now();
    return this._tx('pdfs', 'readwrite', (store) => store.put(pdf));
  }

  async deletePdf(id) {
    // Delete PDF
    await this._tx('pdfs', 'readwrite', (store) => store.delete(id));
    // Clear active PDF setting if matches
    const active = await this.getSetting('activePdfId');
    if (active === id) {
      await this.setSetting('activePdfId', null);
    }
  }

  // --- Page Notes & Blocks Management ---
  async getPageNote(pdfId, pageNumber) {
    const id = `${pdfId}_p${pageNumber}`;
    return this._tx('pages', 'readonly', (store) => store.get(id));
  }

  async savePageNote(pdfId, pageNumber, blocks) {
    const id = `${pdfId}_p${pageNumber}`;
    const record = {
      id,
      pdfId,
      pageNumber,
      blocks: blocks || [],
      updatedAt: Date.now()
    };
    return this._tx('pages', 'readwrite', (store) => store.put(record));
  }

  // --- Doubts & Realisations Management ---
  async addDoubtMessage(pdfId, pageNumber, role, content, isRealisation = false) {
    const record = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      pdfId,
      pageNumber,
      role,
      content,
      isRealisation,
      timestamp: Date.now()
    };
    await this._tx('doubts', 'readwrite', (store) => store.put(record));
    return record;
  }

  async getDoubtMessages(pdfId, pageNumber) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('doubts', 'readonly');
      const store = tx.objectStore('doubts');
      const req = store.getAll();
      req.onsuccess = () => {
        const msgs = (req.result || [])
          .filter(m => m.pdfId === pdfId && m.pageNumber === pageNumber)
          .sort((a, b) => a.timestamp - b.timestamp);
        resolve(msgs);
      };
      req.onerror = () => reject(tx.error);
    });
  }

  async getAllRealisationMessages(pdfId) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('doubts', 'readonly');
      const store = tx.objectStore('doubts');
      const req = store.getAll();
      req.onsuccess = () => {
        const msgs = (req.result || [])
          .filter(m => m.pdfId === pdfId && m.isRealisation)
          .sort((a, b) => a.timestamp - b.timestamp);
        resolve(msgs);
      };
      req.onerror = () => reject(tx.error);
    });
  }

  // --- App Settings ---
  async getSetting(key, defaultValue = null) {
    try {
      const item = await this._tx('settings', 'readonly', (store) => store.get(key));
      if (item && item.value !== undefined && item.value !== null && item.value !== '') {
        return item.value;
      }
      return defaultValue;
    } catch {
      return defaultValue;
    }
  }

  async setSetting(key, value) {
    return this._tx('settings', 'readwrite', (store) => store.put({ key, value }));
  }
}

// Global instance
window.shaktDB = new ShaktDB();
