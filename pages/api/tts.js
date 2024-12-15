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
  console.log('Requesting audio for:', chunk.substring(0, 50) + '...');
  
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
      language: 'english'
    })
  });

  if (!response.ok) {
    console.error('Play.ai API Error:', {
      status: response.status,
      statusText: response.statusText
    });
    throw new Error('Failed to get audio stream');
  }

  // Log the response headers to debug
  console.log('Play.ai response headers:', Object.fromEntries([...response.headers]));
  return response;
}

// Helper to estimate speech duration based on text length
function estimateTextDuration(text) {
  const words = text.split(/\s+/).length;
  const wordsPerMinute = 260; // Average speech rate
  return (words / wordsPerMinute) * 60 * 1000; // Convert to milliseconds
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('TTS API: Starting request');
    
    const response = await getAudioForChunk(req.body.text, req.body.voice);
    
    // Get the audio data as a buffer first
    const audioData = await response.arrayBuffer();
    console.log('Received audio data, size:', audioData.byteLength);

    // Send it as one piece
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioData.byteLength);
    res.send(Buffer.from(audioData));

  } catch (error) {
    console.error('TTS API Error:', error);
    res.status(500).json({ error: error.message });
  }
} 