import styles from "@/styles/components/PDFViewer.module.css";

export default function PDFTopBar({ pdfTitle, onClose }) {
  return (
    <div className={styles.topBar}>
      <div style={{display: "flex", justifyContent: "space-between", width: "100%", maxWidth: 600}} className={styles.titleContainer}>
        <button 
          onClick={onClose}
          className={styles.closeButton}
          aria-label="Close PDF viewer"
        >
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <path 
              d="M18 6L6 18M6 6L18 18" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {pdfTitle}
        <div style={{height: 16, width: 16}}>
          {/* holds space, ignore */}
        </div>
      </div>
    </div>
  );
} 