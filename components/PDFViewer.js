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
  const audioRef = useRef(new Audio());

  const stopReading = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setIsReading(false);
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
          voice: voices[0].value,
          speed: 1.0
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get audio stream');
      }

      // Clean up previous audio
      if (audioRef.current) {
        console.log('Cleaning up previous audio element');
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
        audioRef.current = new Audio();
      }

      // Create a MediaSource
      const mediaSource = new MediaSource();
      const sourceUrl = URL.createObjectURL(mediaSource);
      audioRef.current.src = sourceUrl;

      mediaSource.addEventListener('sourceopen', () => {
        const sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
        const reader = response.body.getReader();
        const chunks = [];
        let isFirstChunk = true;

        // Function to append a chunk to the source buffer
        const appendNextChunk = async () => {
          if (chunks.length === 0 || sourceBuffer.updating) return;

          try {
            const chunk = chunks.shift();
            sourceBuffer.appendBuffer(chunk);

            // Start playing after first chunk is appended
            if (isFirstChunk) {
              isFirstChunk = false;
              audioRef.current.play().catch(console.error);
            }
          } catch (error) {
            console.error('Error appending chunk:', error);
          }
        };

        // Listen for when the buffer finishes updating
        sourceBuffer.addEventListener('updateend', () => {
          appendNextChunk();
        });

        // Read chunks
        const readChunks = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                // No more chunks to read
                if (chunks.length === 0 && !sourceBuffer.updating) {
                  mediaSource.endOfStream();
                }
                break;
              }

              chunks.push(value);
              if (!sourceBuffer.updating) {
                appendNextChunk();
              }
            }
          } catch (error) {
            console.error('Streaming error:', error);
            mediaSource.endOfStream('error');
          }
        };

        readChunks();
      });

      // Set up event listeners
      audioRef.current.onplay = () => {
        console.log('Audio playback started');
        setIsReading(true);
      };

      audioRef.current.onended = () => {
        console.log('Audio playback ended');
        setIsReading(false);
        URL.revokeObjectURL(sourceUrl);
      };

      audioRef.current.onerror = (e) => {
        console.error('Audio playback error:', {
          error: e,
          errorCode: audioRef.current.error?.code,
          errorMessage: audioRef.current.error?.message
        });
        setIsReading(false);
        URL.revokeObjectURL(sourceUrl);
      };

    } catch (error) {
      console.error('Error reading PDF text:', error);
      setIsReading(false);
    }
  }, [file, pageNumber, isReading, stopReading]);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopReading();
    };
  }, [stopReading]);

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
        <button 
          className={styles.button}
          onClick={handleReadPage}
          type="button"
          aria-label={isReading ? "Stop reading" : "Read page content"}
        >
          {isReading ? 'Stop Reading' : 'Read'}
        </button>
      </div>
    </div>
  );
} 