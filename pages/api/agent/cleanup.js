export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Add any specific cleanup logic here if needed
    // For example, you might want to call Play.ai's API to terminate the agent session
    
    return res.status(200).json({ message: 'Cleanup successful' });
  } catch (error) {
    console.error('Cleanup error:', error);
    return res.status(500).json({ error: 'Failed to cleanup agent' });
  }
} 