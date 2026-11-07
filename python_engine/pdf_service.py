#!/usr/bin/env python3
"""
pdf_service.py - High-Performance Python PDF & Diagram Engine for Shakt
Powered by PyMuPDF (fitz) and Pillow.
Handles:
  - Ultra-crisp high-DPI page rendering (Greek, Math, Science symbols)
  - Intelligent diagram, drawing, and image region extraction
  - Normalized coordinate cropping [ymin, xmin, ymax, xmax] (0-1000)
  - Full PDF batch page processing
  - Text and structure extraction
"""

import sys
import os
import json
import base64
import io

try:
    import pymupdf as fitz
except ImportError:
    try:
        import fitz
    except ImportError:
        fitz = None

from PIL import Image

def get_engine_status():
    """Return status of Python engine and libraries."""
    return {
        "status": "ready" if fitz is not None else "missing_pymupdf",
        "python_version": sys.version,
        "pymupdf_available": fitz is not None,
        "pymupdf_version": getattr(fitz, "__version__", None) if fitz else None,
        "pillow_available": True
    }

def render_page_base64(pdf_path_or_bytes, page_num=1, dpi=200):
    """Render a single PDF page to base64 JPEG image."""
    if not fitz:
        raise RuntimeError("PyMuPDF (fitz) is not installed.")

    if isinstance(pdf_path_or_bytes, bytes):
        doc = fitz.open(stream=pdf_path_or_bytes, filetype="pdf")
    else:
        doc = fitz.open(pdf_path_or_bytes)

    if page_num < 1 or page_num > len(doc):
        raise ValueError(f"Page {page_num} out of bounds (1-{len(doc)})")

    page = doc[page_num - 1]
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)

    img_bytes = pix.tobytes("jpeg")
    b64 = base64.b64encode(img_bytes).decode("ascii")
    doc.close()

    return {
        "page": page_num,
        "width": pix.width,
        "height": pix.height,
        "dpi": dpi,
        "imageBase64": f"data:image/jpeg;base64,{b64}"
    }

def crop_diagram_base64(pdf_path_or_bytes, page_num=1, box_1000=None, dpi=250):
    """
    Crop a diagram given normalized coordinates [ymin, xmin, ymax, xmax] (0-1000).
    Renders directly from PDF vector/raster at high DPI for crystal-clear diagrams.
    """
    if not fitz:
        raise RuntimeError("PyMuPDF (fitz) is not installed.")

    if not box_1000 or len(box_1000) != 4:
        raise ValueError("Invalid bounding box. Expected [ymin, xmin, ymax, xmax] in 0-1000 scale.")

    if isinstance(pdf_path_or_bytes, bytes):
        doc = fitz.open(stream=pdf_path_or_bytes, filetype="pdf")
    else:
        doc = fitz.open(pdf_path_or_bytes)

    page = doc[page_num - 1]
    rect = page.rect
    pw, ph = rect.width, rect.height

    ymin, xmin, ymax, xmax = box_1000
    # Add slight 2% padding around the diagram to ensure no labels are cut off
    pad_y = (ymax - ymin) * 0.02
    pad_x = (xmax - xmin) * 0.02

    norm_ymin = max(0, (ymin - pad_y) / 1000.0)
    norm_xmin = max(0, (xmin - pad_x) / 1000.0)
    norm_ymax = min(1.0, (ymax + pad_y) / 1000.0)
    norm_xmax = min(1.0, (xmax + pad_x) / 1000.0)

    crop_rect = fitz.Rect(
        norm_xmin * pw,
        norm_ymin * ph,
        norm_xmax * pw,
        norm_ymax * ph
    )

    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, clip=crop_rect, alpha=False)

    img_bytes = pix.tobytes("png")
    b64 = base64.b64encode(img_bytes).decode("ascii")
    doc.close()

    return {
        "page": page_num,
        "width": pix.width,
        "height": pix.height,
        "box": box_1000,
        "imageUrl": f"data:image/png;base64,{b64}"
    }

def detect_page_diagrams(pdf_path_or_bytes, page_num=1):
    """
    Detect embedded diagrams, drawings, and images on a page.
    Returns normalized bounding boxes [ymin, xmin, ymax, xmax] (0-1000).
    """
    if not fitz:
        raise RuntimeError("PyMuPDF (fitz) is not installed.")

    if isinstance(pdf_path_or_bytes, bytes):
        doc = fitz.open(stream=pdf_path_or_bytes, filetype="pdf")
    else:
        doc = fitz.open(pdf_path_or_bytes)

    page = doc[page_num - 1]
    rect = page.rect
    pw, ph = rect.width, rect.height

    detected = []

    # 1. Raster images
    for img_info in page.get_images():
        xref = img_info[0]
        for bbox in page.get_image_rects(xref):
            # Normalize to 0-1000
            norm_box = [
                int(round((bbox.y0 / ph) * 1000)),
                int(round((bbox.x0 / pw) * 1000)),
                int(round((bbox.y1 / ph) * 1000)),
                int(round((bbox.x1 / pw) * 1000))
            ]
            w = norm_box[3] - norm_box[1]
            h = norm_box[2] - norm_box[0]
            if w > 40 and h > 40: # Filter out tiny icons
                detected.append({
                    "type": "raster_image",
                    "box": norm_box
                })

    # 2. Vector drawings (circuits, coordinate graphs, geometry, ray diagrams)
    drawings = page.get_drawings()
    if drawings:
        clusters = []
        for d in drawings:
            r = d["rect"]
            if r.width > 20 and r.height > 20:
                clusters.append(r)

        # Merge overlapping/adjacent drawing rects
        merged = []
        for r in clusters:
            merged_into_existing = False
            for i, m in enumerate(merged):
                if m.intersects(r) or (abs(m.x0 - r.x0) < 30 and abs(m.y0 - r.y0) < 30):
                    merged[i] = m | r
                    merged_into_existing = True
                    break
            if not merged_into_existing:
                merged.append(r)

        for m in merged:
            norm_box = [
                int(round((m.y0 / ph) * 1000)),
                int(round((m.x0 / pw) * 1000)),
                int(round((m.y1 / ph) * 1000)),
                int(round((m.x1 / pw) * 1000))
            ]
            w = norm_box[3] - norm_box[1]
            h = norm_box[2] - norm_box[0]
            if w > 60 and h > 60:
                detected.append({
                    "type": "vector_drawing",
                    "box": norm_box
                })

    doc.close()
    return detected

def extract_pdf_info(pdf_path_or_bytes):
    """Extract metadata, total pages, and text summary of PDF."""
    if not fitz:
        raise RuntimeError("PyMuPDF (fitz) is not installed.")

    if isinstance(pdf_path_or_bytes, bytes):
        doc = fitz.open(stream=pdf_path_or_bytes, filetype="pdf")
    else:
        doc = fitz.open(pdf_path_or_bytes)

    info = {
        "totalPages": len(doc),
        "metadata": doc.metadata,
        "pages": []
    }

    for idx, page in enumerate(doc):
        text = page.get_text().strip()
        info["pages"].append({
            "pageNumber": idx + 1,
            "charCount": len(text),
            "hasText": len(text) > 0,
            "preview": text[:200]
        })

    doc.close()
    return info

def main():
    """CLI mode for Node.js IPC execution."""
    if len(sys.argv) < 2:
        print(json.dumps(get_engine_status()))
        return

    cmd = sys.argv[1]

    try:
        if cmd == "status":
            print(json.dumps(get_engine_status()))

        elif cmd == "render":
            # Usage: python pdf_service.py render <pdf_path> <page_num> [dpi]
            pdf_path = sys.argv[2]
            page_num = int(sys.argv[3]) if len(sys.argv) > 3 else 1
            dpi = int(sys.argv[4]) if len(sys.argv) > 4 else 200
            res = render_page_base64(pdf_path, page_num, dpi)
            print(json.dumps(res))

        elif cmd == "crop":
            # Usage: python pdf_service.py crop <pdf_path> <page_num> <ymin,xmin,ymax,xmax> [dpi]
            pdf_path = sys.argv[2]
            page_num = int(sys.argv[3])
            box = [int(v) for v in sys.argv[4].split(",")]
            dpi = int(sys.argv[5]) if len(sys.argv) > 5 else 250
            res = crop_diagram_base64(pdf_path, page_num, box, dpi)
            print(json.dumps(res))

        elif cmd == "info":
            pdf_path = sys.argv[2]
            res = extract_pdf_info(pdf_path)
            print(json.dumps(res))

        elif cmd == "detect_diagrams":
            pdf_path = sys.argv[2]
            page_num = int(sys.argv[3]) if len(sys.argv) > 3 else 1
            res = detect_page_diagrams(pdf_path, page_num)
            print(json.dumps(res))

        elif cmd == "stdin":
            # Read JSON payload from stdin
            payload = json.loads(sys.stdin.read())
            action = payload.get("action")
            pdf_b64 = payload.get("pdfBase64")

            if pdf_b64:
                # Strip prefix if needed
                if "," in pdf_b64:
                    pdf_b64 = pdf_b64.split(",", 1)[1]
                pdf_bytes = base64.b64decode(pdf_b64)
            elif payload.get("pdfPath"):
                pdf_bytes = payload.get("pdfPath")
            else:
                raise ValueError("No pdfBase64 or pdfPath provided")

            if action == "render":
                res = render_page_base64(pdf_bytes, payload.get("page", 1), payload.get("dpi", 200))
                print(json.dumps(res))
            elif action == "crop":
                res = crop_diagram_base64(pdf_bytes, payload.get("page", 1), payload.get("box"), payload.get("dpi", 250))
                print(json.dumps(res))
            elif action == "detect":
                res = detect_page_diagrams(pdf_bytes, payload.get("page", 1))
                print(json.dumps(res))
            elif action == "info":
                res = extract_pdf_info(pdf_bytes)
                print(json.dumps(res))
            else:
                raise ValueError(f"Unknown action: {action}")

        else:
            raise ValueError(f"Unknown command: {cmd}")

    except Exception as e:
        sys.stderr.write(f"Error: {str(e)}\n")
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
