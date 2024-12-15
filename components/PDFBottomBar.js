import styles from "@/styles/components/PDFViewer.module.css";
import Image from 'next/image';
import { useState, useRef, useEffect } from 'react';

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
  const [isCallButtonHovered, setIsCallButtonHovered] = useState(false);
  const [showVolumePopup, setShowVolumePopup] = useState(false);
  const [showVoicePopup, setShowVoicePopup] = useState(false);
  const volumeControlRef = useRef(null);
  const voiceControlRef = useRef(null);
  const [playingSampleId, setPlayingSampleId] = useState(null);
  const audioRefs = useRef({});

  const getVolumeIcon = (level) => {
    if (level === 0) return "/volumeMute.svg";
    if (level < 0.5) return "/volumeQuiet.svg";
    return "/volumeIcon.svg";
  };

  // Close popups when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (volumeControlRef.current && !volumeControlRef.current.contains(event.target)) {
        setShowVolumePopup(false);
      }
      if (voiceControlRef.current && !voiceControlRef.current.contains(event.target)) {
        setShowVoicePopup(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const playVoiceSample = (sampleUrl, voiceId) => {
    // Stop current sample if playing
    if (playingSampleId) {
      if (audioRefs.current[playingSampleId]) {
        audioRefs.current[playingSampleId].pause();
        audioRefs.current[playingSampleId].currentTime = 0;
        // Clean up the reference if it's a different voice
        if (playingSampleId !== voiceId) {
          delete audioRefs.current[playingSampleId];
        }
      }
    }

    // If clicking the same voice that's playing, just stop it
    if (playingSampleId === voiceId) {
      setPlayingSampleId(null);
      return;
    }

    // Create or get audio element
    let audio = audioRefs.current[voiceId];
    if (!audio) {
      audio = new Audio(sampleUrl);
      audio.id = `sample-${voiceId}`;
      audio.onended = () => {
        setPlayingSampleId(null);
        delete audioRefs.current[voiceId];
      };
      audioRefs.current[voiceId] = audio;
    }

    // Play new sample
    audio.play();
    setPlayingSampleId(voiceId);
  };

  useEffect(() => {
    return () => {
      // Cleanup all audio on unmount
      Object.values(audioRefs.current).forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
      audioRefs.current = {};
    };
  }, []);

  return (
    <div className={styles.bottomBar}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        maxWidth: 600,
        margin: "0 auto"
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div className={styles.volumeIconContainer} ref={volumeControlRef}>
            <Image 
              src={getVolumeIcon(volumeLevel)}
              alt="Volume control"
              width={24}
              height={24}
              onClick={() => setShowVolumePopup(!showVolumePopup)}
              className={styles.controlIcon}
            />
            {showVolumePopup && (
              <div className={styles.volumePopup}>
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
            )}
          </div>

          <div className={styles.voiceIconContainer} ref={voiceControlRef}>
            <Image 
              src="/voice.svg"
              alt="Voice selection"
              width={24}
              height={24}
              onClick={() => setShowVoicePopup(!showVoicePopup)}
              className={styles.controlIcon}
            />
            {showVoicePopup && (
              <div className={styles.voicePopup}>
                {voices.map(voice => (
                  <div 
                    key={voice.value}
                    className={`${styles.voiceOption} ${selectedVoice === voice.value ? styles.selectedVoice : ''}`}
                    onClick={() => handleVoiceChange({ target: { value: voice.value }})}
                  >
                    <div className={styles.voiceInfo}>
                      <span className={styles.voiceName}>{voice.name}</span>
                      <span className={styles.voiceDetails}>
                        {voice.gender} • {voice.style}
                      </span>
                    </div>
                    <Image
                      src={playingSampleId === voice.value ? "/pauseButton.svg" : "/playButton.svg"}
                      alt={playingSampleId === voice.value ? "Stop sample" : "Play sample"}
                      width={24}
                      height={24}
                      onClick={(e) => {
                        e.stopPropagation();
                        playVoiceSample(voice.sample, voice.value);
                      }}
                      className={styles.controlIcon}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "4px",
          marginBottom: "-16px",
          paddingBottom: "2px"
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <Image 
              src="/leftButton.svg"
              alt="Previous page"
              width={24}
              height={24}
              onClick={(e) => changePage(e, -1)}
              className={`${styles.controlIcon} ${styles.navButton} ${pageNumber <= 1 ? styles.disabled : ''}`}
              style={{ cursor: pageNumber <= 1 ? 'default' : 'pointer' }}
            />
            <div className={styles.audioControls}>
              <Image
                src={(!controlsShowReading || isPaused) ? "/playButton.svg" : "/pauseButton.svg"}
                alt={(!controlsShowReading || isPaused) ? "Play" : "Pause"}
                width={48}
                height={48}
                onClick={controlsShowReading ? handlePauseResume : handleReadPage}
                className={styles.controlIcon}
              />
            </div>
            <Image
              src="/rightButton.svg" 
              alt="Next page"
              width={24}
              height={24}
              onClick={(e) => changePage(e, 1)}
              className={`${styles.controlIcon} ${styles.navButton} ${pageNumber >= numPages ? styles.disabled : ''}`}
              style={{ cursor: pageNumber >= numPages ? 'default' : 'pointer' }}
            />
          </div>
          <span className={styles.pageInfo} aria-label={`Page ${pageNumber} of ${numPages}`}>
            {pageNumber}/{numPages}
          </span>
        </div>

        {/* {!isCallActive && (
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
        )} */}

        <div 
          className={styles.callButton}
          onClick={handleCall}
          onMouseEnter={() => setIsCallButtonHovered(true)}
          onMouseLeave={() => setIsCallButtonHovered(false)}
          style={{ cursor: isConnecting ? 'default' : 'pointer' }}
        >
          <Image
            src={
              isConnecting ? "/phoneCallConnecting.svg" :
              isCallActive ? 
                (isCallButtonHovered ? "/disconnectCall.svg" : "/phoneCallConnected.svg") :
              "/phoneCall.svg"
            }
            alt={
              isConnecting ? "Connecting call" :
              isCallActive ? 
                (isCallButtonHovered ? "End call" : "Call connected") :
              "Start call"
            }
            width={24}
            height={24}
            className={`${styles.controlIcon} ${isConnecting ? styles.disabled : ''}`}
          />
        </div>
      </div>
    </div>
  );
} 