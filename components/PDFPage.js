"use client";

import { useState, useCallback, memo } from "react";
import { Page } from "react-pdf";
import "react-pdf/dist/esm/Page/TextLayer.css";
import styles from "@/styles/components/PDFPage.module.css";

const MAX_WIDTH = 600;
const MAX_HEIGHT = 800;

function PDFPage({ pageNumber }) {
  const [scale, setScale] = useState(1);

  const handlePageLoadSuccess = useCallback(({ width, height }) => {
    if (scale === 1) {
      const widthScale = MAX_WIDTH / width;
      const heightScale = MAX_HEIGHT / height;
      const newScale = Math.min(widthScale, heightScale, 1);
      setScale(newScale);
    }
  }, [scale]);

  return (
    <div className={styles.container}>
      <Page
        key={pageNumber}
        pageNumber={pageNumber}
        loading={<div>Loading page...</div>}
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