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
        sampleRate: 16000,
        bitrate: 64000,
        quality: 'low',
        language: 'english'
      })
    });

    if (!response.ok) {
      throw new Error(`Play.ai API error: ${response.status}`);
    }

    // Get the audio data
    const audioData = await response.arrayBuffer();

    // Set appropriate headers
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioData.byteLength);

    // Send the audio data
    res.send(Buffer.from(audioData));

  } catch (error) {
    console.error('TTS API Error:', error);
    res.status(500).json({ error: error.message });
  }
} 