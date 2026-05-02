import html2pdf from 'html2pdf.js';
import type { TravelInputs } from '../shared/contract';
import type { ItineraryDraft } from '../shared/step1-contract';
import type { AccommodationTransport } from '../shared/step2-contract';
import type { BudgetCalculation } from '../shared/step3-contract';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TripPDFView } from '../components/TripPDFView';

/**
 * Export a complete trip as a beautifully formatted PDF.
 * 
 * Strategy: render TripPDFView into a visible (but overlay-covered) container,
 * wait for images to load, then use html2pdf.js to capture and convert to PDF.
 * html2canvas cannot capture off-screen elements, so the container must be
 * in the viewport.
 */
export async function exportTripToPDF(
  inputs: TravelInputs,
  step1Data: ItineraryDraft,
  step2Data: AccommodationTransport,
  step3Data: BudgetCalculation,
): Promise<void> {
  const destination = inputs.destination || 'Viaggio';
  const startDate = inputs.startDate || new Date().toISOString().slice(0, 10);
  const fileName = `${destination.replace(/[^a-zA-Z0-9àèéìòù]/g, '_')}_${startDate}.pdf`;

  // Create overlay to block UI during export
  const overlay = document.createElement('div');
  overlay.id = 'pdf-export-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:Inter,sans-serif;';

  const spinner = document.createElement('div');
  spinner.style.cssText = 'background:white;border-radius:16px;padding:32px 48px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);';
  spinner.innerHTML = '<div style="width:32px;height:32px;border:3px solid #e8e6df;border-top-color:#5a5a40;border-radius:50%;animation:pdfspin 1s linear infinite;margin:0 auto 16px;"></div><div style="color:#1a1a1a;font-size:14px;font-weight:600;">Generazione PDF...</div><div style="color:#888;font-size:12px;margin-top:4px;">Quasi pronto</div>';
  
  // Add spin animation
  const styleSheet = document.createElement('style');
  styleSheet.textContent = '@keyframes pdfspin { to { transform: rotate(360deg); } }';
  document.head.appendChild(styleSheet);

  overlay.appendChild(spinner);
  document.body.appendChild(overlay);

  // Create container IN the viewport (html2canvas needs visible elements)
  const container = document.createElement('div');
  container.id = 'pdf-export-container';
  container.style.cssText = 'position:absolute;top:0;left:0;width:210mm;background:#fff;z-index:-1;opacity:0;pointer-events:none;';
  document.body.appendChild(container);

  // Render React component into the container
  const root = createRoot(container);
  
  try {
    root.render(
      React.createElement(TripPDFView, {
        inputs,
        step1Data,
        step2Data,
        step3Data,
      })
    );

    // Wait for React to render
    await new Promise(r => setTimeout(r, 500));

    // Wait for all images to load
    const images = container.querySelectorAll('img');
    await Promise.allSettled(
      Array.from(images).map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise<void>((res) => {
          img.onload = () => res();
          img.onerror = () => res();
          setTimeout(res, 4000); // timeout per image
        });
      })
    );

    // Extra wait for lazy content
    await new Promise(r => setTimeout(r, 500));

    // Make container visible for html2canvas capture (briefly)
    container.style.opacity = '1';
    container.style.pointerEvents = 'none';
    // Keep it behind the overlay via z-index (overlay is 99999, container at -1 is fine for html2canvas)
    // html2canvas renders from DOM, not screen pixels, so z-index doesn't matter

    const opt = {
      margin: [8, 8] as [number, number],
      filename: fileName,
      image: { type: 'jpeg' as const, quality: 0.95 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        letterRendering: true,
        backgroundColor: '#ffffff',
        // onclone ensures the clone (used by html2canvas) is styled correctly
        onclone: (clonedDoc: Document, clonedEl: HTMLElement) => {
          // Make sure fonts and styles carry over
          clonedEl.style.position = 'relative';
          clonedEl.style.left = '0';
          clonedEl.style.top = '0';
          clonedEl.style.opacity = '1';
          clonedEl.style.zIndex = '1';
          clonedEl.style.pointerEvents = 'none';
          // Ensure the container is fully visible in the cloned doc
          const clonedContainer = clonedDoc.getElementById('pdf-export-container');
          if (clonedContainer) {
            clonedContainer.style.opacity = '1';
            clonedContainer.style.position = 'relative';
            clonedContainer.style.left = '0';
            clonedContainer.style.top = '0';
            clonedContainer.style.zIndex = '1';
            clonedContainer.style.pointerEvents = 'none';
          }
          // Inject fonts into cloned doc
          const link = clonedDoc.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&family=Inter:wght@100..900&display=swap';
          clonedDoc.head.appendChild(link);
          return clonedEl;
        }
      },
      jsPDF: {
        unit: 'mm' as const,
        format: 'a4' as const,
        orientation: 'portrait' as const,
      },
      pagebreak: {
        mode: ['avoid-all', 'css', 'legacy'],
        before: '.pdf-page-break',
        avoid: ['img', 'table', 'tr', 'td']
      },
    };

    await html2pdf().set(opt).from(container).save();

  } catch (err) {
    console.error('[PDF Export] Error generating PDF:', err);
    throw err;
  } finally {
    // Cleanup: remove overlay, container, spinner
    root.unmount();
    if (container.parentNode) document.body.removeChild(container);
    if (overlay.parentNode) document.body.removeChild(overlay);
    if (styleSheet.parentNode) document.head.removeChild(styleSheet);
  }
}