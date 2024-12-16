"use client";

import { useState, useCallback, memo, useEffect, useRef } from "react";
import { Page } from "react-pdf";
import styles from "@/styles/components/PDFPage.module.css";
import { createHighlights } from "@/utils/textHighlighter";

const MAX_WIDTH = 600;
const MAX_HEIGHT = 800;

function PDFPage({ pageNumber, highlightText }) {
  const [scale, setScale] = useState(1);
  const containerRef = useRef(null);
  const highlightLayerRef = useRef(null);

  const handlePageLoadSuccess = useCallback(({ width, height }) => {
    if (scale === 1) {
      const widthScale = MAX_WIDTH / width;
      const heightScale = MAX_HEIGHT / height;
      const newScale = Math.min(widthScale, heightScale, 1);
      setScale(newScale);
    }
  }, [scale]);

  useEffect(() => {
    // Initial highlight with RAF
    const updateHighlights = () => {
      requestAnimationFrame(() => {
        createHighlights(containerRef, highlightLayerRef, highlightText, styles);
      });
    };

    updateHighlights();

    // Observer for dynamic changes
    const observer = new MutationObserver(updateHighlights);
    
    if (containerRef.current) {
      observer.observe(containerRef.current, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    return () => {
      observer.disconnect();
      if (highlightLayerRef.current) {
        highlightLayerRef.current.remove();
        highlightLayerRef.current = null;
      }
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
    </div>
  );
}

PDFPage.displayName = "PDFPage";

export default memo(PDFPage); 