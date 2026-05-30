require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ping endpoint for keep-awake
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

// Self-ping mechanism for Render (ping every 14 minutes)
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
setInterval(() => {
    fetch(`${APP_URL}/ping`)
        .then(res => console.log(`[Keep-Awake] Pinged successfully: ${res.status}`))
        .catch(err => console.error(`[Keep-Awake] Ping failed: ${err.message}`));
}, 14 * 60 * 1000); // 14 minutes

// NVIDIA API Proxy Endpoint
app.post('/api/chat', async (req, res) => {
    const { model, messages, temperature, top_p, max_tokens, stream, presence_penalty, frequency_penalty } = req.body;

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'NVIDIA_API_KEY is not configured on the server.' });
    }

    try {
        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: temperature || 0.7,
                top_p: top_p || 0.8,
                max_tokens: max_tokens || 4096,
                stream: stream || false,
                presence_penalty: presence_penalty || 0.0,
                frequency_penalty: frequency_penalty || 0.0
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`NVIDIA API Error (${response.status}): ${errorText}`);
        }

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            response.body.pipe(res);
        } else {
            const data = await response.json();
            res.json(data);
        }
    } catch (error) {
        console.error('Error proxying to NVIDIA:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`NVIDIA Coder Web App running on port ${PORT}`);
    console.log(`Self-ping URL set to: ${APP_URL}`);
});
