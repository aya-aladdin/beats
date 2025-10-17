document.addEventListener('DOMContentLoaded', () => {
    const output = document.getElementById('output');
    const inputPreCursor = document.getElementById('input-pre-cursor');
    const inputPostCursor = document.getElementById('input-post-cursor');
    const inputWrapper = document.getElementById('input-wrapper');
    const terminal = document.getElementById('terminal');
    const hiddenInput = document.getElementById('hidden-input');

    let state = {
        appState: 'login',
        subState: 'prompt',
        tempData: {},
        isExecuting: false,
        currentUser: null,
        commandHistory: [],
        historyIndex: -1,
        menu: {
            items: [],
            selectedIndex: 0,
            isNavigable: false,
            focusedChoiceIndex: 0,
        },
        accessibility: {
            theme: 'default', typingSpeed: 20, cursorBlink: true, menuArrows: true, fontSize: 'normal',
        },
        currentInput: "",
        cursorPosition: 0,
        abortController: new AbortController(),
    };

    const PROMPT = `&gt;`;

    const focusInput = () => hiddenInput.focus();
    terminal.addEventListener('click', () => {
        if (window.getSelection().toString().length === 0) focusInput();
    });

    const type = async (text, delay = state.accessibility.typingSpeed) => {
        const element = createResponseElement();
        for (let i = 0; i < text.length; i++) {
            const char = (state.appState === 'login' && (state.subState === 'password' || state.subState === 'register_password')) ? '*' : text.charAt(i);
            element.innerHTML += parseMarkdown(char);
            terminal.scrollTop = terminal.scrollHeight;
            await new Promise(resolve => setTimeout(resolve, Math.random() * delay));
        }
        return element;
    };

    const processCommand = async (command) => {
        state.isExecuting = true;
        const commandToProcess = command;
        state.currentInput = '';
        renderInput();

        const displayCommand = (state.appState === 'login' && (state.subState === 'password' || state.subState === 'register_password')) ? command.replace(/./g, '*') : command;
        addToOutput(`${PROMPT} ${displayCommand}`);

        if (commandToProcess.trim() !== '' && state.appState === 'chat') {
            state.commandHistory.unshift(commandToProcess);
            state.historyIndex = -1;
        }
        switch (state.appState) {
            case 'login': await handleLogin(commandToProcess); break;
            case 'menu': await handleMenu(commandToProcess); break;
            case 'chat': await handleChat(commandToProcess); break;
            case 'profile': await handleProfile(commandToProcess); break;
            case 'beats': await handleBeats(commandToProcess); break;
            case 'persona': await handlePersona(commandToProcess); break;
            case 'settings': await handleSettings(commandToProcess); break;
            case 'accessibility': await handleAccessibility(commandToProcess); break;
            case 'set_ai_name': await handleSetAiName(commandToProcess); break;
        }
        state.isExecuting = false;
        if (state.appState !== 'login' || state.subState === 'prompt') {
             inputWrapper.style.display = 'flex';
        }
    };

    async function showLoginScreen() {
        state.appState = 'login';
        state.subState = 'prompt';
        state.currentUser = null;
        state.menu.isNavigable = false;
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
                if (choice === '1') {
                    state.currentUser = { username: 'Guest', chats_sent: 0, beats: 0, roleplay_unlocked: false, persona: 'helpful', ai_name: 'AI' };
                    localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
                    await type("\nAccess Granted. Welcome, Guest.");
                    await type("Loading main interface...");
                    await new Promise(r => setTimeout(r, 1000));
                    await showMainMenu();
                } else if (choice === '2') {
                    state.subState = 'username';
                    await type("Enter username:");
                } else if (choice === '3') {
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
        state.menu.isNavigable = true;
        state.menu.selectedIndex = 0;
        clearScreen();
        const roleplayStatus = state.currentUser?.roleplay_unlocked ? "UNLOCKED ✅" : "LOCKED 🔒";
        await type("=== MAIN MENU ===");
        state.menu.items = [
            { text: "[1] Talk to AI", command: "1" },
            { text: `[2] Roleplay Mode (${roleplayStatus})`, command: "2" },
            { text: "[3] Beats & Upgrades", command: "3" },
            { text: "[4] Settings", command: "4" },
            { text: "[5] Profile Stats", command: "5" },
            { text: "[6] Exit", command: "6" },
        ];
        renderMenu();
    }

    async function handleMenu(command) {
        switch(command.trim().toLowerCase()) {
            case '1':
                state.appState = 'chat';
                state.menu.isNavigable = false;
                clearScreen();
                await type("AI Chat Interface. Type 'exit' to return to menu.");
                break;
            case '2':
                await type("Roleplay mode is not yet implemented.");
                return;
            case '3':
                state.appState = 'beats';
                state.menu.isNavigable = true;
                state.menu.selectedIndex = 0;
                clearScreen();
                const ROLEPLAY_COST = 100; // Match backend
                await type("=== Beats & Upgrades ===");
                await type(`Current Beats: ${state.currentUser?.beats || 0}`);
                await type("\nAvailable Upgrades:");
                state.menu.items = [
                    { text: state.currentUser?.roleplay_unlocked ? "[1] Roleplay Mode (Already Unlocked)" : `[1] Unlock Roleplay Mode (Cost: ${ROLEPLAY_COST} Beats)`, command: "1" },
                    { text: "\n[exit] Return to menu", command: "exit" }
                ];
                renderMenu();
                break;
            case '4':
                state.appState = 'settings';
                state.menu.isNavigable = true;
                clearScreen();
                await showSettingsMenu();
                break;
            case '5':
                state.appState = 'profile';
                if (state.currentUser.username !== 'Guest') {
                    await updateUserStats();
                }
                state.menu.isNavigable = false;
                clearScreen();
                await type("=== PROFILE STATS ===");
                await type(`USER: ${state.currentUser?.username || 'Guest'}`);
                await type(`CHATS SENT: ${state.currentUser?.chats_sent || 0}`);
                await type(`BEATS: ${state.currentUser?.beats || 0}`);
                await type(`ROLEPLAY UNLOCKED: ${state.currentUser?.roleplay_unlocked ? 'YES' : 'NO'}`);
                await type("\nType 'exit' to return to menu.");
                break;
            case 'exit': // This was incorrectly '6' before
                const sizes = ['normal', 'large', 'small'];
                let currentSizeIndex = sizes.indexOf(state.accessibility.fontSize);
                let nextSizeIndex = (currentSizeIndex + 1) % sizes.length;
                state.accessibility.fontSize = sizes[nextSizeIndex];
                applyAccessibilitySettings();
                saveAccessibilitySettings();
                const newSizeName = state.accessibility.fontSize.charAt(0).toUpperCase() + state.accessibility.fontSize.slice(1);
                await type(`Font size set to: ${newSizeName}`);
                break; // Kept as a hidden feature, maybe move to accessibility?
            case '6':
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
            state.menu.isNavigable = true;
            if (state.currentUser.username !== 'Guest') {
                await fetch('/api/clear_chat_history', { method: 'POST', credentials: 'same-origin' });
            }
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
        if (choice.toLowerCase() === 'exit' || choice.toLowerCase() === 'back') {
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
        state.appState = 'settings';
        state.menu.isNavigable = true;
        state.menu.selectedIndex = 0;
        await type("=== SETTINGS ===");

        const CHANGE_NAME_COST_CHATS = 20;
        const isGuest = state.currentUser?.username === 'Guest';
        let aiNameText;
        if (isGuest) {
            aiNameText = "[2] Change AI Name (LOCKED 🔒)";
        } else if (state.currentUser.chats_sent < CHANGE_NAME_COST_CHATS) {
            aiNameText = `[2] Change AI Name (LOCKED - Requires ${CHANGE_NAME_COST_CHATS} chats)`;
        } else {
            aiNameText = `[2] Change AI Name (Current: ${state.currentUser?.ai_name || 'AI'})`;
        }
        state.menu.items = [
            { text: "[1] Persona Settings", command: "1" },
            { text: aiNameText, command: "2" },
            { text: "[3] Accessibility", command: "3" },
            { text: "\n[exit] Return to main menu", command: "exit" }
        ];
        renderMenu();
    }

    async function handleSettings(command) {
        switch(command.trim().toLowerCase()) {
            case '1':
                state.appState = 'persona';
                state.menu.isNavigable = true;
                state.menu.selectedIndex = 0;
                clearScreen();
                await type(`=== PERSONA SETTINGS ===`);
                await type("Select a persona for the AI:");
                const currentPersona = state.currentUser?.persona;
                state.menu.items = [
                    { text: `[1] Helpful Assistant ${currentPersona === 'helpful' ? '(*)' : ''}`, command: '1' },
                    { text: `[2] Cocky Genius ${currentPersona === 'cocky' ? '(*)' : ''}`, command: '2' },
                    { text: `[3] Shy Prodigy ${currentPersona === 'shy' ? '(*)' : ''}`, command: '3' },
                    { text: "\n[exit] Return to settings", command: 'exit' }
                ];
                renderMenu();
                break;
            case '2':
                if (state.currentUser.username === 'Guest') {
                    await type("Guests cannot change the AI's name. Please register an account.");
                    return;
                }
                const CHANGE_NAME_COST_CHATS = 20;
                if (state.currentUser.chats_sent < CHANGE_NAME_COST_CHATS) {
                    const chatsNeeded = CHANGE_NAME_COST_CHATS - state.currentUser.chats_sent;
                    await type(`This feature is locked. You need ${chatsNeeded} more chat(s) to unlock it.`);
                    return;
                }
                state.appState = 'set_ai_name';
                state.menu.isNavigable = false;
                await type("Enter a new name for the AI (1-20 characters):");
                break;
            case '3':
                clearScreen();
                await showAccessibilityMenu();
                break;
            case 'exit':
            case 'back':
                await showMainMenu();
                break;
        }
    }

    async function showAccessibilityMenu() {
        state.appState = 'accessibility';
        state.menu.isNavigable = true;
        state.menu.selectedIndex = 0;
        state.menu.focusedChoiceIndex = 0;
        clearScreen();
        await type("=== ACCESSIBILITY ===");
        await type("Use ↑/↓ to select a setting, ←/→ to change it. Type 'exit' to return.");

        state.menu.items = [
            {
                id: 'theme', label: '[1] Theme',
                choices: [
                    { value: 'default', text: 'Aa', classes: 'theme-preview theme-default' },
                    { value: 'green', text: 'Aa', classes: 'theme-preview theme-green' },
                    { value: 'amber', text: 'Aa', classes: 'theme-preview theme-amber' },
                    { value: 'solarized-dark', text: 'Aa', classes: 'theme-preview theme-solarized-dark' }
                ]
            },
            {
                id: 'fontSize', label: '[2] Font Size',
                choices: [
                    { value: 'small', text: 'Small' },
                    { value: 'normal', text: 'Normal' },
                    { value: 'large', text: 'Large' }
                ]
            },
            {
                id: 'typingSpeed', label: '[3] Typing Speed',
                choices: [
                    { value: 20, text: 'Slow' },
                    { value: 10, text: 'Fast' },
                    { value: 0, text: 'Instant' }
                ]
            },
            {
                id: 'cursorBlink', label: '[4] Blinking Cursor',
                choices: [
                    { value: true, text: 'On' },
                    { value: false, text: 'Off' }
                ]
            },
            {
                id: 'menuArrows', label: '[5] Menu Arrows',
                choices: [
                    { value: true, text: 'On' },
                    { value: false, text: 'Off' }
                ]
            }
        ];
        renderAccessibilityMenu();
    }

    async function handleAccessibility(command) {
        const choice = command.trim().toLowerCase();
        switch(choice) {
            case 'exit':
            case 'back':
                clearScreen();
                await showSettingsMenu();
                return;
        }
    }

    async function handleSetAiName(command) {
        const newName = command.trim();
        if (newName.toLowerCase() === 'exit' || newName.toLowerCase() === 'back') {
            clearScreen();
            await showSettingsMenu();
            state.appState = 'settings';
            return;
        }

        const sessionCheckResponse = await fetch('/api/user_data');
        if (!sessionCheckResponse.ok) {
            state.currentUser.ai_name = newName;
            localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
            await type(`AI name changed to '${newName}'. (Local session)`);
            await type("Type 'exit' to return to settings.");
            return;
        }

        const response = await fetch('/api/set_ai_name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ name: newName })
        });
        const data = await response.json();
        if (response.ok) {
            await updateUserStats();
            await type(data.message);
            await type("Type 'exit' to return to settings.");
        } else {
            await type(`Error: ${data.error}`);
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
                clearScreen();
                await showSettingsMenu();
                return;
            default:
                await type("Invalid selection.");
                return;
        }

        // Handle persona change differently for guests vs. registered users
        if (state.currentUser.username === 'Guest') {
            // For guests, handle the change on the client-side only
            state.currentUser.persona = personaKey;
            localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
            await type(`Persona switched to ${personaKey}.`);
            await new Promise(r => setTimeout(r, 1000));
            await handleSettings('1'); // Re-render the persona menu
        } else {
            // For registered users, update the server
            const response = await fetch('/api/set_persona', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin', // Ensure session cookie is sent
                body: JSON.stringify({ persona: personaKey })
            });

            const data = await response.json();
            if (response.ok) {
                await updateUserStats(); // Sync local state with server
                await type(data.message);
                await new Promise(r => setTimeout(r, 1000));
                await handleSettings('1'); // Re-render the persona menu
            } else {
                await type(`Error: ${data.error}`);
                await type(`Persona switched to ${personaKey} in local session only.`);
            }
        }
    }

    const parseMarkdown = (text) => {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>');
    };

    const fetchAIResponse = async (prompt) => {
        const responseElement = createResponseElement();
        responseElement.innerHTML = `AI: <div class="typing-indicator"><span></span><span></span><span></span></div>`;
        let firstChunk = true;
        state.abortController = new AbortController();
    
        // We don't await this function. This lets the UI update immediately with the
        // typing indicator, while the fetch happens in the background.
        (async () => {
            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin', // Add this to authenticate chat requests
                    body: JSON.stringify({ prompt, persona: state.currentUser?.persona }),
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
    
                    if (firstChunk) {
                        responseElement.innerHTML = 'AI: ';
                        firstChunk = false;
                    }
                    const chunk = decoder.decode(value, { stream: true });
                    responseElement.innerHTML += parseMarkdown(chunk).replace(/\n/g, '<br>');
                    terminal.scrollTop = terminal.scrollHeight;
                }
                await updateUserStats();
    
            } catch (error) {
                if (error.name !== 'AbortError') {
                    responseElement.textContent = `Error: ${error.message}`;
                }
            }
        })();
    };

    async function updateUserStats() {
        if (state.currentUser.username === 'Guest') {
            state.currentUser.chats_sent++;
            state.currentUser.beats++;
            return;
        }
        try {
            const response = await fetch('/api/user_data', {
                method: 'GET',
                credentials: 'same-origin' // Also ensure this GET request is authenticated
            });
            if (response.ok) {
                state.currentUser = await response.json();
                if (state.currentUser.username !== 'Guest') {
                    localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
                }
            }
        } catch (error) {
            console.error("Could not update user stats:", error);
        }
    }

    async function purchaseRoleplayUnlock() {
        const response = await fetch('/api/unlock_roleplay', {
            method: 'POST',
            credentials: 'same-origin'
        });
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
            await handleMenu('3');
        }
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

    const clearScreen = () => {
        output.innerHTML = '';
    };

    const renderMenu = () => {
        let menuContainer = output.querySelector('.menu-container');
        if (!menuContainer) {
            menuContainer = document.createElement('div');
            menuContainer.className = 'menu-container';
            output.appendChild(menuContainer);
        }

        menuContainer.innerHTML = '';

        state.menu.items.forEach((item, index) => {
            const isSelected = index === state.menu.selectedIndex;
            const selector = (isSelected && state.accessibility.menuArrows) ? `&gt; ` : '  ';
            const line = `${selector}${item.text}`;
            const div = document.createElement('div');
            div.innerHTML = isSelected ? `<b>${line}</b>` : line;
            menuContainer.appendChild(div);
        });
        terminal.scrollTop = terminal.scrollHeight;
    };

    const renderAccessibilityMenu = () => {
        const oldContainer = output.querySelector('.access-container');
        if (oldContainer) oldContainer.remove();
        const oldExitText = output.querySelector('.access-exit-text'); if (oldExitText) oldExitText.remove();

        const container = document.createElement('div'); container.className = 'access-container';

        state.menu.items.forEach((option, optionIndex) => { const optionDiv = document.createElement('div'); optionDiv.className = 'access-option'; if (optionIndex === state.menu.selectedIndex) { optionDiv.classList.add('selected'); } const labelDiv = document.createElement('div'); labelDiv.className = 'access-label'; labelDiv.textContent = option.label; optionDiv.appendChild(labelDiv); const choicesDiv = document.createElement('div'); choicesDiv.className = 'access-choices'; option.choices.forEach(choice => { const choiceBox = document.createElement('div'); choiceBox.className = 'choice-box ' + (choice.classes || ''); if (choice.value === state.accessibility[option.id]) { choiceBox.classList.add('active'); } choiceBox.textContent = choice.text; choicesDiv.appendChild(choiceBox); }); optionDiv.appendChild(choicesDiv); container.appendChild(optionDiv); });
        output.appendChild(container);

        const exitDiv = document.createElement('div');
        exitDiv.className = 'access-exit-text';
        exitDiv.innerHTML = "\n[exit] Return to settings";
        output.appendChild(exitDiv);
        terminal.scrollTop = terminal.scrollHeight;
    };

    const renderInput = () => {
        state.cursorPosition = Math.max(0, Math.min(state.currentInput.length, state.cursorPosition));
        const pre = state.currentInput.substring(0, state.cursorPosition);
        const post = state.currentInput.substring(state.cursorPosition);

        if (state.subState === 'password' || state.subState === 'register_password') {
            inputPreCursor.textContent = pre.replace(/./g, '*');
            inputPostCursor.textContent = post.replace(/./g, '*');
        } else {
            inputPreCursor.textContent = pre;
            inputPostCursor.textContent = post;
        }
    };

    function applyAccessibilitySettings() {
        document.body.classList.remove('theme-green', 'theme-amber', 'theme-solarized-dark');
        if (state.accessibility.theme !== 'default') {
            document.body.classList.add(`theme-${state.accessibility.theme}`);
        }
        document.body.classList.remove('font-size-small', 'font-size-normal', 'font-size-large');
        document.body.classList.add(`font-size-${state.accessibility.fontSize}`);
        document.body.classList.toggle('no-blink', !state.accessibility.cursorBlink);
    }

    function saveAccessibilitySettings() {
        localStorage.setItem('accessibility', JSON.stringify(state.accessibility));
    }

    function loadAccessibilitySettings() {
        const saved = localStorage.getItem('accessibility');
        if (saved) state.accessibility = JSON.parse(saved);
        state.accessibility.fontSize = state.accessibility.fontSize || 'normal';
        applyAccessibilitySettings();
    }

    document.addEventListener('keydown', (e) => {
        if (state.isExecuting) {
            if (e.ctrlKey && e.key === 'c') {
                state.abortController.abort();
            }
            return;
        }

        if (e.key === 'Enter') {
            if (state.currentInput.trim() !== '') {
                processCommand(state.currentInput);
            } 
            else if (state.menu.isNavigable) {
                const selectedCommand = state.menu.items[state.menu.selectedIndex]?.command;
                if (selectedCommand) processCommand(selectedCommand);
            }
        } else if (state.appState === 'accessibility' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            const currentOption = state.menu.items[state.menu.selectedIndex];
            if (!currentOption) return;

            if (e.key === 'ArrowUp' && state.menu.selectedIndex > 0) {
                state.menu.selectedIndex--;
            } else if (e.key === 'ArrowDown' && state.menu.selectedIndex < state.menu.items.length - 1) {
                state.menu.selectedIndex++;
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                const choices = currentOption.choices;
                let currentChoiceIndex = choices.findIndex(c => c.value === state.accessibility[currentOption.id]);

                if (e.key === 'ArrowLeft' && currentChoiceIndex > 0) {
                    currentChoiceIndex--;
                } else if (e.key === 'ArrowRight' && currentChoiceIndex < choices.length - 1) {
                    currentChoiceIndex++;
                }
                const newValue = choices[currentChoiceIndex].value;
                state.accessibility[currentOption.id] = newValue;
                applyAccessibilitySettings();
                saveAccessibilitySettings();

                if (currentOption.id === 'typingSpeed') {
                    type(`Typing speed set to ${choices[currentChoiceIndex].text}.`);
                }
            }
            renderAccessibilityMenu();

        } else if (state.menu.isNavigable && state.accessibility.menuArrows && e.key === 'ArrowUp') {
            e.preventDefault();
            if (state.menu.selectedIndex > 0) {
                state.menu.selectedIndex--;
                renderMenu();
            }
        } else if (state.menu.isNavigable && state.accessibility.menuArrows && e.key === 'ArrowDown') {
            e.preventDefault();
            const lastSelectableIndex = state.menu.items.findIndex(item => item.text.includes('\n'));
            const maxIndex = lastSelectableIndex !== -1 ? lastSelectableIndex : state.menu.items.length - 1;
            if (state.menu.selectedIndex < maxIndex) {
                state.menu.selectedIndex++;
                renderMenu();
            }
        } else if (state.menu.isNavigable && e.key.length === 1 && !isNaN(parseInt(e.key)) && parseInt(e.key) > 0) {
            const num = parseInt(e.key);
            const item = state.menu.items.find(i => i.text.startsWith(`[${num}]`));
            if (item) {
                processCommand(item.command);
            }
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (state.cursorPosition > 0) state.cursorPosition--;
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (state.cursorPosition < state.currentInput.length) state.cursorPosition++;
        } else if (e.key === 'Backspace') {
            if (state.cursorPosition > 0) {
                const pre = state.currentInput.substring(0, state.cursorPosition - 1);
                const post = state.currentInput.substring(state.cursorPosition);
                state.currentInput = pre + post;
                state.cursorPosition--;
            }
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
            state.cursorPosition = state.currentInput.length;
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            const pre = state.currentInput.substring(0, state.cursorPosition);
            const post = state.currentInput.substring(state.cursorPosition);
            state.currentInput = pre + e.key + post;
            state.cursorPosition++;
        }

        renderInput();
    });

    const boot = async () => {
        state.isExecuting = true;
        inputWrapper.style.display = 'none';
        loadAccessibilitySettings();
        await type("Booting AI Terminal...", 30);
        await new Promise(r => setTimeout(r, 500));

        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            state.currentUser = JSON.parse(savedUser);
            await type(`Resuming session for ${state.currentUser.username}...`, 30);

            if (state.currentUser.username !== 'Guest') {
                await type("Verifying session with server...", 30);
                const response = await fetch('/api/user_data');
                if (response.ok) {
                    state.currentUser = await response.json();
                    localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
                    await type("Server sync complete. Session restored. ✅");
                } else {
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