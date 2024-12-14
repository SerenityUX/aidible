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
  }, [file, pageNumber, isReading, stopReading, selectedVoice]);

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
        {!isReading && (
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
      </div>
    </div>
  );
} 