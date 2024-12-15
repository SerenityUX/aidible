import { Readable } from 'stream';

export const config = {
  api: {
    responseLimit: false,
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

// Helper function to split text into chunks of roughly 3 sentences
function splitIntoChunks(text) {
  // Split on periods followed by spaces or newlines, but keep the periods
  const sentences = text.match(/[^.!?]+[.!?]+[\s\n]*/g) || [];
  const chunks = [];
  let currentChunk = [];

  for (const sentence of sentences) {
    currentChunk.push(sentence);
    // Create a new chunk after 3 sentences or if current chunk is getting too long
    if (currentChunk.length >= 3 || currentChunk.join('').length > 500) {
      chunks.push(currentChunk.join('').trim());
      currentChunk = [];
    }
  }
  
  // Add any remaining sentences
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('').trim());
  }

  return chunks;
}

async function getAudioForChunk(chunk, voice) {
  const response = await fetch('https://api.play.ai/api/v1/tts/stream', {
    method: 'POST',
    headers: {
      'AUTHORIZATION': process.env.APIKey,
      'X-USER-ID': process.env.UserID,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'PlayDialog',
      text: chunk,
      voice: voice,
      outputFormat: 'mp3',
      speed: 1,
      sampleRate: 24000,
      seed: null,
      temperature: null,
      language: 'english'
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Play.ai API Error:', {
      status: response.status,
      statusText: response.statusText,
      error: errorData
    });
  }

  return response;
}

// Add delay helper
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Helper to estimate audio duration from chunk size
function estimateAudioDuration(chunkSize) {
  // MP3 bitrate is typically 128kbps = 16KB/s
  // So 16KB = 1 second of audio
  return (chunkSize / 16000); // Returns duration in seconds
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('TTS API: Starting request to Play.ai');
    
    const textChunks = splitIntoChunks(req.body.text);
    
    res.setHeader('Content-Type', 'audio/mpeg');

    let totalDuration = 0;

    for (const chunk of textChunks) {
      console.log('Processing chunk:', chunk.substring(0, 50) + '...');
      
      const response = await getAudioForChunk(chunk, req.body.voice);
      const reader = response.body.getReader();
      let chunkBuffer = [];

      // First collect all the data for this audio segment
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunkBuffer.push(value);
      }

      // Calculate total size and estimated duration
      const totalSize = chunkBuffer.reduce((sum, arr) => sum + arr.length, 0);
      const estimatedDuration = estimateAudioDuration(totalSize);
      totalDuration += estimatedDuration;

      // Now stream the data with controlled delays
      for (const buffer of chunkBuffer) {
        // Add delay proportional to the buffer size
        const bufferDuration = estimateAudioDuration(buffer.length);
        await delay(bufferDuration * 500); // Wait for half the estimated play time
        res.write(Buffer.from(buffer));
      }

      // Add delay between chunks
      await delay(1000); // 1 second between chunks
    }

    // Add final delay proportional to total audio length
    await delay(Math.min(totalDuration * 1000, 5000)); // Cap at 5 seconds
    res.end();

  } catch (error) {
    console.error('TTS API Error:', error);
    res.status(500).json({ error: error.message });
  }
} 