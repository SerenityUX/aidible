export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { voice, voiceName, pageText } = req.body;
    
    console.log('Creating agent with voice:', voice);

    const response = await fetch('https://api.play.ai/api/v1/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'AUTHORIZATION': `${process.env.APIKey}`,
        'X-USER-ID': process.env.UserID
      },
      body: JSON.stringify({
        voice: voice,
        displayName: voiceName,
        description: `AI Assistant helping with document understanding`,
        visibility: 'private',
        answerOnlyFromCriticalKnowledge: true,
        voiceSpeed: 1.0,
        greeting: `Hey, ${voiceName} here. How can I help you understand this page?`,
        prompt: `You are a helpful assistant named ${voiceName}. Your role is to help users understand the content of a document. Be friendly and professional.`,
        criticalKnowledge: pageText.substring(0, 200000)
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('API Error Response:', error);
      throw new Error(error.message || 'Failed to create agent');
    }

    const agent = await response.json();
    console.log('Agent created successfully:', agent.id);
    res.status(201).json(agent);
  } catch (error) {
    console.error('Error in agent creation:', error);
    res.status(500).json({ error: error.message });
  }
}