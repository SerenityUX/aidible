"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Document, Page } from "react-pdf";
import { pdfjs } from "react-pdf";
import PDFPage from "./PDFPage";
import styles from "@/styles/components/PDFViewer.module.css";
import PDFTopBar from './PDFTopBar';
import PDFBottomBar from './PDFBottomBar';

// Initialize PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.6.172/legacy/build/pdf.worker.min.js`;

export default function PDFViewer({ file, onClose = () => {} }) {

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
  const ttsAudioRef = useRef(null);
  const callAudioRef = useRef(null);
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
  const [controlsShowReading, setControlsShowReading] = useState(false);
  const [pdfTitle, setPdfTitle] = useState('');
  const chunksReceived = useRef(0);
  const expectedTotalChunks = useRef(0);

  useEffect(() => {
    console.log('Runtime:', {
      isEdge: typeof EdgeRuntime !== 'undefined',
      hasReadableStream: typeof ReadableStream !== 'undefined',
      hasMediaSource: typeof MediaSource !== 'undefined'
    });
  }, []);

  const handlePauseResume = useCallback(() => {
    if (!ttsAudioRef.current) return;

    if (ttsAudioRef.current.paused) {
      ttsAudioRef.current.play();
      setIsPaused(false);
    } else {
      ttsAudioRef.current.pause();
      setIsPaused(true);
    }
  }, []);

  const stopReading = useCallback((preservePauseState = false) => {
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

      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        const currentSrc = ttsAudioRef.current.src;
        ttsAudioRef.current.src = '';
        ttsAudioRef.current.load();
        if (currentSrc) {
          try {
            URL.revokeObjectURL(currentSrc);
          } catch (e) {
            console.warn('URL cleanup error:', e);
          }
        }
        ttsAudioRef.current = null;
      }

      setIsReading(false);
      if (!preservePauseState) {
        console.log('DEBUG: Setting isPaused to false via stopReading');
        setIsPaused(false);
      }
    } catch (error) {
      console.error('Error stopping playback:', error);
      setIsReading(false);
      if (!preservePauseState) {
        console.log('DEBUG: Setting isPaused to false via stopReading error handler');
        setIsPaused(false);
      }
    }
  }, []);

  const setupAudioForPage = useCallback(async (pageNum) => {
    try {
      // Get text from PDF first
      const pdf = await pdfjs.getDocument(file).promise;
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const text = textContent.items.map(item => item.str).join(' ');



      // Then make TTS request
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,  // Now text is defined
          voice: selectedVoice,
          speed: 1.0
        })
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to get audio stream');
      }

      stopReading();

      // Set up MediaSource FIRST
      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;
      ttsAudioRef.current = new Audio();
      ttsAudioRef.current.volume = volumeLevel;
      const sourceUrl = URL.createObjectURL(mediaSource);
      ttsAudioRef.current.src = sourceUrl;

      // THEN get reader
      const reader = response.body.getReader();
      let totalSize = 0;
      
      mediaSource.addEventListener('sourceopen', () => {
        try {
          const sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
          readerRef.current = reader;
          const chunks = [];
          let isFirstChunk = true;
          let isStopped = false;
          let isStreamComplete = false;
          let lastChunkTime = Date.now();
          let isCleaningUp = false;  // Add cleanup state

          const cleanup = () => {
            if (isCleaningUp) return;  // Prevent multiple cleanups
            isCleaningUp = true;
            
            clearInterval(chunkTimeoutChecker);
            isStopped = true;

            try {
              if (readerRef.current) {
                readerRef.current.cancel();
                readerRef.current = null;
              }
            } catch (e) {
              console.warn('Reader cleanup error:', e);
            }
          };

          // Update chunk timeout checker
          const chunkTimeoutChecker = setInterval(() => {
            const timeSinceLastChunk = Date.now() - lastChunkTime;
            if (timeSinceLastChunk > 10000 && !isStreamComplete && !isPaused && !isCleaningUp) {
              console.log('Chunk timeout detected', {
                timeSinceLastChunk,
                isStreamComplete,
                isPaused,
                buffered: sourceBuffer.buffered.length ? 
                  `${sourceBuffer.buffered.start(0)} - ${sourceBuffer.buffered.end(0)}` : 
                  'empty'
              });
              cleanup();
              stopReading();
            }
          }, 1000);

          const appendNextChunk = async () => {
            if (chunks.length === 0 || sourceBuffer.updating || isStopped) return;

            try {
              const chunk = chunks.shift();
              
              // Check for EOF marker
              if (chunk.length === 4 && 
                  chunk[0] === 0xFF && 
                  chunk[1] === 0xFF && 
                  chunk[2] === 0xFF && 
                  chunk[3] === 0xFF) {
                console.log('EOF marker received');
                isStreamComplete = true;
                if (!sourceBuffer.updating && mediaSourceRef.current?.readyState === 'open') {
                  mediaSourceRef.current.endOfStream();
                }
                return;
              }

              // Normal chunk processing
              sourceBuffer.appendBuffer(chunk);
              
              // Start playback on first chunk
              if (isFirstChunk) {
                isFirstChunk = false;
                try {
                  await ttsAudioRef.current?.play();
                  console.log('Started audio playback');
                } catch (error) {
                  if (error.name !== 'AbortError') {
                    console.error('Error starting playback:', error);
                    cleanup();
                    stopReading();
                  }
                  return;
                }
              }

            } catch (error) {
              console.error('Error processing chunk:', error);
              cleanup();
              stopReading();
            }
          };

          // Add updateend event listener
          sourceBuffer.addEventListener('updateend', () => {
            if (!isStopped) {
              appendNextChunk();
            }
          });

          const readChunks = async () => {
            try {
              while (true) {
                const { value, done } = await reader.read();
                
                if (done) {
                  console.log('Done receiving data from server');
                  break;  // Just stop reading more chunks
                }

                if (isCleaningUp) break;  // Stop if cleaning up

                lastChunkTime = Date.now();
                chunks.push(value);
                console.log('Chunk received, length:', value?.length);
                console.log('Chunks in queue:', chunks.length);
                console.log('Source buffer updating:', sourceBuffer.updating);
                console.log('MediaSource readyState:', mediaSource?.readyState);
                console.log('Stream complete:', isStreamComplete);

                if (!sourceBuffer.updating) {
                  appendNextChunk();
                }
              }
            } catch (error) {
              console.error('Streaming error:', error);
              cleanup();
              stopReading();
            }
          };

          // Update audio event handlers
          if (ttsAudioRef.current) {
            ttsAudioRef.current.onplay = () => {
              console.log('Audio playback started');
              setIsReading(true);
            };

            ttsAudioRef.current.onended = async () => {
              if (isCleaningUp) return;
              
              const audioElement = ttsAudioRef.current;
              const buffered = sourceBuffer.buffered;
              const duration = buffered.length ? buffered.end(buffered.length - 1) : 0;
              const currentTime = audioElement?.currentTime || 0;
              
              // If we haven't played through the whole audio yet, resume
              if (currentTime < duration - 0.1) {
                try {
                  await audioElement?.play();
                } catch (error) {
                  if (error.name !== 'AbortError') {
                    console.error('Error restarting playback:', error);
                  }
                }
                return;
              }

              // Only move to next page if we've played through ALL the audio
              if (pageNum < numPages) {
                const nextPageNumber = pageNum + 1;
                setPageNumber(nextPageNumber);
                setupAudioForPage(nextPageNumber);
              } else {
                stopReading();
              }
            };
          }

          readChunks();
        } catch (error) {
          console.error('Error setting up MediaSource:', error);
          stopReading();
        }
      });

      // Update the audio event handlers
      if (ttsAudioRef.current) {
        ttsAudioRef.current.onplay = () => {
          console.log('Audio playback started');
          setIsReading(true);
        };

        ttsAudioRef.current.onended = async () => {
          console.log('Audio playback ended');
          
          // Check if we've actually played through the whole audio
          const audioElement = ttsAudioRef.current;
          const buffered = sourceBuffer.buffered;
          const duration = buffered.length ? buffered.end(0) : 0;
          const currentTime = audioElement?.currentTime || 0;
          const hasPlayedThrough = currentTime >= duration;
          
          if (mediaSource && mediaSource.readyState === 'ended' && isStreamComplete && hasPlayedThrough) {
            console.log('Audio fully played, moving to next page if available', {
              currentTime: audioElement?.currentTime,
              duration: audioElement?.duration
            });
            
            if (pageNum < numPages) {
              const nextPageNumber = pageNum + 1;
              setPageNumber(nextPageNumber);
              setupAudioForPage(nextPageNumber);
            } else {
              stopReading();
            }
          } else {
            console.log('Audio ended but not finished playing through, restarting from current position', {
              currentTime: audioElement?.currentTime,
              duration: audioElement?.duration,
              readyState: mediaSource?.readyState,
              isStreamComplete
            });
            
            try {
              if (audioElement && !isStreamComplete) {
                await audioElement.play();
              }
            } catch (error) {
              if (error.name !== 'AbortError') {
                console.error('Error restarting playback:', error);
              }
            }
          }
        };

        ttsAudioRef.current.onerror = () => {
          const error = ttsAudioRef.current?.error;
          // Only log and stop if it's a real error
          if (error && error.code !== undefined && error.code !== 0) {
            console.error('Audio error:', error);
            stopReading();
          } else {
            console.log('Ignoring non-critical audio error');
          }
        };
      }

    } catch (error) {
      console.error('Error setting up audio for page:', error);
      stopReading();
    }
  }, [file, numPages, selectedVoice, stopReading, volumeLevel, isPaused]);

  const handleReadPage = useCallback(async (e) => {
    e?.preventDefault();
    
    if (isReading) {
      console.log('Stopping current playback');
      stopReading();
      setControlsShowReading(false);
      return;
    }

    setControlsShowReading(true);
    setupAudioForPage(pageNumber);
  }, [isReading, stopReading, pageNumber, setupAudioForPage]);

  const handleDocumentLoadSuccess = useCallback(async ({ numPages }) => {
    stopReading();
    setNumPages(numPages);
    setPageNumber(1);
    setError(null);
    
    try {
      const pdf = await pdfjs.getDocument(file).promise;
      const metadata = await pdf.getMetadata();
      
      // Get title from metadata, or fall back to filename
      let title = metadata?.info?.Title;
      
      if (!title) {
        // If file is a Blob/File object, use its name
        if (file instanceof Blob) {
          title = file.name;
        } 
        // If file is a URL/string, extract filename
        else if (typeof file === 'string') {
          const urlParts = file.split('/');
          title = urlParts[urlParts.length - 1];
        }
      }
      
      setPdfTitle(title || 'Untitled PDF');
    } catch (error) {
      console.warn('Error getting PDF title:', error);
      setPdfTitle('Untitled PDF');
    }
  }, [file, stopReading]);

  const handleDocumentLoadError = useCallback((error) => {
    stopReading();
    console.error("Error loading PDF:", error);
    setError(error);
  }, [stopReading]);

  const changePage = useCallback((e, offset) => {
    e.preventDefault();
    stopReading();
    setControlsShowReading(false);
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
      case ' ': // Space key
        e.preventDefault(); // Prevent page scrolling
        if (isReading) {
          handlePauseResume();
        } else {
          handleReadPage(e);
        }
        break;
    }
  }, [pageNumber, numPages, changePage, isReading, handlePauseResume, handleReadPage]);

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
      if (mediaSourceRef.current) {
        try {
          URL.revokeObjectURL(ttsAudioRef.current?.src);
        } catch (e) {
          console.warn('URL cleanup error:', e);
        }
      }
    };
  }, [stopReading]);

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

      // Clear only call audio
      if (callAudioRef.current) {
        callAudioRef.current.pause();
        const currentSrc = callAudioRef.current.src;
        callAudioRef.current.src = '';
        callAudioRef.current.load();
        if (currentSrc) {
          URL.revokeObjectURL(currentSrc);
        }
        callAudioRef.current = null;
      }

      // Reset request ID
      currentRequestIdRef.current = '';

      // Reset call states only
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
    // Pause reading immediately when call button is clicked
    if (isReading && !isPaused) {
      handlePauseResume();
    }

    if (isCallActive) {
      cleanupCall();
      return;
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

      // In the handleCall function, before setting up WebSocket
      const authResponse = await fetch('/api/websocket-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!authResponse.ok) {
        throw new Error('Failed to get WebSocket authentication');
      }

      const { apiKey: tempToken } = await authResponse.json();

      // Setup WebSocket
      const ws = new WebSocket(`wss://api.play.ai/v1/talk/${agent.id}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        ws.send(JSON.stringify({
          type: 'setup',
          apiKey: tempToken
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
            if (isReading && !isPaused) {
              console.log('DEBUG: Setting isPaused to true via WebSocket init');
              setIsPaused(true);
            }
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
            // Clear previous audio data for AI response
            sourceBufferRef.current = [];
            // Create a new audio element only for AI responses
            if (!callAudioRef.current || !isReading) {
              callAudioRef.current = new Audio();
              callAudioRef.current.volume = volumeLevel;
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
              
              if (!callAudioRef.current) {
                callAudioRef.current = new Audio();
                callAudioRef.current.volume = volumeLevel;
              }
              
              const oldSrc = callAudioRef.current.src;
              callAudioRef.current.src = audioUrl;
              
              callAudioRef.current.onended = () => {
                console.log('Call audio playback completed');
              };

              callAudioRef.current.oncanplay = () => {
                if (oldSrc) {
                  URL.revokeObjectURL(oldSrc);
                }
                // Always play call audio, regardless of TTS pause state
                callAudioRef.current.play().catch(console.error);
              };
            } catch (error) {
              console.error('Error processing call audio:', error);
            }
            break;

          case 'voiceActivityStart':
            console.log('AI started speaking');
            if (ttsAudioRef.current && !isPaused) {
              ttsAudioRef.current.pause();
              console.log('DEBUG: Setting isPaused to true via voiceActivityStart');
              setIsPaused(true);
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
    if (ttsAudioRef.current) {
      ttsAudioRef.current.volume = newVolume;
    }
  }, []);

  const handleClose = useCallback(() => {
    stopReading(); // Stop any audio playback
    onClose(); // Only call if provided
  }, [stopReading, onClose]);

  useEffect(() => {
    console.log('DEBUG: isPaused state changed to:', isPaused);
  }, [isPaused]);

  if (error) {
    return <div>Error loading PDF: {error.message}</div>;
  }

  return (
    <div className={styles.mainContainer}>
      <PDFTopBar 
        pdfTitle={pdfTitle} 
        onClose={handleClose}
        stopPlaying={stopReading}
        setControlsShowReading={setControlsShowReading}
      />
      <div className={styles.pdfContainer}>
        <div className={styles.contentWrapper}>
          <Document
            file={file}
            onLoadSuccess={handleDocumentLoadSuccess}
            onLoadError={handleDocumentLoadError}
            loading={<div></div>}
          >
            <PDFPage pageNumber={pageNumber} />
          </Document>
        </div>
      </div>
      <PDFBottomBar 
        pageNumber={pageNumber}
        numPages={numPages}
        changePage={changePage}
        controlsShowReading={controlsShowReading}
        isCallActive={isCallActive}
        selectedVoice={selectedVoice}
        handleVoiceChange={handleVoiceChange}
        handleReadPage={handleReadPage}
        handlePauseResume={handlePauseResume}
        isPaused={isPaused}
        handleCall={handleCall}
        isConnecting={isConnecting}
        volumeLevel={volumeLevel}
        handleVolumeChange={handleVolumeChange}
        voices={voices}
        stopReading={() => {
          stopReading();
          setControlsShowReading(false);
        }}
      />
    </div>
  );
} 