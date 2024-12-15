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

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Play.ai uses 24kHz sample rate, roughly 3KB/s for speech
function estimateChunkDuration(chunkSize) {
  return (chunkSize / 3000) * 1000; // Convert to milliseconds
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('TTS API: Starting request to Play.ai');
    
    const textChunks = splitIntoChunks(req.body.text);
    
    res.setHeader('Content-Type', 'audio/mpeg');

    // Process each chunk sequentially with much longer delays
    for (const chunk of textChunks) {
      console.log('Processing chunk:', chunk.substring(0, 50) + '...');
      
      const response = await getAudioForChunk(chunk, req.body.voice);
      const reader = response.body.getReader();

      // Stream this chunk's audio to the response with longer delays
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          // Much longer delay between chunks - 2 seconds
          await delay(2000);
          break;
        }
        
        // Write chunk to response
        res.write(Buffer.from(value));

        // Add delay based on chunk size
        const chunkDuration = estimateChunkDuration(value.length);
        await delay(chunkDuration); // Wait approximately the full duration
      }
    }

    // Add longer final delay - 5 seconds
    await delay(5000);
    res.end();

  } catch (error) {
    console.error('TTS API Error:', error);
    res.status(500).json({ error: error.message });
  }
} 