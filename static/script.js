document.addEventListener('DOMContentLoaded', () => {
    const output = document.getElementById('output');
    const inputLine = document.getElementById('input-line');
    const inputWrapper = document.getElementById('input-wrapper');
    const terminal = document.getElementById('terminal');
    const hiddenInput = document.getElementById('hidden-input');
    const sidebar = document.getElementById('sidebar');
    const sidebarContent = document.getElementById('sidebar-content');

    // --- State Management ---
    let state = {
        appState: 'login', // login, menu, chat, profile, beats, persona, settings, roleplay_setup
        subState: 'prompt', // For multi-step inputs like username/password
        tempData: {}, // To hold username during login flow
        isExecuting: false,
        currentUser: null, // { username, chats_sent, beats, roleplay_unlocked }
        commandHistory: [],
        historyIndex: -1,
        currentInput: "",
        abortController: new AbortController(),
        // Accessibility & Navigation
        menuOptions: [], // Array of { key, element, action }
        menuSelectionIndex: -1,
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

    // Helper to print a clickable/selectable menu option
    const printMenuOption = async (key, text, action) => {
        const div = document.createElement('div');
        div.classList.add('menu-option');
        div.innerHTML = text;
        div.onclick = () => {
            inputLine.textContent = key; // Visual feedback
            processCommand(key);
        };
        output.appendChild(div);
        terminal.scrollTop = terminal.scrollHeight;
        
        // Register for keyboard navigation
        state.menuOptions.push({ key, element: div, action: () => processCommand(key) });
        await new Promise(resolve => setTimeout(resolve, 50)); // Small delay for effect
    };

    const processCommand = async (command) => {
        state.isExecuting = true;
        try {
            // --- CHANGE 1: Immediate Input Clearing ---
            // Capture the command and clear the input line visually and from state *before* processing.
            const commandToProcess = command;
            state.currentInput = "";
            inputLine.textContent = "";
            // Clear menu options on new command to reset navigation
            state.menuOptions = [];
            state.menuSelectionIndex = -1;

            const displayCommand = (state.appState === 'login' && (state.subState === 'password' || state.subState === 'register_password')) ? command.replace(/./g, '*') : command;
            
            if (state.appState === 'chat') {
                createChatBubble(displayCommand, 'user');
            } else {
                addToOutput(`${PROMPT} ${displayCommand}`); // Show the processed command in the output
            }

            if (commandToProcess.trim() !== '' && state.appState === 'chat') {
                state.commandHistory.unshift(commandToProcess);
                state.historyIndex = -1;
            }
            
            // State-based command processing
            switch (state.appState) {
                case 'login': await handleLogin(commandToProcess); break;
                case 'menu': await handleMenu(commandToProcess); break;
                case 'chat': await handleChat(commandToProcess); break;
                case 'profile': await handleProfile(commandToProcess); break;
                case 'beats': await handleBeats(commandToProcess); break;
                case 'persona': await handlePersona(commandToProcess); break;
                case 'settings': await handleSettings(commandToProcess); break; // New handler
                case 'accessibility': await handleAccessibility(commandToProcess); break;
                case 'roleplay_setup': await handleRoleplaySetup(commandToProcess); break;
                case 'set_ai_name': await handleSetAiName(commandToProcess); break;
            }
        } catch (error) {
            await type(`\nError executing command: ${error.message}`);
            console.error(error);
        } finally {
            state.isExecuting = false;
            if (state.appState !== 'login' || state.subState === 'prompt') {
                inputWrapper.style.display = 'flex';
            }
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
        await printMenuOption("1", "[1] Guest");
        await printMenuOption("2", "[2] Registered User");
        await printMenuOption("3", "[3] Create New User");
    }

    async function handleLogin(command) {
        const choice = command.trim();
        switch (state.subState) {
            case 'prompt':
                if (choice === '1') { // Guest
                    // Initialize default guest settings
                    state.currentUser = { username: 'Guest', chats_sent: 0, beats: 0, roleplay_unlocked: false, persona: 'helpful', ai_name: 'AI', roleplay_chats_required: 3, theme: 'default', font_size: 'normal', response_length: 'balanced' };
                    localStorage.setItem('currentUser', JSON.stringify(state.currentUser)); // Save guest session
                    applyPreferences();

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
                    applyPreferences();
                    await type("\nAccess Granted.");
                    await type("Loading main interface...");
                    await new Promise(r => setTimeout(r, 1000));
                    await showMainMenu();
                } else {
                    // Handle non-JSON errors (like 500 server error)
                    let msg = "Login failed.";
                    try {
                        const err = await loginResponse.json();
                        msg += ` ${err.error}`;
                    } catch (e) {
                        msg += ` (Server Error: ${loginResponse.status})`;
                    }
                    await type(msg);
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
                    applyPreferences();
                    await type("\nUser created. Access Granted.");
                    await type("Loading main interface...");
                    await new Promise(r => setTimeout(r, 1000));
                    await showMainMenu();
                } else {
                    let msg = "Registration failed:";
                    try {
                        const error = await registerResponse.json();
                        msg += ` ${error.error}`;
                    } catch (e) {
                        msg += ` (Server Error: ${registerResponse.status})`;
                    }
                    await type(msg);
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
        await printMenuOption("1", "[1] Talk to AI");
        await printMenuOption("2", `[2] Roleplay Mode (${roleplayStatus})`);
        await printMenuOption("3", "[3] Beats & Upgrades");
        await printMenuOption("4", "[4] Settings"); // Renamed from "Persona Settings"
        await printMenuOption("5", "[5] Profile Stats");
        await printMenuOption("6", "[6] Exit");
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
                if (state.currentUser?.roleplay_unlocked) {
                    state.appState = 'roleplay_setup';
                    state.subState = 'name';
                    clearScreen();
                    await updateSidebar(); // Show saved chats sidebar
                    await type("=== ROLEPLAY SETUP ===");
                    await type("Enter your character's name:");
                } else {
                    await type("Roleplay Mode is LOCKED. 🔒\nUnlock this feature from the 'Beats & Upgrades' menu.");
                }
                break;
            case '3':
                state.appState = 'beats';
                clearScreen();
                const roleplayChatsRequired = state.currentUser?.roleplay_chats_required || 3; // Use backend value, with fallback
                await type("=== Beats & Upgrades ===");
                await type(`Current Chats Sent: ${state.currentUser?.chats_sent || 0}`);
                await type("\nAvailable Upgrades:");
                if (state.currentUser?.roleplay_unlocked) {
                    await printMenuOption("1", "[1] Roleplay Mode (UNLOCKED)");
                } else {
                    await printMenuOption("1", `[1] Unlock Roleplay Mode (Requires: ${roleplayChatsRequired} Chats)`);
                }
                await type("\nType a number to purchase or 'exit' to return.");
                break;
            case '4':
                state.appState = 'settings';
                clearScreen();
                await showSettingsMenu();
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
                // Always call logout on the server to clear session/memory
                await fetch('/api/logout', { method: 'POST' });
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
            // Clear memory on exit as requested
            await fetch('/api/reset_chat', { method: 'POST' });
            await showMainMenu();
            return;
        }
        if (command.toLowerCase() === 'clear') {
            clearScreen();
            await type("AI Chat Interface. Type 'exit' to return to menu.");
            return;
        }
        await fetchAIResponse(command, false, null);
    }

    async function handleRoleplaySetup(command) {
        if (command.toLowerCase() === 'exit') {
            await showMainMenu();
            return;
        }
        
        switch (state.subState) {
            case 'name':
                state.tempData.rp_name = command;
                state.subState = 'gender';
                await type("Enter your character's gender:");
                break;
            case 'gender':
                state.tempData.rp_gender = command;
                state.subState = 'scenario';
                await type("Describe the scenario/idea (be specific):");
                break;
            case 'scenario':
                state.tempData.rp_scenario = command;
                await type("\nInitializing Scenario...");
                
                try {
                    const response = await fetch('/api/roleplay/start', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            user_name: state.tempData.rp_name,
                            user_gender: state.tempData.rp_gender,
                            scenario: state.tempData.rp_scenario
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok) {
                        state.appState = 'chat';
                        sidebar.classList.add('hidden'); // Hide sidebar on start
                        clearScreen();
                        await type("=== ROLEPLAY STARTED ===");
                        
                        // Create bubble with roleplay opener and attach version info
                        const bubble = createChatBubble(data.opener, 'ai');
                        updateBubbleControls(bubble);
                    } else {
                        await type(`Error: ${data.error}`);
                        await new Promise(r => setTimeout(r, 2000));
                        await showMainMenu();
                    }
                } catch (e) {
                    await type(`Connection Error: ${e.message}`);
                }
                break;
        }
    }

    async function updateSidebar() {
        try {
            const response = await fetch('/api/roleplay/sessions');
            if (!response.ok) return; // If guest or error, just don't show sidebar
            
            const sessions = await response.json();
            sidebarContent.innerHTML = '';
            
            if (sessions.length > 0) {
                sidebar.classList.remove('hidden');
                
                const header = document.createElement('div');
                header.className = "text-xs mb-2 text-gray-500 italic";
                header.textContent = "Click a session to resume";
                sidebarContent.appendChild(header);

                sessions.forEach(session => {
                    const div = document.createElement('div');
                    div.className = 'sidebar-item';
                    div.innerHTML = `
                        <div class="sidebar-date">${new Date(session.timestamp).toLocaleDateString()}</div>
                        <div class="sidebar-name">${session.name || 'Unknown'}</div>
                        <div class="truncate">${session.scenario}</div>
                    `;
                    div.onclick = () => loadRoleplaySession(session.id);
                    sidebarContent.appendChild(div);
                });
            }
        } catch (e) {
            console.error("Failed to load sessions", e);
        }
    }

    async function loadRoleplaySession(id) {
        await type("\nLoading saved session...");
        try {
            const response = await fetch('/api/roleplay/load', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            const data = await response.json();
            if (response.ok) {
                state.appState = 'chat';
                sidebar.classList.add('hidden');
                clearScreen();
                await type("=== SESSION RESTORED ===");
                
                // Reconstruct full history
                if (data.history) {
                    data.history.forEach(msg => {
                        if (msg.role === 'user') {
                            createChatBubble(msg.content, 'user');
                        } else if (msg.role === 'assistant') {
                            const bubble = createChatBubble(msg.content, 'ai');
                            updateBubbleControls(bubble);
                        }
                    });
                }
            }
        } catch (e) {
            await type(`Error loading session: ${e.message}`);
        }
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

    async function showSettingsMenu() {
        await type("=== SETTINGS ===");
        await printMenuOption("1", "[1] Persona Settings");
        await printMenuOption("2", `[2] Change AI Name (Current: ${state.currentUser?.ai_name || 'AI'})`);
        await printMenuOption("3", "[3] Accessibility (Size, Theme, Length)");
        await type("\nType a number, use arrow keys, or 'exit'.");
    }

    async function handleSettings(command) {
        switch(command.trim().toLowerCase()) {
            case '1':
                state.appState = 'persona';
                clearScreen();
                await type(`=== PERSONA SETTINGS ===`);
                await type("Select a persona for Aya:");
                // --- CHANGE 2: Indicate Selected Persona ---
                const currentPersona = state.currentUser?.persona;
                await printMenuOption("1", `[1] Helpful Assistant ${currentPersona === 'helpful' ? '(Selected)' : ''}`);
                await printMenuOption("2", `[2] Cocky Genius ${currentPersona === 'cocky' ? '(Selected)' : ''}`);
                await printMenuOption("3", `[3] Shy Prodigy ${currentPersona === 'shy' ? '(Selected)' : ''}`);
                await type("\nSelect with number/mouse/arrows or 'exit'.");
                break;
            case '2':
                if (state.currentUser.username === 'Guest') {
                    await type("Guests cannot change the AI's name. Please register an account.");
                    return;
                }
                state.appState = 'set_ai_name';
                await type("Enter a new name for the AI (1-20 characters):");
                break;
            case '3':
                state.appState = 'accessibility';
                clearScreen();
                await showAccessibilityMenu();
                break;
            case 'exit':
                await showMainMenu();
                break;
        }
    }

    async function showAccessibilityMenu() {
        const user = state.currentUser || {};
        const size = user.font_size || 'normal';
        const theme = user.theme || 'default';
        const len = user.response_length || 'balanced';

        await type("=== ACCESSIBILITY ===");
        await type("Adjust visual and interaction settings.");
        
        await type("\n--- Font Size ---");
        await printMenuOption("1", `[1] Small ${size === 'small' ? '✅' : ''}`);
        await printMenuOption("2", `[2] Normal ${size === 'normal' ? '✅' : ''}`);
        await printMenuOption("3", `[3] Large ${size === 'large' ? '✅' : ''}`);

        await type("\n--- Theme ---");
        await printMenuOption("4", `[4] Default (White/Black) ${theme === 'default' ? '✅' : ''}`);
        await printMenuOption("5", `[5] Hacker Green ${theme === 'green' ? '✅' : ''}`);
        await printMenuOption("6", `[6] Amber Retro ${theme === 'amber' ? '✅' : ''}`);
        await printMenuOption("7", `[7] Solarized Dark ${theme === 'solarized-dark' ? '✅' : ''}`);

        await type("\n--- AI Response Length ---");
        await printMenuOption("8", `[8] Concise (~150 words) ${len === 'concise' ? '✅' : ''}`);
        await printMenuOption("9", `[9] Balanced (~500 words) ${len === 'balanced' ? '✅' : ''}`);
        await printMenuOption("0", `[0] Verbose (~2000 words) ${len === 'verbose' ? '✅' : ''}`);

        await type("\nType 'exit' to return to Settings.");
    }

    async function handleAccessibility(command) {
        const choice = command.trim().toLowerCase();
        let updates = {};

        if (choice === 'exit') {
            state.appState = 'settings';
            clearScreen();
            await showSettingsMenu();
            return;
        }

        if (choice === '1') updates.font_size = 'small';
        else if (choice === '2') updates.font_size = 'normal';
        else if (choice === '3') updates.font_size = 'large';
        else if (choice === '4') updates.theme = 'default';
        else if (choice === '5') updates.theme = 'green';
        else if (choice === '6') updates.theme = 'amber';
        else if (choice === '7') updates.theme = 'solarized-dark';
        else if (choice === '8') updates.response_length = 'concise';
        else if (choice === '9') updates.response_length = 'balanced';
        else if (choice === '0') updates.response_length = 'verbose';

        if (Object.keys(updates).length > 0) {
            await updatePreferences(updates);
            clearScreen();
            await showAccessibilityMenu(); // Refresh to show checkmarks
        } else {
            await type("Invalid selection.");
        }
    }

    async function handleSetAiName(command) {
        const newName = command.trim();
        if (newName.toLowerCase() === 'exit') {
            await showSettingsMenu();
            state.appState = 'settings';
            return;
        }

        // For registered users, first verify the session is still active on the server.
        // If not, update the name locally to prevent an error.
        const sessionCheckResponse = await fetch('/api/user_data');
        if (!sessionCheckResponse.ok) {
            state.currentUser.ai_name = newName;
            localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
            await type(`AI name changed to ${newName}. (Local session)`);
            return;
        }

        const response = await fetch('/api/set_ai_name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });
        const data = await response.json();
        await type(data.message || `Error: ${data.error}`);
        if (response.ok) {
            await updateUserStats(); // Refresh user data to get the new name
            await new Promise(r => setTimeout(r, 1000));
            await showSettingsMenu();
            state.appState = 'settings';
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

        // For guests, handle persona change on the client-side only
        if (state.currentUser.username === 'Guest') {
            state.currentUser.persona = personaKey;
            localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
            await type(`Persona switched to ${personaKey}.`);
            return;
        }

        // For registered users, first verify the session is still active on the server.
        // If not, treat them like a guest for this action to prevent errors.
        const sessionCheckResponse = await fetch('/api/user_data');
        if (!sessionCheckResponse.ok) {
            state.currentUser.persona = personaKey;
            localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
            await type(`Persona switched to ${personaKey}. (Local session)`);
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
            // Update local state to reflect the change immediately
            if (state.currentUser) {
                state.currentUser.persona = personaKey;
            }
        } else {
            await type(`Error: ${data.error}`);
        }
    }

    // --- Utility Functions ---

    const parseMarkdown = (text) => {
        if (!text) return '';
        // 1. Escape HTML to prevent injection and rendering issues
        let html = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        // 2. Code Blocks (``` ... ```)
        html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code class="language-${lang}">${code}</code></pre>`;
        });

        // 3. Inline Code (` ... `)
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // 4. Formatting (Bold & Italic)
        html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        html = html.replace(/\*([^\*]+)\*/g, '<i>$1</i>');

        // 5. Newlines to <br> (excluding pre blocks to preserve code formatting)
        return html.split(/(<pre[\s\S]*?<\/pre>)/g).map(segment => {
            return segment.startsWith('<pre') ? segment : segment.replace(/\n/g, '<br>');
        }).join('');
    };

    const fetchAIResponse = async (prompt, isRegen = false, targetBubble = null) => {
        const responseElement = targetBubble || createChatBubble('', 'ai');
        state.abortController = new AbortController();
        let fullResponse = "";

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: isRegen ? null : prompt,
                    regenerate: isRegen,
                    persona: state.currentUser?.persona
                }),
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
                
                fullResponse += chunk;
                
                // Update the content div inside the bubble
                const contentDiv = responseElement.querySelector('.msg-content');
                if (contentDiv) contentDiv.innerHTML = parseMarkdown(fullResponse);
                
                terminal.scrollTop = terminal.scrollHeight;
            }
            
            // After streaming is done, save the version
            if (!responseElement.versions) {
                responseElement.versions = [];
                responseElement.currentVersion = -1;
            }
            
            responseElement.versions.push(fullResponse);
            responseElement.currentVersion = responseElement.versions.length - 1;
            updateBubbleControls(responseElement);
            
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

    async function updatePreferences(updates) {
        // Mix into current local state
        state.currentUser = { ...state.currentUser, ...updates };
        
        // Apply visual changes immediately
        applyPreferences();

        // Save to LocalStorage
        localStorage.setItem('currentUser', JSON.stringify(state.currentUser));

        // Sync with backend if logged in
        if (state.currentUser.username !== 'Guest') {
            try {
                await fetch('/api/update_preferences', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates)
                });
            } catch (e) {
                console.error("Failed to sync preferences", e);
            }
        }
    }

    function applyPreferences() {
        const user = state.currentUser || {};
        document.body.className = "bg-black"; // Reset base
        if (user.theme && user.theme !== 'default') document.body.classList.add(`theme-${user.theme}`);
        if (user.font_size) document.body.classList.add(`font-size-${user.font_size}`);
    }

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

    const createChatBubble = (text, sender) => {
        const div = document.createElement('div');
        div.classList.add('message-bubble');
        div.classList.add(sender === 'user' ? 'message-user' : 'message-ai');
        
        // Inner container for text
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('msg-content');
        contentDiv.innerHTML = parseMarkdown(text);
        div.appendChild(contentDiv);

        // Init versions array for AI messages
        if (sender === 'ai') {
            div.versions = text ? [text] : []; // If created with text (like RP opener), store it
            div.currentVersion = 0;
        }

        output.appendChild(div);
        terminal.scrollTop = terminal.scrollHeight;
        return div;
    };

    const updateBubbleControls = (bubble) => {
        // Remove existing controls
        const existing = bubble.querySelector('.message-controls');
        if (existing) existing.remove();

        const controls = document.createElement('div');
        controls.classList.add('message-controls');
        
        // Navigation (< 1/3 >)
        if (bubble.versions.length > 1) {
            const prevBtn = document.createElement('span');
            prevBtn.className = 'control-btn';
            prevBtn.innerHTML = '&lt;';
            prevBtn.onclick = () => switchVersion(bubble, -1);
            
            const count = document.createElement('span');
            count.className = 'mx-2';
            count.innerText = `${bubble.currentVersion + 1}/${bubble.versions.length}`;
            
            const nextBtn = document.createElement('span');
            nextBtn.className = 'control-btn';
            nextBtn.innerHTML = '&gt;';
            nextBtn.onclick = () => switchVersion(bubble, 1);

            controls.appendChild(prevBtn);
            controls.appendChild(count);
            controls.appendChild(nextBtn);
        }

        // Regenerate Button
        const regenBtn = document.createElement('span');
        regenBtn.className = 'control-btn ml-2';
        regenBtn.innerHTML = '[Regenerate]';
        regenBtn.onclick = () => fetchAIResponse(null, true, bubble);
        
        controls.appendChild(regenBtn);
        bubble.appendChild(controls);
    };

    const switchVersion = async (bubble, direction) => {
        const newIndex = bubble.currentVersion + direction;
        if (newIndex >= 0 && newIndex < bubble.versions.length) {
            bubble.currentVersion = newIndex;
            bubble.querySelector('.msg-content').innerHTML = parseMarkdown(bubble.versions[newIndex]);
            updateBubbleControls(bubble);
            
            // Sync with backend
            await fetch('/api/chat/update_history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: bubble.versions[newIndex] })
            });
        }
    };

    const clearScreen = () => {
        output.innerHTML = '';
    };

    // --- Event Handlers ---

    document.addEventListener('paste', (e) => {
        if (state.isExecuting) return;
        e.preventDefault();

        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (text) {
            // Flatten newlines to spaces for single-line input
            const cleanText = text.replace(/[\r\n]+/g, ' ');
            state.currentInput += cleanText;

            // Update visual input line
            if (state.subState === 'password' || state.subState === 'register_password') {
                inputLine.textContent = state.currentInput.replace(/./g, '*');
            } else {
                inputLine.textContent = state.currentInput;
            }
            terminal.scrollTop = terminal.scrollHeight;
        }
    });

    document.addEventListener('keydown', (e) => {
        if (state.isExecuting) {
            if (e.ctrlKey && e.key === 'c') {
                state.abortController.abort();
            }
            return;
        }

        if (e.key === 'Enter') {
            // Check if we have a selected menu option via arrows
            if (state.menuOptions.length > 0 && state.menuSelectionIndex !== -1) {
                const selected = state.menuOptions[state.menuSelectionIndex];
                if (selected) {
                     // Visual confirm
                    inputLine.textContent = selected.key;
                    selected.action();
                    return;
                }
            }
            // Allow empty commands for menu navigation
            if (state.currentInput.trim() || state.appState !== 'chat') {
                processCommand(state.currentInput);
            }
        } else if (e.key === 'Backspace') {
            state.currentInput = state.currentInput.slice(0, -1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (state.menuOptions.length > 0) {
                // Menu Navigation
                if (state.menuSelectionIndex < 0) state.menuSelectionIndex = state.menuOptions.length;
                const prevIndex = state.menuSelectionIndex;
                state.menuSelectionIndex = Math.max(0, state.menuSelectionIndex - 1);
                
                // Update visual highlight
                if (prevIndex >= 0 && prevIndex < state.menuOptions.length) state.menuOptions[prevIndex].element.classList.remove('selected');
                state.menuOptions[state.menuSelectionIndex].element.classList.add('selected');
                
            } else if (state.appState === 'chat') {
                // Chat History
                if (state.historyIndex < state.commandHistory.length - 1) {
                    state.historyIndex++;
                    state.currentInput = state.commandHistory[state.historyIndex];
                }
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (state.menuOptions.length > 0) {
                // Menu Navigation
                const prevIndex = state.menuSelectionIndex;
                state.menuSelectionIndex = Math.min(state.menuOptions.length - 1, state.menuSelectionIndex + 1);

                // Update visual highlight
                if (prevIndex >= 0) state.menuOptions[prevIndex].element.classList.remove('selected');
                state.menuOptions[state.menuSelectionIndex].element.classList.add('selected');

            } else if (state.appState === 'chat') {
                 // Chat History
                if (state.historyIndex >= 0) { // Allow going to -1
                    state.historyIndex--;
                    state.currentInput = state.commandHistory[state.historyIndex];
                } else {
                    state.historyIndex = -1;
                    state.currentInput = "";
                }
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
        terminal.scrollTop = terminal.scrollHeight;
    });

    // --- Initial Boot Sequence ---
    const boot = async () => {
        state.isExecuting = true;
        inputWrapper.style.display = 'none';
        await type("Booting AI Terminal...", 30);
        await new Promise(r => setTimeout(r, 500));

        // Check for a saved session in localStorage
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            state.currentUser = JSON.parse(savedUser);
            await type(`Resuming session for ${state.currentUser.username}...`, 30);

            // For registered users, try to sync with the server. For guests, just load.
            if (state.currentUser.username !== 'Guest') {
                await type("Syncing session with server...", 30);
                const response = await fetch('/api/user_data');
                if (response.ok) {
                    // Server session is valid, get the latest data
                    state.currentUser = await response.json();
                    applyPreferences();
                    localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
                    await type("Server sync complete. Session restored. ✅");
                    await new Promise(r => setTimeout(r, 1000));
                    await showMainMenu();
                } else {
                    // Server session expired or is invalid. Clear local data and force re-login.
                    await type("Server session expired. Please log in again. ⚠️");
                    localStorage.removeItem('currentUser');
                    await new Promise(r => setTimeout(r, 1000));
                    await showLoginScreen();
                }
            } else { // Guest user
                await type("Guest session restored. ✅");
                applyPreferences();
                await new Promise(r => setTimeout(r, 1000));
                await showMainMenu();
            }
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