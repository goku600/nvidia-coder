export const config = {
    maxDuration: 60 // 60 seconds timeout
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const appPassword = process.env.APP_PASSWORD;
    const providedPassword = req.headers['x-app-password'];
    if (appPassword && providedPassword !== appPassword) {
        return res.status(401).json({ error: 'Unauthorized: Incorrect Passcode' });
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'NVIDIA_API_KEY environment variable is missing in Vercel' });
    }

    try {
        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(req.body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({ error: `NVIDIA API Error: ${errorText}` });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const reader = response.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
        }
        res.end();

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
