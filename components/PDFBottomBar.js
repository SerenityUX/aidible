import styles from "@/styles/components/PDFViewer.module.css";

export default function PDFBottomBar({ 
  pageNumber,
  numPages,
  changePage,
  controlsShowReading,
  isCallActive,
  selectedVoice,
  handleVoiceChange,
  handleReadPage,
  handlePauseResume,
  isPaused,
  handleCall,
  isConnecting,
  volumeLevel,
  handleVolumeChange,
  voices
}) {
  return (
    <div className={styles.bottomBar}>
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
        {!isCallActive && (
          <select 
            className={styles.voiceSelect}
            value={selectedVoice}
            onChange={handleVoiceChange}
            aria-label="Select voice"
          >
            {voices.map(voice => (
              <option key={voice.value} value={voice.value}>
                {voice.name} ({voice.gender})
              </option>
            ))}
          </select>
        )}
        <button 
          className={styles.button}
          onClick={handleReadPage}
          type="button"
          aria-label={controlsShowReading ? "Stop reading" : "Read page content"}
        >
          {controlsShowReading ? 'Stop Reading' : 'Read'}
        </button>
        {controlsShowReading && (
          <button 
            className={styles.button}
            onClick={handlePauseResume}
            type="button"
            aria-label={isPaused ? "Resume reading" : "Pause reading"}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
        )}
        <button 
          className={styles.button}
          onClick={handleCall}
          type="button"
          disabled={isConnecting}
          aria-label={isCallActive ? "End call" : "Start call"}
        >
          {isConnecting ? 'Connecting...' : isCallActive ? 'End Call' : 'Call'}
        </button>
        <div className={styles.volumeControl}>
          <input
            type="range"
            min="0"
            max="100"
            value={volumeLevel * 100}
            onChange={handleVolumeChange}
            className={styles.volumeSlider}
            aria-label="Volume control"
          />
          <span className={styles.volumeLabel}>
            {Math.round(volumeLevel * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
} 