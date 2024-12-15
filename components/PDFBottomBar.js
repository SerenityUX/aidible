import styles from "@/styles/components/PDFViewer.module.css";
import Image from 'next/image';
import { useState, useRef, useEffect } from 'react';

const MIN_MINUTES = 5;
const MAX_MINUTES = 90;

const calculateAngle = (centerX, centerY, pointX, pointY) => {
  const deltaX = pointX - centerX;
  const deltaY = pointY - centerY;
  let angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
  angle = (angle + 360) % 360;
  angle = (angle + 90) % 360;
  return angle;
};

const angleToMinutes = (angle) => {
  return Math.round(MIN_MINUTES + (angle / 360) * (MAX_MINUTES - MIN_MINUTES));
};

const minutesToAngle = (minutes) => {
  return ((minutes - MIN_MINUTES) / (MAX_MINUTES - MIN_MINUTES)) * 360;
};

const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  };
};

const describeArc = (x, y, radius, startAngle, endAngle) => {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M", start.x, start.y,
    "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(" ");
};

const calculateArcAngle = (centerX, centerY, pointX, pointY) => {
  const deltaX = pointX - centerX;
  const deltaY = pointY - centerY;
  let angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI) + 90;
  if (angle < 0) angle += 360;
  return angle;
};

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
  voices,
  stopReading
}) {
  const [isCallButtonHovered, setIsCallButtonHovered] = useState(false);
  const [showVolumePopup, setShowVolumePopup] = useState(false);
  const [showVoicePopup, setShowVoicePopup] = useState(false);
  const volumeControlRef = useRef(null);
  const voiceControlRef = useRef(null);
  const [playingSampleId, setPlayingSampleId] = useState(null);
  const audioRefs = useRef({});
  const [showSleepTimerPopup, setShowSleepTimerPopup] = useState(false);
  const [sleepTimer, setSleepTimer] = useState(null);
  const [remainingTime, setRemainingTime] = useState(null);
  const sleepTimerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedMinutes, setSelectedMinutes] = useState(30); // Default to 30 minutes
  const dialRef = useRef(null);

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
      if (sleepTimerRef.current && 
          !sleepTimerRef.current.contains(event.target) && 
          !event.target.closest(`.${styles.sleepTimerPopup}`)) {
        setShowSleepTimerPopup(false);
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

  useEffect(() => {
    if (remainingTime === 0) {
      handlePauseResume();
      setSleepTimer(null);
      setRemainingTime(null);
    }

    if (remainingTime) {
      const interval = setInterval(() => {
        setRemainingTime(prev => prev - 1);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [remainingTime, handlePauseResume]);

  const handleSetTimer = (minutes, event) => {
    // Prevent the click from bubbling up
    event?.stopPropagation();
    
    if (sleepTimer) {
      clearTimeout(sleepTimer);
    }
    
    if (minutes === 0) {
      setSleepTimer(null);
      setRemainingTime(null);
      setShowSleepTimerPopup(false);
      return;
    }

    const timer = setTimeout(() => {
      handlePauseResume();
      setSleepTimer(null);
      setRemainingTime(null);
    }, minutes * 60 * 1000);

    setSleepTimer(timer);
    setRemainingTime(minutes * 60);
    setSelectedMinutes(minutes);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDialMouseDown = (e) => {
    setIsDragging(true);
    updateTime(e);
  };

  const handleDialMouseMove = (e) => {
    if (isDragging) {
      updateTime(e);
    }
  };

  const handleDialMouseUp = () => {
    setIsDragging(false);
  };

  const updateTime = (e) => {
    if (!dialRef.current) return;
    
    const rect = dialRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const angle = calculateArcAngle(centerX, centerY, e.clientX, e.clientY);
    const percentage = angle / 360;
    const minutes = Math.round(MIN_MINUTES + percentage * (MAX_MINUTES - MIN_MINUTES));
    
    if (minutes >= MIN_MINUTES && minutes <= MAX_MINUTES) {
      setSelectedMinutes(minutes);
    }
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDialMouseMove);
      window.addEventListener('mouseup', handleDialMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleDialMouseMove);
      window.removeEventListener('mouseup', handleDialMouseUp);
    };
  }, [isDragging]);

  return (
    <div className={styles.bottomBar}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        maxWidth: 568,
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
                className={`${styles.controlIcon} ${styles.audioControlButton}`}
              />
              {controlsShowReading && (
                <Image
                  src="/stopButton.svg"
                  alt="Stop"
                  width={48}
                  height={48}
                  onClick={stopReading}
                  className={`${styles.controlIcon} ${styles.audioControlButton}`}
                />
              )}
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

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative' }}>
          <div className={styles.moonButtonContainer}>
            <div 
              className={`${styles.moonButton} ${remainingTime ? styles.moonButtonActive : ''}`}
              ref={sleepTimerRef}
              onClick={() => setShowSleepTimerPopup(!showSleepTimerPopup)}
            >
              <Image
                src="/moon.svg"
                alt="Sleep timer"
                width={24}
                height={24}
                className={styles.controlIcon}
              />
              {remainingTime && (
                <span className={styles.moonTimerDisplay}>
                  {formatTime(remainingTime)}
                </span>
              )}
            </div>
            {showSleepTimerPopup && (
              <div className={styles.sleepTimerPopup}>
                <div className={styles.sleepTimerHeader}>
                  Sleep Timer
                </div>
                <div className={styles.timerContainer}>
                  <svg className={styles.timerProgress} viewBox="0 0 36 36">
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      className={styles.timerBackground}
                    />
                    {remainingTime && (
                      <circle
                        cx="18"
                        cy="18"
                        r="16"
                        className={styles.timerForeground}
                        style={{
                          strokeDasharray: `${2 * Math.PI * 16}`,
                          strokeDashoffset: `${2 * Math.PI * 16 * (1 - (remainingTime / 60) / 90)}`
                        }}
                      />
                    )}
                  </svg>
                  <div className={styles.timerTime}>
                    {remainingTime ? formatTime(remainingTime) : ""}
                  </div>
                </div>
                <div className={styles.timerButtons}>
                  {[5, 10, 15, 30].map((minutes) => (
                    <button
                      key={minutes}
                      onClick={(e) => handleSetTimer(minutes, e)}
                      className={`${styles.timerButton} ${
                        remainingTime && Math.ceil(remainingTime / 60) === minutes 
                          ? styles.activeTimer 
                          : ''
                      }`}
                    >
                      {minutes}m
                    </button>
                  ))}
                </div>
                <div className={styles.timerButtons}>
                  {[45, 60, 75, 90].map((minutes) => (
                    <button
                      key={minutes}
                      onClick={(e) => handleSetTimer(minutes, e)}
                      className={`${styles.timerButton} ${
                        remainingTime && Math.ceil(remainingTime / 60) === minutes 
                          ? styles.activeTimer 
                          : ''
                      }`}
                    >
                      {minutes}m
                    </button>
                  ))}
                </div>
                {remainingTime && (
                  <button
                    onClick={(e) => handleSetTimer(0, e)}
                    className={styles.cancelButton}
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
          </div>

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
    </div>
  );
} 