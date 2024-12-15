export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { voice, voiceName, pageText, documentTitle, currentPage, totalPages } = req.body;
    
    console.log('Creating agent with voice:', voice);

    const systemPrompt = `You are an AI assistant helping to read and discuss a PDF document titled "${documentTitle}". 
We are currently on page ${currentPage} of ${totalPages}.

The text on the current page is:
${pageText}

Please help answer any questions about this content. You can reference the document title and page number in your responses when relevant.`;

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
        greeting: `Hey ${voiceName} here! I'm seeing this document you have pulled up here, how can I help?`,
        answerOnlyFromCriticalKnowledge: true,
        voiceSpeed: 1.0,
        prompt: systemPrompt,
        criticalKnowledge: pageText.substring(0, 20000)
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