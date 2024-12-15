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

// Add this helper function at the top level
const MIN_SENTENCE_LENGTH = 50; // Minimum characters for a "full" sentence

// Add this constant at the top
const PRELOAD_AHEAD = 3; // Number of sentences to prepare in advance

const groupSentences = (sentences) => {
  const groups = [];
  let currentGroup = [];
  let currentLength = 0;

  sentences.forEach((sentence) => {
    const trimmedSentence = sentence.trim();
    
    // Skip empty or whitespace-only sentences
    if (!trimmedSentence) return;

    // If it's a very short sentence or just a title/header (no punctuation)
    if (trimmedSentence.length < MIN_SENTENCE_LENGTH || !trimmedSentence.match(/[.!?]$/)) {
      currentGroup.push(trimmedSentence);
      currentLength += trimmedSentence.length;
    } else {
      // If we have pending short sentences, add this one and push the group
      if (currentGroup.length > 0) {
        currentGroup.push(trimmedSentence);
        groups.push(currentGroup.join(' '));
        currentGroup = [];
        currentLength = 0;
      } else {
        // It's a normal length sentence, push it as its own group
        groups.push(trimmedSentence);
      }
    }
  });

  // Add any remaining sentences
  if (currentGroup.length > 0) {
    groups.push(currentGroup.join(' '));
  }

  return groups;
};

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

      // Split text into sentences and group them
      const rawSentences = text.match(/[^.!?]+[.!?]+[\s\n]*/g) || [];
      const sentences = groupSentences(rawSentences);
      console.log(`Found ${sentences.length} sentence groups`);
      
      if (sentences.length === 0) {
        console.error('No sentences found in text');
        return;
      }

      // Get and play first sentence
      const firstSentence = sentences[0].trim();
      console.log('Getting audio for first sentence:', firstSentence.substring(0, 50) + '...');

      let currentSentenceIndex = 0;
      let preparedAudioData = []; // Array to store prepared audio
      let isGettingNextAudio = false;

      // Function to fetch audio for a sentence
      const getAudioForSentence = async (sentence) => {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: sentence,
            voice: selectedVoice,
            speed: 1.0
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to get audio: ${response.status}`);
        }

        return await response.arrayBuffer();
      };

      // Modified function to prepare multiple sentences ahead
      const prepareNextSentences = async () => {
        if (!isGettingNextAudio) {
          isGettingNextAudio = true;
          try {
            // Keep preparing until we have PRELOAD_AHEAD sentences ready or reach the end
            while (preparedAudioData.length < PRELOAD_AHEAD && 
                   currentSentenceIndex + preparedAudioData.length < sentences.length) {
              
              const nextIndex = currentSentenceIndex + preparedAudioData.length;
              const nextSentence = sentences[nextIndex].trim();
              console.log(`Preparing sentence ${nextIndex + 1}:`, nextSentence.substring(0, 50) + '...');
              
              const audioData = await getAudioForSentence(nextSentence);
              preparedAudioData.push(audioData);
              console.log(`Prepared sentence ${nextIndex + 1}, ${preparedAudioData.length} sentences ready`);
            }
          } catch (error) {
            console.error('Error preparing sentences:', error);
          }
          isGettingNextAudio = false;
        }
      };

      // Modified playSentence function
      const playSentence = async (audioData) => {
        const audio = new Audio();
        audio.volume = volumeLevel;

        const blob = new Blob([audioData], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);

        audio.oncanplay = () => {
          console.log(`Playing sentence ${currentSentenceIndex + 1}/${sentences.length}`);
          audio.play()
            .then(() => {
              setIsReading(true);
              isPlayingRef.current = true;
              // Start preparing more sentences
              prepareNextSentences();
            })
            .catch(err => {
              console.error('Play failed:', err);
              URL.revokeObjectURL(url);
              stopReading();
            });
        };

        audio.onended = async () => {
          console.log(`Finished sentence ${currentSentenceIndex + 1}`);
          URL.revokeObjectURL(url);
          
          currentSentenceIndex++;
          
          if (currentSentenceIndex < sentences.length) {
            if (preparedAudioData.length > 0) {
              // Play the next prepared sentence
              const nextAudioData = preparedAudioData.shift();
              await playSentence(nextAudioData);
              // Keep preparing more sentences
              prepareNextSentences();
            } else {
              // If no prepared sentences available, get the next one
              try {
                const nextSentence = sentences[currentSentenceIndex].trim();
                const nextAudio = await getAudioForSentence(nextSentence);
                await playSentence(nextAudio);
              } catch (error) {
                console.error('Error getting next sentence:', error);
                stopReading();
              }
            }
          } else {
            // Move to next page or stop
            if (pageNum < numPages) {
              const nextPageNumber = pageNum + 1;
              setPageNumber(nextPageNumber);
              setupAudioForPage(nextPageNumber);
            } else {
              stopReading();
            }
          }
        };

        audio.onerror = (e) => {
          console.error('Audio error:', e, audio?.error);
          URL.revokeObjectURL(url);
          stopReading();
        };

        ttsAudioRef.current = audio;
        audio.src = url;
      };

      // Start with first sentence and prepare others
      const firstAudioData = await getAudioForSentence(firstSentence);
      prepareNextSentences(); // Start preparing next sentences right away
      await playSentence(firstAudioData);

    } catch (error) {
      console.error('Error setting up audio:', error);
      stopReading();
    }
  }, [file, numPages, selectedVoice, stopReading, volumeLevel]);

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