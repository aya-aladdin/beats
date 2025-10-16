document.addEventListener('DOMContentLoaded', () => {
    const output = document.getElementById('output');
    const inputLine = document.getElementById('input-line');
    const inputWrapper = document.getElementById('input-wrapper');
    const terminal = document.getElementById('terminal');
    const hiddenInput = document.getElementById('hidden-input');

    // --- State Management ---
    let state = {
        appState: 'login', // login, menu, chat, profile, beats, persona
        subState: 'prompt', // For multi-step inputs like username/password
        tempData: {}, // To hold username during login flow
        isExecuting: false,
        currentUser: null, // { username, chats_sent, beats, roleplay_unlocked }
        commandHistory: [],
        historyIndex: -1,
        currentInput: "",
        abortController: new AbortController(),
    };

    const PROMPT = `&gt;`;

    // --- Core Functions ---

    const focusInput = () => hiddenInput.focus();
    terminal.addEventListener('click', () => {
        if (window.getSelection().toString().length === 0) focusInput();
    });

    const type = async (text, delay = 20) => {
        const element = createResponseElement();
        for (let i = 0; i < text.length; i++) {
            // This check is for masking the "Enter password:" prompt itself if we wanted to, but it's not what we need for live input masking.
            const char = (state.appState === 'login' && (state.subState === 'password' || state.subState === 'register_password')) ? '*' : text.charAt(i);
            element.innerHTML += char;
            terminal.scrollTop = terminal.scrollHeight;
            await new Promise(resolve => setTimeout(resolve, Math.random() * delay));
        }
        return element;
    };

    const processCommand = async (command) => {
        state.isExecuting = true;
        const displayCommand = (state.appState === 'login' && (state.subState === 'password' || state.subState === 'register_password')) ? command.replace(/./g, '*') : command;
        addToOutput(`${PROMPT} ${displayCommand}`);

        if (command.trim() !== '' && state.appState === 'chat') {
            state.commandHistory.unshift(command);
            state.historyIndex = -1;
        }
        
        // State-based command processing
        switch (state.appState) {
            case 'login': await handleLogin(command); break;
            case 'menu': await handleMenu(command); break;
            case 'chat': await handleChat(command); break;
            case 'profile': await handleProfile(command); break;
            case 'beats': await handleBeats(command); break;
            case 'persona': await handlePersona(command); break;
        }

        state.currentInput = "";
        inputLine.textContent = "";
        state.isExecuting = false;
        if (state.appState !== 'login' || state.subState === 'prompt') {
             inputWrapper.style.display = 'flex';
        }
    };

    // --- State Handlers ---

    async function showLoginScreen() {
        state.appState = 'login';
        state.subState = 'prompt';
        state.currentUser = null;
        clearScreen();
        await type("Welcome back, operator.");
        await type("Login as:");
        await type("[1] Guest");
        await type("[2] Registered User");
        await type("[3] Create New User");
    }

    async function handleLogin(command) {
        const choice = command.trim();
        switch (state.subState) {
            case 'prompt':
                if (choice === '1') { // Guest
                    state.currentUser = { username: 'Guest', chats_sent: 0, beats: 0, roleplay_unlocked: false };
                    localStorage.setItem('currentUser', JSON.stringify(state.currentUser)); // Save guest session
                    await type("\nAccess Granted. Welcome, Guest.");
                    await type("Loading main interface...");
                    await new Promise(r => setTimeout(r, 1000));
                    await showMainMenu();
                } else if (choice === '2') { // Login
                    state.subState = 'username';
                    await type("Enter username:");
                } else if (choice === '3') { // Register
                    state.subState = 'register_username';
                    await type("Enter new username:");
                } else {
                    await type("Invalid selection.");
                }
                break;
            case 'username':
                state.tempData.username = choice;
                state.subState = 'password';
                await type("Enter password:");
                break;
            case 'password':
                const loginData = { username: state.tempData.username, password: choice };
                const loginResponse = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(loginData)
                });
                if (loginResponse.ok) {
                    state.currentUser = await loginResponse.json();
                    localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
                    await type("\nAccess Granted.");
                    await type("Loading main interface...");
                    await new Promise(r => setTimeout(r, 1000));
                    await showMainMenu();
                } else {
                    await type("Login failed. Invalid credentials.");
                    await new Promise(r => setTimeout(r, 1000));
                    await showLoginScreen();
                }
                break;
            case 'register_username':
                state.tempData.username = choice;
                state.subState = 'register_password';
                await type("Enter new password:");
                break;
            case 'register_password':
                const registerData = { username: state.tempData.username, password: choice };
                const registerResponse = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(registerData)
                });
                 if (registerResponse.ok) {
                    state.currentUser = await registerResponse.json();
                    localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
                    await type("\nUser created. Access Granted.");
                    await type("Loading main interface...");
                    await new Promise(r => setTimeout(r, 1000));
                    await showMainMenu();
                } else {
                    const error = await registerResponse.json();
                    await type(`Registration failed: ${error.error}`);
                    await new Promise(r => setTimeout(r, 1000));
                    await showLoginScreen();
                }
                break;
        }
    }

    async function showMainMenu() {
        state.appState = 'menu';
        state.subState = 'prompt';
        clearScreen();
        const roleplayStatus = state.currentUser?.roleplay_unlocked ? "UNLOCKED ✅" : "LOCKED 🔒";
        await type("=== MAIN MENU ===");
        await type("[1] Talk to AI");
        await type(`[2] Roleplay Mode (${roleplayStatus})`);
        await type("[3] Beats & Upgrades");
        await type("[4] Persona Settings");
        await type("[5] Profile Stats");
        await type("[6] Exit");
    }

    async function handleMenu(command) {
        // Make the command check case-insensitive
        switch(command.trim().toLowerCase()) {
            case '1':
                state.appState = 'chat';
                clearScreen();
                await type("AI Chat Interface. Type 'exit' to return to menu.");
                break;
            case '2':
                await type("Roleplay mode is not yet implemented.");
                break;
            case '3':
                state.appState = 'beats';
                clearScreen();
                const roleplayCost = 100;
                await type("=== Beats & Upgrades ===");
                await type(`Current Beats: ${state.currentUser?.beats || 0}`);
                await type("\nAvailable Upgrades:");
                if (state.currentUser?.roleplay_unlocked) {
                    await type("[1] Roleplay Mode (Already Unlocked)");
                } else {
                    await type(`[1] Unlock Roleplay Mode (Cost: ${roleplayCost} Beats)`);
                }
                await type("\nType a number to purchase or 'exit' to return.");
                break;
            case '4':
                state.appState = 'persona';
                clearScreen();
                await type("=== PERSONA SETTINGS ===");
                await type("Select a persona for Aya:");
                await type("[1] Helpful Assistant (Default)");
                await type("[2] Cocky Genius");
                await type("[3] Shy Prodigy");
                await type("\nType a number to select or 'exit' to return.");
                break;
            case '5':
                state.appState = 'profile';
                // To ensure we have the latest stats, especially after chatting
                if (state.currentUser.username !== 'Guest') {
                    await updateUserStats();
                }
                clearScreen();
                await type("=== PROFILE STATS ===");
                await type(`USER: ${state.currentUser?.username || 'Guest'}`);
                await type(`CHATS SENT: ${state.currentUser?.chats_sent || 0}`);
                await type(`BEATS: ${state.currentUser?.beats || 0}`);
                await type(`ROLEPLAY UNLOCKED: ${state.currentUser?.roleplay_unlocked ? 'YES' : 'NO'}`);
                await type("\nType 'exit' to return to menu.");
                break;
            case '6':
            case 'exit': // Allow user to type 'exit' as well
                await type("Logging out...");
                if (state.currentUser.username !== 'Guest') {
                    await fetch('/api/logout', { method: 'POST' });
                }
                localStorage.removeItem('currentUser');
                await new Promise(r => setTimeout(r, 1000));
                await showLoginScreen();
                break;
            default:
                await type("Invalid selection.");
        }
    }

    async function handleChat(command) {
        if (command.toLowerCase() === 'exit') {
            await showMainMenu();
            return;
        }
        if (command.toLowerCase() === 'clear') {
            clearScreen();
            await type("AI Chat Interface. Type 'exit' to return to menu.");
            return;
        }
        await fetchAIResponse(command);
    }

    async function handleProfile(command) {
        if (command.toLowerCase() === 'exit') await showMainMenu();
    }

    async function handleBeats(command) {
        const choice = command.trim();
        if (choice.toLowerCase() === 'exit') {
            await showMainMenu();
            return;
        }
        if (choice === '1') {
            if (state.currentUser?.roleplay_unlocked) {
                await type("You have already unlocked this feature.");
                return;
            }
            if (state.currentUser.username === 'Guest') {
                await type("Guests cannot purchase upgrades. Please register an account.");
                return;
            }
            await purchaseRoleplayUnlock();
        } else {
            await type("Invalid selection.");
        }
    }

    async function handlePersona(command) {
        const choice = command.trim();
        let personaKey = null;

        switch (choice) {
            case '1': personaKey = 'helpful'; break;
            case '2': personaKey = 'cocky'; break;
            case '3': personaKey = 'shy'; break;
            case 'exit':
                await showMainMenu();
                return;
            default:
                await type("Invalid selection.");
                return;
        }

        const response = await fetch('/api/set_persona', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ persona: personaKey })
        });

        const data = await response.json();
        if (response.ok) {
            await type(data.message);
        } else {
            await type(`Error: ${data.error}`);
        }
    }

    const fetchAIResponse = async (prompt) => {
        const responseElement = createResponseElement();
        responseElement.innerHTML = 'AI: ';
        state.abortController = new AbortController();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt }),
                signal: state.abortController.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `API Error: ${response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                responseElement.innerHTML += chunk.replace(/\n/g, '<br>');
                terminal.scrollTop = terminal.scrollHeight;
            }
            await updateUserStats(); // Let the backend be the source of truth

        } catch (error) {
            if (error.name === 'AbortError') {
                responseElement.innerHTML += '\n<span class="text-red-500">[Execution stopped]</span>';
            } else {
                responseElement.textContent = `Error: ${error.message}`;
            }
        }
    };

    async function updateUserStats() {
        // For guests, we just increment the local state
        if (state.currentUser.username === 'Guest') {
            state.currentUser.chats_sent++;
            state.currentUser.beats++;
            return;
        }
        // For registered users, fetch the authoritative state from the server
        try {
            const response = await fetch('/api/user_data');
            if (response.ok) {
                state.currentUser = await response.json();
                // Keep localStorage in sync with the server's state
                if (state.currentUser.username !== 'Guest') {
                    localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
                }
            }
        } catch (error) {
            console.error("Could not update user stats:", error);
        }
    }

    async function purchaseRoleplayUnlock() {
        const response = await fetch('/api/unlock_roleplay', { method: 'POST' });
        if (response.ok) {
            state.currentUser = await response.json();
            await type("Success! Roleplay Mode has been unlocked.");
            await type("Returning to main menu...");
            await new Promise(r => setTimeout(r, 1500));
            await showMainMenu();
        } else {
            const errorData = await response.json();
            await type(`Failed: ${errorData.error}`);
            await type("Returning to upgrades menu...");
            await new Promise(r => setTimeout(r, 1500));
            await handleMenu('3'); // Re-show the beats menu
        }
    }

    // --- Utility Functions ---

    const addToOutput = (html) => {
        const div = document.createElement('div');
        div.innerHTML = html;
        output.appendChild(div);
        terminal.scrollTop = terminal.scrollHeight;
    };

    const createResponseElement = () => {
        const div = document.createElement('div');
        output.appendChild(div);
        return div;
    };

    const clearScreen = () => {
        output.innerHTML = '';
    };

    // --- Event Handlers ---

    document.addEventListener('keydown', (e) => {
        if (state.isExecuting) {
            if (e.ctrlKey && e.key === 'c') {
                state.abortController.abort();
            }
            return;
        }

        if (e.key === 'Enter') {
            // Allow empty commands for menu navigation
            if (state.currentInput.trim() || state.appState !== 'chat') {
                processCommand(state.currentInput);
            }
        } else if (e.key === 'Backspace') {
            state.currentInput = state.currentInput.slice(0, -1);
        } else if (e.key === 'ArrowUp' && state.appState === 'chat') {
            e.preventDefault();
            if (state.historyIndex < state.commandHistory.length - 1) {
                state.historyIndex++;
                state.currentInput = state.commandHistory[state.historyIndex];
            }
        } else if (e.key === 'ArrowDown' && state.appState === 'chat') {
            e.preventDefault();
            if (state.historyIndex > 0) {
                state.historyIndex--;
                state.currentInput = state.commandHistory[state.historyIndex];
            } else {
                state.historyIndex = -1;
                state.currentInput = "";
            }
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            state.currentInput += e.key;
        }

        // Visually update the input line, masking password if necessary
        if (state.subState === 'password' || state.subState === 'register_password') {
            inputLine.textContent = state.currentInput.replace(/./g, '*');
        } else {
            inputLine.textContent = state.currentInput;
        }
    });

    // --- Initial Boot Sequence ---
    const boot = async () => {
        state.isExecuting = true;
        inputWrapper.style.display = 'none';
        await type("Booting Aya's AI Terminal...", 30);
        await new Promise(r => setTimeout(r, 500));

        // Check for a saved session in localStorage
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            state.currentUser = JSON.parse(savedUser);
            await type(`Resuming session for ${state.currentUser.username}...`, 30);

            // For registered users, try to sync with the server. For guests, just load.
            if (state.currentUser.username !== 'Guest') {
                await type("Verifying session with server...", 30);
                const response = await fetch('/api/user_data');
                if (response.ok) {
                    // Server session is valid, get the latest data
                    state.currentUser = await response.json();
                    localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
                    await type("Server sync complete. Session restored. ✅");
                } else {
                    // Server session expired or is invalid, proceed with local data
                    await type("Could not verify server session. Using local data. ⚠️");
                }
            } else {
                await type("Guest session restored. ✅");
            }
            await new Promise(r => setTimeout(r, 1000));
            await showMainMenu();
        } else {
            await type("Connection established ✅");
            await new Promise(r => setTimeout(r, 1000));
            await showLoginScreen();
        }

        state.isExecuting = false;
        inputWrapper.style.display = 'flex';
        focusInput();
    };

    boot();
});
