"use client";

import { useState, useCallback } from "react";
import { Document } from "react-pdf";
import { pdfjs } from "react-pdf";
import PDFPage from "./PDFPage";
import styles from "@/styles/components/PDFViewer.module.css";

// Initialize PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.6.172/legacy/build/pdf.worker.min.js`;

export default function PDFViewer({ file }) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [error, setError] = useState(null);

  const handleDocumentLoadSuccess = useCallback(({ numPages }) => {
    setNumPages(numPages);
    setPageNumber(1);
    setError(null);
  }, []);

  const handleDocumentLoadError = useCallback((error) => {
    console.error("Error loading PDF:", error);
    setError(error);
  }, []);

  const changePage = useCallback((e, offset) => {
    e.preventDefault();
    setPageNumber(prev => Math.min(Math.max(1, prev + offset), numPages));
  }, [numPages]);

  if (error) {
    return <div>Error loading PDF: {error.message}</div>;
  }

  return (
    <div className={styles.container}>
      <Document
        file={file}
        onLoadSuccess={handleDocumentLoadSuccess}
        onLoadError={handleDocumentLoadError}
        loading={<div>Loading PDF...</div>}
      >
        <PDFPage pageNumber={pageNumber} />
      </Document>
      
      <div className={styles.controls}>
        <button 
          className={styles.button}
          onClick={(e) => changePage(e, -1)} 
          disabled={pageNumber <= 1}
          type="button"
          aria-label="Previous page"
        >
          Back
        </button>
        <span className={styles.pageInfo} aria-label={`Page ${pageNumber} of ${numPages}`}>
          {pageNumber}/{numPages}
        </span>
        <button 
          className={styles.button}
          onClick={(e) => changePage(e, 1)} 
          disabled={pageNumber >= numPages}
          type="button"
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </div>
  );
} 