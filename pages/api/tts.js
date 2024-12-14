import { Readable } from 'stream';

export const config = {
  api: {
    responseLimit: false,
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('TTS API: Starting request to Play.ai');
    
    const response = await fetch('https://api.play.ai/api/v1/tts/stream', {
      method: 'POST',
      headers: {
        'AUTHORIZATION': process.env.APIKey,
        'X-USER-ID': process.env.UserID,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'PlayDialog',
        text: req.body.text,
        voice: req.body.voice,
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
      throw new Error(`API responded with status: ${response.status}. ${JSON.stringify(errorData)}`);
    }

    // Set response headers
    res.setHeader('Content-Type', 'audio/mpeg');

    // Get the reader from the response body
    const reader = response.body.getReader();

    // Stream the chunks to the response
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        res.end();
        break;
      }
      
      // Write chunk to response
      res.write(Buffer.from(value));
    }

  } catch (error) {
    console.error('TTS API Error:', error);
    res.status(500).json({ error: error.message });
  }
} 