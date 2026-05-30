export const config = {
    runtime: 'edge', // Edge functions are faster and perfect for streaming proxy
};

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'NVIDIA_API_KEY environment variable is missing in Vercel' }), { status: 500 });
    }

    try {
        const body = await req.json();

        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            return new Response(JSON.stringify({ error: `NVIDIA API Error: ${errorText}` }), { status: response.status });
        }

        // Proxy the stream back to the client directly!
        return new Response(response.body, {
            status: response.status,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
