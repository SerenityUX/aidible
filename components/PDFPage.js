"use client";

import { useState, useCallback, memo, useEffect, useRef } from "react";
import { Page } from "react-pdf";
import styles from "@/styles/components/PDFPage.module.css";

const MAX_WIDTH = 600;
const MAX_HEIGHT = 800;

function PDFPage({ pageNumber, highlightText }) {
  const [scale, setScale] = useState(1);
  const [highlights, setHighlights] = useState([]);
  const containerRef = useRef(null);

  const handlePageLoadSuccess = useCallback(({ width, height }) => {
    if (scale === 1) {
      const widthScale = MAX_WIDTH / width;
      const heightScale = MAX_HEIGHT / height;
      const newScale = Math.min(widthScale, heightScale, 1);
      setScale(newScale);
    }
  }, [scale]);

  useEffect(() => {
    if (!containerRef.current || !highlightText) {
      setHighlights([]);
      return;
    }

    const findHighlights = () => {
      const textLayer = containerRef.current.querySelector('.react-pdf__Page__textContent');
      if (!textLayer) return;

      const spans = Array.from(textLayer.getElementsByTagName('span'));
      const newHighlights = [];

      // Clean and normalize the text we're looking for
      const searchText = highlightText.trim().toLowerCase().replace(/\s+/g, ' ');
      console.log('Searching for:', searchText);

      // First pass: collect all text content and positions
      let combinedText = '';
      const textSegments = spans.map(span => {
        const text = span.textContent;
        const start = combinedText.length;
        combinedText += text + ' ';
        return {
          span,
          text,
          start,
          end: combinedText.length - 1 // -1 to exclude the space we added
        };
      });

      // Find the exact chunk boundaries
      const searchIndex = combinedText.toLowerCase().indexOf(searchText);
      if (searchIndex !== -1) {
        const searchEnd = searchIndex + searchText.length;
        console.log('Found text at index:', searchIndex, 'to', searchEnd);

        // Find segments that overlap with our search text
        const relevantSegments = textSegments.filter(segment => {
          // Check if this segment overlaps with our search range
          const overlapsStart = segment.start <= searchIndex && segment.end > searchIndex;
          const overlapsMiddle = segment.start >= searchIndex && segment.end <= searchEnd;
          const overlapsEnd = segment.start < searchEnd && segment.end >= searchEnd;
          return overlapsStart || overlapsMiddle || overlapsEnd;
        });

        // For each relevant segment, calculate the exact portion to highlight
        relevantSegments.forEach(segment => {
          const rect = segment.span.getBoundingClientRect();
          const parentRect = containerRef.current.getBoundingClientRect();

          // Calculate what portion of this span should be highlighted
          const spanText = segment.text;
          const spanLength = spanText.length;
          
          let highlightStart = 0;
          let highlightWidth = rect.width;

          if (segment.start < searchIndex) {
            // This span contains the start of our highlight
            const charsBeforeHighlight = searchIndex - segment.start;
            highlightStart = (charsBeforeHighlight / spanLength) * rect.width;
            highlightWidth = ((spanLength - charsBeforeHighlight) / spanLength) * rect.width;
          }

          if (segment.end > searchEnd) {
            // This span contains the end of our highlight
            const charsInHighlight = searchEnd - Math.max(searchIndex, segment.start);
            highlightWidth = (charsInHighlight / spanLength) * rect.width;
          }

          newHighlights.push({
            content: segment.text,
            position: {
              top: rect.top - parentRect.top,
              left: rect.left - parentRect.left + highlightStart,
              width: highlightWidth,
              height: rect.height
            },
            isExact: segment.text.toLowerCase() === searchText
          });
        });
      }

      console.log('Created highlights:', newHighlights);
      setHighlights(newHighlights);
    };

    // Initial check with a delay to ensure PDF is rendered
    const timeoutId = setTimeout(findHighlights, 100);

    // Observer for dynamic changes
    const observer = new MutationObserver(findHighlights);
    observer.observe(containerRef.current, {
      childList: true,
      subtree: true,
      characterData: true
    });

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [highlightText]);

  return (
    <div className={styles.container} ref={containerRef}>
      <Page
        key={pageNumber}
        pageNumber={pageNumber}
        loading={<div></div>}
        scale={scale}
        onLoadSuccess={handlePageLoadSuccess}
        renderAnnotationLayer={false}
        renderTextLayer={true}
      />
      <div className={styles.highlightLayer}>
        {highlights.map((highlight, index) => (
          <div
            key={index}
            className={highlight.isExact ? styles.currentChunk : styles.partialMatch}
            style={{
              position: 'absolute',
              ...highlight.position
            }}
          />
        ))}
      </div>
    </div>
  );
}

PDFPage.displayName = "PDFPage";

export default memo(PDFPage); 