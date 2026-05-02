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
 * Creates a hidden container, renders the TripPDFView component into it,
 * then uses html2pdf.js to convert to PDF and trigger download.
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

  // Create hidden container
  const container = document.createElement('div');
  container.id = 'pdf-export-container';
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '210mm'; // A4 width
  container.style.background = '#fff';
  container.style.zIndex = '-1';
  document.body.appendChild(container);

  // Render React component into the hidden container
  const root = createRoot(container);
  
  return new Promise<void>((resolve, reject) => {
    root.render(
      React.createElement(TripPDFView, {
        inputs,
        step1Data,
        step2Data,
        step3Data,
      })
    );

    // Wait for images to load, then generate PDF
    setTimeout(async () => {
      try {
        // Wait for any images in the container to load
        const images = container.querySelectorAll('img');
        await Promise.allSettled(
          Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise<void>((res) => {
              img.onload = () => res();
              img.onerror = () => res();
              // Timeout after 3s per image
              setTimeout(res, 3000);
            });
          })
        );

        // Additional wait for map image
        await new Promise(r => setTimeout(r, 500));

        const opt = {
          margin: [8, 8] as [number, number],
          filename: fileName,
          image: { type: 'jpeg' as const, quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false,
            letterRendering: true,
            onclone: (doc: Document) => {
              // Force font loading in cloned document
              const styles = doc.createElement('style');
              styles.textContent = `
                @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&family=Inter:wght@100..900&display=swap');
              `;
              doc.head.appendChild(styles);
              return doc;
            }
          },
          jsPDF: {
            unit: 'mm' as const,
            format: 'a4' as const,
            orientation: 'portrait' as const,
          },
          pagebreak: {
            mode: ['avoid-all', 'css', 'legacy'] as string[],
            before: '.pdf-page-break',
            avoid: ['img', 'table', 'tr', 'td']
          },
        };

        await html2pdf().set(opt).from(container).save();
        resolve();
      } catch (err) {
        console.error('[PDF Export] Error generating PDF:', err);
        reject(err);
      } finally {
        // Cleanup
        root.unmount();
        document.body.removeChild(container);
      }
    }, 1000); // Initial render wait
  });
}