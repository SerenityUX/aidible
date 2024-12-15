export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Return the API key from server-side environment variable
    return res.status(200).json({ 
      apiKey: process.env.APIKey 
    });
  } catch (error) {
    console.error('Error getting WebSocket auth:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 