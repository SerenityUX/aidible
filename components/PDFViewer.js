"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Document, Page } from "react-pdf";
import { pdfjs } from "react-pdf";
import PDFPage from "./PDFPage";
import styles from "@/styles/components/PDFViewer.module.css";

// Initialize PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.6.172/legacy/build/pdf.worker.min.js`;

export default function PDFViewer({ file }) {

  const voices = [{
    name: 'Angelo',
    accent: 'american',
    language: 'English (US)',
    languageCode: 'EN-US',
    value: 's3://voice-cloning-zero-shot/baf1ef41-36b6-428c-9bdf-50ba54682bd8/original/manifest.json',
    sample: 'https://peregrine-samples.s3.us-east-1.amazonaws.com/parrot-samples/Angelo_Sample.wav',
    gender: 'male',
    style: 'Conversational',
  },
  {
    name: 'Deedee',
    accent: 'american',
    language: 'English (US)',
    languageCode: 'EN-US',
    value: 's3://voice-cloning-zero-shot/e040bd1b-f190-4bdb-83f0-75ef85b18f84/original/manifest.json',
    sample: 'https://peregrine-samples.s3.us-east-1.amazonaws.com/parrot-samples/Deedee_Sample.wav',
    gender: 'female',
    style: 'Conversational',
  },
  {
    name: 'Jennifer',
    accent: 'american',
    language: 'English (US)',
    languageCode: 'EN-US',
    value: 's3://voice-cloning-zero-shot/801a663f-efd0-4254-98d0-5c175514c3e8/jennifer/manifest.json',
    sample: 'https://peregrine-samples.s3.amazonaws.com/parrot-samples/jennifer.wav',
    gender: 'female',
    style: 'Conversational',
  },
  {
    name: 'Briggs',
    accent: 'american',
    language: 'English (US)',
    languageCode: 'EN-US',
    value: 's3://voice-cloning-zero-shot/71cdb799-1e03-41c6-8a05-f7cd55134b0b/original/manifest.json',
    sample: 'https://peregrine-samples.s3.us-east-1.amazonaws.com/parrot-samples/Briggs_Sample.wav',
    gender: 'male',
    style: 'Narrative',
  },
  {
    name: 'Samara',
    accent: 'american',
    language: 'English (US)',
    languageCode: 'EN-US',
    value: 's3://voice-cloning-zero-shot/90217770-a480-4a91-b1ea-df00f4d4c29d/original/manifest.json',
    sample: 'https://parrot-samples.s3.amazonaws.com/gargamel/Samara.wav',
    gender: 'female',
    style: 'Conversational',
  }]

  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [error, setError] = useState(null);
  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const audioRef = useRef(null);
  const readerRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const [selectedVoice, setSelectedVoice] = useState(voices[0].value);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const streamRef = useRef(null);
  const wsRef = useRef(null);
  const mediaRecorder = useRef(null);
  const audioChunksRef = useRef([]);
  const audioBufferRef = useRef([]);
  const isPlayingRef = useRef(false);
  const audioContextRef = useRef(null);
  const sourceBufferRef = useRef([]);
  const currentRequestIdRef = useRef('');
  const [volumeLevel, setVolumeLevel] = useState(1);

  const handlePauseResume = useCallback(() => {
    if (!audioRef.current) return;

    if (audioRef.current.paused) {
      audioRef.current.play();
      setIsPaused(false);
    } else {
      audioRef.current.pause();
      setIsPaused(true);
    }
  }, []);

  const stopReading = useCallback(() => {
    try {
      if (readerRef.current) {
        readerRef.current.cancel();
        readerRef.current = null;
      }

      if (mediaSourceRef.current) {
        try {
          if (mediaSourceRef.current.readyState === 'open') {
            mediaSourceRef.current.endOfStream();
          }
          mediaSourceRef.current = null;
        } catch (e) {
          console.warn('MediaSource cleanup error:', e);
        }
      }

      if (audioRef.current) {
        audioRef.current.pause();
        const currentSrc = audioRef.current.src;
        audioRef.current.src = '';
        audioRef.current.load();
        if (currentSrc) {
          try {
            URL.revokeObjectURL(currentSrc);
          } catch (e) {
            console.warn('URL cleanup error:', e);
          }
        }
        audioRef.current = null;
      }

      setIsReading(false);
      setIsPaused(false);
    } catch (error) {
      console.error('Error stopping playback:', error);
      setIsReading(false);
      setIsPaused(false);
    }
  }, []);

  const handleReadPage = useCallback(async (e) => {
    e.preventDefault();
    
    if (isReading) {
      console.log('Stopping current playback');
      stopReading();
      return;
    }

    try {
      console.log('Starting text extraction from PDF');
      const pdf = await pdfjs.getDocument(file).promise;
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textContent.items.map(item => item.str).join(' ');

      console.log('Making request to TTS API');
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          voice: selectedVoice,
          speed: 1.0
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get audio stream');
      }

      stopReading();

      audioRef.current = new Audio();
      audioRef.current.volume = volumeLevel;
      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;
      const sourceUrl = URL.createObjectURL(mediaSource);
      audioRef.current.src = sourceUrl;

      mediaSource.addEventListener('sourceopen', () => {
        try {
          const sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
          const reader = response.body.getReader();
          readerRef.current = reader;
          const chunks = [];
          let isFirstChunk = true;
          let isStopped = false;

          const cleanup = () => {
            isStopped = true;
            if (readerRef.current) {
              readerRef.current.cancel();
              readerRef.current = null;
            }
          };

          const appendNextChunk = async () => {
            if (chunks.length === 0 || sourceBuffer.updating || isStopped) return;

            try {
              const chunk = chunks.shift();
              sourceBuffer.appendBuffer(chunk);

              if (isFirstChunk) {
                isFirstChunk = false;
                audioRef.current?.play().catch(error => {
                  console.error('Error starting playback:', error);
                  cleanup();
                  stopReading();
                });
              }
            } catch (error) {
              if (error.name !== 'InvalidStateError') {
                console.error('Error appending chunk:', error);
                cleanup();
                stopReading();
              }
            }
          };

          sourceBuffer.addEventListener('updateend', () => {
            if (!isStopped) {
              appendNextChunk();
            }
          });

          const readChunks = async () => {
            try {
              while (!isStopped) {
                const { done, value } = await reader.read();

                if (done) {
                  if (chunks.length === 0 && !sourceBuffer.updating && mediaSource.readyState === 'open') {
                    mediaSource.endOfStream();
                  }
                  cleanup();
                  break;
                }

                if (!readerRef.current || isStopped) {
                  cleanup();
                  break;
                }

                chunks.push(value);
                if (!sourceBuffer.updating) {
                  appendNextChunk();
                }
              }
            } catch (error) {
              if (error.name !== 'AbortError') {
                console.error('Streaming error:', error);
                if (mediaSource.readyState === 'open') {
                  mediaSource.endOfStream('error');
                }
              }
              cleanup();
              stopReading();
            }
          };

          mediaSource.addEventListener('sourceended', cleanup);
          mediaSource.addEventListener('sourceclose', cleanup);

          readChunks();
        } catch (error) {
          console.error('Error setting up MediaSource:', error);
          stopReading();
        }
      });

      // Set up event listeners
      if (audioRef.current) {
        audioRef.current.onplay = () => {
          console.log('Audio playback started');
          setIsReading(true);
        };

        audioRef.current.onended = () => {
          console.log('Audio playback ended');
          stopReading();
        };

        audioRef.current.onerror = () => {
          stopReading();
        };
      }

    } catch (error) {
      console.error('Error reading PDF text:', error);
      stopReading();
    }
  }, [file, pageNumber, isReading, stopReading, selectedVoice, volumeLevel]);

  const handleDocumentLoadSuccess = useCallback(({ numPages }) => {
    stopReading();
    setNumPages(numPages);
    setPageNumber(1);
    setError(null);
  }, [stopReading]);

  const handleDocumentLoadError = useCallback((error) => {
    stopReading();
    console.error("Error loading PDF:", error);
    setError(error);
  }, [stopReading]);

  const changePage = useCallback((e, offset) => {
    e.preventDefault();
    stopReading();
    setPageNumber(prev => Math.min(Math.max(1, prev + offset), numPages));
  }, [numPages, stopReading]);

  const handleVoiceChange = useCallback((e) => {
    setSelectedVoice(e.target.value);
  }, []);

  // Add keyboard navigation handler
  const handleKeyDown = useCallback((e) => {
    // Ignore if user is typing in an input or if modifier keys are pressed
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || 
        e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) {
      return;
    }

    switch (e.key) {
      case 'ArrowLeft':
        if (pageNumber > 1) {
          e.preventDefault();
          changePage(e, -1);
        }
        break;
      case 'ArrowRight':
        if (pageNumber < numPages) {
          e.preventDefault();
          changePage(e, 1);
        }
        break;
    }
  }, [pageNumber, numPages, changePage]);

  // Add event listener for keyboard navigation
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  useEffect(() => {
    return () => {
      stopReading();
    };
  }, [stopReading, pageNumber, file]);

  // Remove the duplicate cleanupCall declaration and keep only one:
  const cleanupCall = useCallback(() => {
    try {
      // Close WebSocket connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      // Stop all media tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
        streamRef.current = null;
      }

      // Stop media recorder
      if (mediaRecorder.current) {
        if (mediaRecorder.current.state !== 'inactive') {
          mediaRecorder.current.stop();
        }
        mediaRecorder.current = null;
      }

      // Clear audio context
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Clear audio buffers and chunks
      audioChunksRef.current = [];
      audioBufferRef.current = [];
      sourceBufferRef.current = [];

      // Clear any existing audio
      if (audioRef.current) {
        audioRef.current.pause();
        const currentSrc = audioRef.current.src;
        audioRef.current.src = '';
        audioRef.current.load();
        if (currentSrc) {
          URL.revokeObjectURL(currentSrc);
        }
      }

      // Reset request ID
      currentRequestIdRef.current = '';

      // Reset all states
      setIsCallActive(false);
      setIsConnecting(false);

      // Make API call to cleanup agent
      fetch('/api/agent/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestId: currentRequestIdRef.current
        })
      }).catch(err => console.error('Error cleaning up agent:', err));

    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }, []);

  // Then define handleCall
  const handleCall = useCallback(async () => {
    if (isCallActive) {
      cleanupCall();
      return;
    }

    // If audio is playing, pause it
    if (isReading && !isPaused) {
      handlePauseResume();
    }

    try {
      setIsConnecting(true);

      // Get current voice name and create agent
      const currentVoice = voices.find(v => v.value === selectedVoice);
      const voiceName = currentVoice?.name || 'Assistant';

      // Get current page text
      const pdf = await pdfjs.getDocument(file).promise;
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');

      // Create agent through our API route
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          voice: selectedVoice,
          voiceName: voiceName,
          pageText: pageText
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create agent');
      }

      const agent = await response.json();
      console.log('Agent created:', agent);

      // Get microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true,
        }
      });
      streamRef.current = stream;

      // Setup WebSocket
      const ws = new WebSocket(`wss://api.play.ai/v1/talk/${agent.id}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        // Simple setup as recommended in docs
        ws.send(JSON.stringify({
          type: 'setup',
          apiKey: process.env.NEXT_PUBLIC_APIKey
        }));
      };

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        console.log('Received message type:', message.type, message);
        
        switch (message.type) {
          case 'init':
            console.log('Conversation initialized');
            setIsCallActive(true);
            setIsConnecting(false);
            mediaRecorder.current = new MediaRecorder(streamRef.current, {
              mimeType: 'audio/webm;codecs=opus'
            });

            mediaRecorder.current.ondataavailable = async (event) => {
              if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
                const reader = new FileReader();
                reader.readAsDataURL(event.data);
                reader.onloadend = () => {
                  const base64data = reader.result.split(',')[1];
                  wsRef.current.send(JSON.stringify({
                    type: 'audioIn',
                    data: base64data
                  }));
                };
              }
            };

            mediaRecorder.current.start(250);
            break;

          case 'newAudioStream':
            console.log('New audio stream starting');
            // Clear previous audio data
            sourceBufferRef.current = [];
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.src = '';
              audioRef.current = new Audio();
              audioRef.current.volume = volumeLevel;
            }
            break;

          case 'audioStream':
            try {
              console.log('Received audio chunk, size:', message.data.length);
              
              // Convert base64 to blob
              const binaryString = atob(message.data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              
              sourceBufferRef.current.push(new Blob([bytes], { type: 'audio/mpeg' }));
              
              const blob = new Blob(sourceBufferRef.current, { type: 'audio/mpeg' });
              const audioUrl = URL.createObjectURL(blob);
              
              if (!audioRef.current) {
                audioRef.current = new Audio();
                audioRef.current.volume = volumeLevel;
              }
              
              const oldSrc = audioRef.current.src;
              audioRef.current.src = audioUrl;
              
              // Add event listeners for audio completion
              audioRef.current.onended = () => {
                console.log('Audio playback completed');
              };

              audioRef.current.oncanplay = () => {
                if (oldSrc) {
                  URL.revokeObjectURL(oldSrc);
                }
                console.log('Audio ready to play, starting playback');
                audioRef.current.play().catch(console.error);
              };
            } catch (error) {
              console.error('Error processing audio:', error);
            }
            break;

          case 'voiceActivityStart':
            console.log('AI started speaking');
            if (audioRef.current) {
              audioRef.current.pause();
            }
            break;

          case 'voiceActivityEnd':
            console.log('AI finished speaking');
            break;

          case 'turnEnd':
            console.log('AI turn ended - complete response received');
            break;

          case 'error':
            console.error('WebSocket error:', message);
            cleanupCall();
            break;
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket connection error:', error);
        cleanupCall();
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        cleanupCall();
      };

    } catch (error) {
      console.error('Error setting up call:', error);
      cleanupCall();
    }
  }, [file, pageNumber, isReading, isPaused, handlePauseResume, selectedVoice, isCallActive, cleanupCall, volumeLevel]);

  const handleVolumeChange = useCallback((e) => {
    const newVolume = parseFloat(e.target.value) / 100;
    setVolumeLevel(newVolume);
    
    // Update audio element volume if it exists
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  }, []);

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
        {!isReading && !isCallActive && (
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
          disabled={isCallActive}
          aria-label={isReading ? "Stop reading" : "Read page content"}
        >
          {isReading ? 'Stop Reading' : 'Read'}
        </button>
        {isReading && (
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