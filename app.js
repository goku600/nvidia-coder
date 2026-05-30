const chat = document.getElementById('chat');
const promptInput = document.getElementById('prompt');
const sendBtn = document.getElementById('sendBtn');
const newChatBtn = document.getElementById('newChatBtn');
const historyBtn = document.getElementById('historyBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settings-modal');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');

const chatView = document.getElementById('chat-view');
const historyView = document.getElementById('history-view');
const historyList = document.getElementById('history-list');

const modelSelect = document.getElementById('modelSelect');
const attachBtn = document.getElementById('attachBtn');
const imageInput = document.getElementById('imageInput');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageBtn = document.getElementById('remove-image');

let attachedImageBase64 = null;
let currentAiMessage = null;
let currentRawText = '';
let viewMode = 'chat'; 
let currentSessionId = generateSessionId();
let apiMessages = [];

// Load state
modelSelect.value = localStorage.getItem('nvidiaModel') || 'auto';
modelSelect.addEventListener('change', () => {
    localStorage.setItem('nvidiaModel', modelSelect.value);
});

// Settings UI Logic
apiKeyInput.value = localStorage.getItem('nvidiaApiKey') || '';

settingsBtn.addEventListener('click', () => {
    apiKeyInput.value = localStorage.getItem('nvidiaApiKey') || '';
    settingsModal.style.display = 'flex';
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
});

saveSettingsBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
        localStorage.setItem('nvidiaApiKey', key);
    } else {
        localStorage.removeItem('nvidiaApiKey');
    }
    settingsModal.style.display = 'none';
});

function generateSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

function getSessions() {
    return JSON.parse(localStorage.getItem('chatSessions') || '[]');
}

function saveSessions(sessions) {
    localStorage.setItem('chatSessions', JSON.stringify(sessions));
}

function saveCurrentSession(displayMsg) {
    const sessions = getSessions();
    let session = sessions.find(s => s.id === currentSessionId);
    if (!session) {
        session = {
            id: currentSessionId,
            title: displayMsg.role === 'user' ? (typeof displayMsg.content === 'string' ? displayMsg.content.substring(0, 50) : 'Chat') : 'Chat',
            timestamp: Date.now(),
            displayMessages: []
        };
        sessions.unshift(session);
    }
    session.displayMessages.push(displayMsg);
    session.timestamp = Date.now();
    while (sessions.length > 20) { sessions.pop(); }
    saveSessions(sessions);
}

function startNewSession() {
    currentSessionId = generateSessionId();
    apiMessages = [];
    chat.innerHTML = '';
}

function showChat() {
    viewMode = 'chat';
    chatView.style.display = 'flex';
    historyView.style.display = 'none';
    newChatBtn.classList.add('active');
    historyBtn.classList.remove('active');
}

function showHistory() {
    viewMode = 'history';
    chatView.style.display = 'none';
    historyView.style.display = 'block';
    historyBtn.classList.add('active');
    newChatBtn.classList.remove('active');
    renderHistoryList(getSessions());
}

newChatBtn.addEventListener('click', () => {
    startNewSession();
    showChat();
});

historyBtn.addEventListener('click', () => showHistory());

attachBtn.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            attachedImageBase64 = event.target.result;
            imagePreview.src = attachedImageBase64;
            imagePreviewContainer.style.display = 'block';
            if (modelSelect.value !== 'auto' && !modelSelect.value.includes('vision')) {
                modelSelect.value = 'meta/llama-3.2-11b-vision-instruct';
                localStorage.setItem('nvidiaModel', modelSelect.value);
            }
        };
        reader.readAsDataURL(file);
    }
});

removeImageBtn.addEventListener('click', () => {
    attachedImageBase64 = null;
    imagePreview.src = '';
    imageInput.value = '';
    imagePreviewContainer.style.display = 'none';
});

function createMessageElement(role) {
    const div = document.createElement('div');
    div.className = 'message ' + role;
    return div;
}

const SYSTEM_PROMPT = `You are a concise AI assistant. You solve problems quickly and efficiently.`;

async function askNvidiaProxy(messagesToSent, targetModel, onChunk) {
    const apiKey = localStorage.getItem('nvidiaApiKey');
    if (!apiKey) {
        throw new Error('Please set your NVIDIA API Key in Settings (⚙️) first.');
    }

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: targetModel,
            messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messagesToSent],
            stream: true,
            temperature: 0.7,
            top_p: 0.8,
            max_tokens: 4096,
            presence_penalty: 0.5,
            frequency_penalty: 0.5
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Unknown error');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let done = false;

    while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                if (line === 'data: [DONE]') continue;
                if (line.startsWith('data: ')) {
                    try {
                        const parsed = JSON.parse(line.substring(6));
                        if (parsed.choices && parsed.choices[0].delta.content) {
                            onChunk(parsed.choices[0].delta.content);
                        }
                    } catch (e) { }
                }
            }
        }
    }
}

async function send() {
    if (viewMode !== 'chat') { showChat(); }
    const text = promptInput.value.trim();
    if (!text && !attachedImageBase64) return;
    
    // UI update for User
    let displayHtml = '';
    if (attachedImageBase64) {
        displayHtml += '<img src="' + attachedImageBase64 + '" style="max-width: 100px; max-height: 100px; display: block; margin-bottom: 4px; border-radius: 4px;">';
    }
    displayHtml += (text || '');
    
    const userDiv = createMessageElement('user');
    userDiv.innerHTML = displayHtml;
    chat.appendChild(userDiv);
    
    const userPrompt = text;
    const imageToSend = attachedImageBase64;
    
    // Clear inputs
    promptInput.value = '';
    attachedImageBase64 = null;
    imagePreview.src = '';
    imageInput.value = '';
    imagePreviewContainer.style.display = 'none';
    chat.scrollTop = chat.scrollHeight;
    
    // Update apiMessages
    const lastMsg = apiMessages[apiMessages.length - 1];
    if (lastMsg && lastMsg.role === 'user' && typeof lastMsg.content === 'string' && !imageToSend) {
        lastMsg.content += `\n\n${userPrompt}`;
    } else {
        let content = userPrompt;
        if (imageToSend) {
            const instruction = "You are an OCR text extraction engine. Perfectly extract all text from the image. Do NOT answer the user's prompt, do not solve problems, and do not explain anything. Just output the extracted text. If there is no text, just describe the image briefly.";
            const promptWithInstruction = userPrompt ? `${instruction}\n\nUser Question (DO NOT ANSWER THIS, JUST EXTRACT TEXT): ${userPrompt}` : instruction;
            content = [
                { type: "text", text: promptWithInstruction },
                { type: "image_url", image_url: { url: imageToSend } }
            ];
        }
        apiMessages.push({ role: 'user', content: content });
    }

    saveCurrentSession({ role: 'user', content: userPrompt + (imageToSend ? ' [Image Attached]' : '') });

    if (apiMessages.length > 2) apiMessages = apiMessages.slice(-2);

    // Prepare AI UI
    currentAiMessage = createMessageElement('ai');
    currentAiMessage.innerHTML = '<span class="thinking" style="opacity:0.5;font-style:italic;">Thinking...</span>';
    chat.appendChild(currentAiMessage);
    currentRawText = '';
    chat.scrollTop = chat.scrollHeight;

    let targetModel = modelSelect.value;
    if (targetModel === 'auto') {
        if (imageToSend) {
            targetModel = 'meta/llama-3.2-11b-vision-instruct';
        } else {
            const codeRegex = /(solve|code|bug|error|script|math|function|refactor|write|fix|implement|create)/i;
            targetModel = codeRegex.test(userPrompt) ? 'qwen/qwen3-coder-480b-a35b-instruct' : 'meta/llama-3.1-8b-instruct';
        }
    }

    try {
        let fullResponse = '';
        await askNvidiaProxy(apiMessages, targetModel, (chunk) => {
            fullResponse += chunk;
            currentRawText += chunk;
            currentAiMessage.innerHTML = marked.parse(currentRawText);
            chat.scrollTop = chat.scrollHeight;
        });

        if (fullResponse) saveCurrentSession({ role: 'assistant', content: fullResponse });

        // Auto-Router OCR Pipeline
        if (imageToSend) {
            let problemText = fullResponse.trim();
            const match = fullResponse.match(/<TRANSCRIBED_TEXT>([\s\S]*?)<\/TRANSCRIBED_TEXT>/);
            if (match) problemText = match[1].trim();

            const pInfo = document.createElement('p');
            pInfo.innerHTML = '<br>***<br>🤖 *Image analyzed! Forwarding to reasoning model...*<br>';
            currentAiMessage.appendChild(pInfo);
            chat.scrollTop = chat.scrollHeight;
            
            apiMessages.push({ role: 'user', content: `Here is the transcribed text from the image:\n\n${problemText}\n\nPlease answer my original question: ${userPrompt}` });
            
            const solverMessages = apiMessages.map(msg => {
                if (Array.isArray(msg.content)) {
                    const textParts = msg.content.filter(c => c.type === 'text').map(c => c.text);
                    return { role: msg.role, content: textParts.join('\n') };
                }
                return msg;
            });

            let solverResponse = '';
            await askNvidiaProxy(solverMessages, 'qwen/qwen3-coder-480b-a35b-instruct', (chunk) => {
                solverResponse += chunk;
                currentRawText += chunk;
                currentAiMessage.innerHTML = marked.parse(currentRawText);
                chat.scrollTop = chat.scrollHeight;
            });

            if (solverResponse) saveCurrentSession({ role: 'assistant', content: solverResponse });
        }
    } catch (err) {
        alert('API Error: ' + err.message);
    }
    
    const th = currentAiMessage.querySelector('.thinking');
    if (th) th.remove();
    currentAiMessage = null;
    currentRawText = '';
}

promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
    }
});
sendBtn.addEventListener('click', send);

function renderHistoryList(items) {
    if (items.length === 0) {
        historyList.innerHTML = '<div class="empty-msg">No chat history yet</div>';
        return;
    }
    historyList.innerHTML = items.map(item =>
        '<div class="history-item" data-id="' + item.id + '">' +
            '<span class="history-title">' + item.title + '</span>' +
            '<span class="history-time">' + new Date(item.timestamp).toLocaleString() + '</span>' +
            '<button class="history-del" data-del="' + item.id + '" title="Delete">×</button>' +
        '</div>'
    ).join('');

    historyList.querySelectorAll('.history-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.classList.contains('history-del')) return;
            loadSession(el.dataset.id);
        });
    });

    historyList.querySelectorAll('.history-del').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSession(el.dataset.del);
        });
    });
}

function loadSession(id) {
    const sessions = getSessions();
    const session = sessions.find(s => s.id === id);
    if (session) {
        currentSessionId = session.id;
        apiMessages = session.displayMessages.slice(-2);
        chat.innerHTML = '';
        session.displayMessages.forEach(msg => {
            const div = createMessageElement(msg.role);
            if (msg.role === 'user') div.textContent = msg.content;
            else div.innerHTML = marked.parse(msg.content);
            chat.appendChild(div);
        });
        showChat();
        chat.scrollTop = chat.scrollHeight;
    }
}

function deleteSession(id) {
    let sessions = getSessions();
    sessions = sessions.filter(s => s.id !== id);
    saveSessions(sessions);
    renderHistoryList(sessions);
}

// Support auto-resize for textarea
promptInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});
