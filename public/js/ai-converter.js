// ai-converter.js - Shakt Multilingual & STEM Note Digitization Engine
// Transcribes English, Hinglish, Hindi, Physics, Chemistry, and Maths with Greek letters and diagrams

class ShaktAiConverter {
  constructor(apiEndpoint = '/api/claude') {
    this.apiEndpoint = apiEndpoint;
  }

  async convertPage(imageBase64, pdfViewerInstance, pageNum = null) {
    if (!imageBase64) {
      throw new Error('No page image available to convert.');
    }

    // Clean base64 data header if present
    const cleanBase64 = imageBase64.replace(/^data:image\/(jpeg|png|webp);base64,/, '');

    const systemPrompt = `You are Shakt's specialized academic OCR and note digitization engine.
You convert handwritten and printed notes into structured digital text with copy-pasted diagrams.
The notes may include:
- English, Hinglish (Hindi written in Roman/English alphabet), and Hindi (Devanagari script)
- STEM content: Physics, Chemistry, and Mathematics
- Greek letters: alpha (α/\\alpha), beta (β/\\beta), gamma (γ/\\gamma), delta (Δ/\\Delta, δ/\\delta), theta (θ/\\theta), lambda (λ/\\lambda), mu (μ/\\mu), pi (π/\\pi), sigma (σ/\\sigma), omega (ω/\\omega, Ω/\\Omega), phi (φ/\\phi), rho (ρ/\\rho), etc.
- Mathematical equations, calculus, vectors, matrices, fractions
- Chemical reactions, formulas, states, and equilibrium arrows

CRITICAL INSTRUCTIONS:
1. Faithfully extract and transcribe all text. Keep the exact language and phrasing. Do not translate Hinglish to English or Hindi.
2. For ANY formula, mathematical equation, physical law, or chemical equation:
   - Use standard LaTeX notation (e.g. "f_{max} = \\mu_s N = \\mu_s mg \\cos\\theta", "\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}", "\\vec{F} = m\\vec{a}", "2\\text{H}_2 + \\text{O}_2 \\rightarrow 2\\text{H}_2\\text{O}").
   - Transcribe all Greek symbols as LaTeX commands (\\alpha, \\beta, \\theta, \\mu, \\lambda, etc.).
   - Wrap inline formulas with '$...$' inside paragraphs.
   - For standalone formulas, use block type "formula".
3. Structure content into logical blocks:
   - "heading": main topic or title
   - "subheading": section headers
   - "paragraph": descriptive text and explanations (with inline '$...$' LaTeX if applicable)
   - "formula": standalone mathematical, physics, or chemical equation in standard LaTeX
   - "diagram": any drawing, graph, circuit, free body diagram, apparatus, geometry, ray diagram, chemical structure
   - "realisation": key golden takeaway or exam trick
4. For EACH diagram on the page:
   - Provide the EXACT normalized bounding box [ymin, xmin, ymax, xmax] where values range from 0 to 1000.
   - Provide a concise title and detailed caption explaining what the diagram depicts.
5. Return ONLY a valid JSON object (no markdown code blocks, no extraneous text) with this format:
{
  "title": "Page Title or Topic",
  "blocks": [
    { "type": "heading", "text": "..." },
    { "type": "paragraph", "text": "..." },
    { "type": "formula", "text": "\\text{LaTeX formula}" },
    { "type": "diagram", "title": "Diagram Title", "caption": "Detailed explanation", "box": [ymin, xmin, ymax, xmax] },
    { "type": "realisation", "text": "Key conceptual insight" }
  ]
}`;

    const userMessage = {
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: cleanBase64
          }
        },
        {
          type: 'text',
          text: 'Please digitize this note page into structured text blocks with accurate LaTeX for all math, physics, chemistry, Greek letters, and provide normalized bounding boxes [ymin, xmin, ymax, xmax] for all diagrams.'
        }
      ]
    };

    const apiKey = await window.shaktDB.getSetting('apiKey');
    let selectedModel = (await window.shaktDB.getSetting('model')) || 'omni-route';

    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: apiKey,
        model: selectedModel,
        system: systemPrompt,
        max_tokens: 4000,
        messages: [userMessage]
      })
    });

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
      throw new Error(`AI Conversion Failed: ${parsedErr}`);
    }

    const data = await response.json();

    // Track Token Usage for Page Conversion
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

    let rawText = '';
    if (data.content && data.content[0] && data.content[0].text) {
      rawText = data.content[0].text;
    } else {
      throw new Error('Unexpected response format from AI API');
    }

    // Parse JSON from response
    let parsedResult;
    try {
      // Strip any possible markdown code fencing
      const jsonStr = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      parsedResult = JSON.parse(jsonStr);
    } catch (e) {
      console.warn('Could not parse strict JSON, attempting relaxed extraction:', e);
      parsedResult = this.fallbackParse(rawText);
    }

    // Process blocks and crop diagrams using pdfViewerInstance
    const finalBlocks = [];
    const blocks = parsedResult.blocks || [];

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const blockId = 'b_' + Date.now() + '_' + i;

      if (b.type === 'diagram') {
        let diagramDataUrl = null;
        if (b.box && Array.isArray(b.box) && b.box.length === 4 && pdfViewerInstance) {
          const normBox = {
            ymin: b.box[0],
            xmin: b.box[1],
            ymax: b.box[2],
            xmax: b.box[3]
          };
          diagramDataUrl = pdfViewerInstance.cropRegion(normBox);
        }

        finalBlocks.push({
          id: blockId,
          type: 'diagram',
          title: b.title || 'Extracted Diagram',
          caption: b.caption || '',
          imageUrl: diagramDataUrl || '',
          diagramBox: b.box || null,
          spacingBottom: 24
        });
      } else if (b.type === 'formula') {
        finalBlocks.push({
          id: blockId,
          type: 'formula',
          text: b.text || '',
          fontSize: 'lg',
          spacingBottom: 20
        });
      } else if (b.type === 'realisation') {
        finalBlocks.push({
          id: blockId,
          type: 'realisation',
          text: b.text || '',
          fontSize: 'md',
          spacingBottom: 20
        });
      } else {
        finalBlocks.push({
          id: blockId,
          type: b.type || 'paragraph',
          text: b.text || '',
          fontSize: b.type === 'heading' ? 'xl' : (b.type === 'subheading' ? 'lg' : 'md'),
          spacingBottom: b.type === 'heading' ? 16 : 14
        });
      }
    }

    return {
      title: parsedResult.title || 'Digitized Note',
      blocks: finalBlocks
    };
  }

  async convertWholeDocument(pdfViewerInstance, onProgress = null) {
    if (!pdfViewerInstance || !pdfViewerInstance.pdfDoc) {
      throw new Error('No PDF document loaded in viewer.');
    }

    const totalPages = pdfViewerInstance.totalPages;
    const aggregatedBlocks = [];

    for (let p = 1; p <= totalPages; p++) {
      if (onProgress) {
        onProgress({
          currentPage: p,
          totalPages: totalPages,
          percent: Math.round(((p - 1) / totalPages) * 100),
          message: `Digitizing page ${p} of ${totalPages}...`
        });
      }

      // Render page on canvas to capture image
      await pdfViewerInstance.renderPage(p);
      const imageBase64 = pdfViewerInstance.getPageImageBase64(0.92);

      if (!imageBase64) continue;

      const result = await this.convertPage(imageBase64, pdfViewerInstance, p);

      // Save individual page note
      if (pdfViewerInstance.currentPdfId && window.shaktDB) {
        await window.shaktDB.savePageNote(pdfViewerInstance.currentPdfId, p, result.blocks);
      }

      // Add page section divider block
      aggregatedBlocks.push({
        id: 'p_div_' + p,
        type: 'heading',
        text: `📄 Page ${p}: ${result.title || 'Notes'}`,
        fontSize: 'xl',
        spacingBottom: 16
      });

      aggregatedBlocks.push(...result.blocks);

      // Brief delay to prevent rate limits
      if (p < totalPages) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    if (onProgress) {
      onProgress({
        currentPage: totalPages,
        totalPages: totalPages,
        percent: 100,
        message: 'Completed digitizing all pages!'
      });
    }

    return {
      title: 'Full Digitized Document',
      blocks: aggregatedBlocks
    };
  }

  fallbackParse(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) {}
    }
    return {
      title: 'Extracted Note',
      blocks: [
        { type: 'paragraph', text: text }
      ]
    };
  }
}

window.ShaktAiConverter = ShaktAiConverter;
