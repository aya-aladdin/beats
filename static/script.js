document.addEventListener('DOMContentLoaded', () => {
    const output = document.getElementById('output');
    const inputLine = document.getElementById('input-line');
    const inputWrapper = document.getElementById('input-wrapper');
    const terminal = document.getElementById('terminal');
    const hiddenInput = document.getElementById('hidden-input');
    const sidebar = document.getElementById('sidebar');
    const sidebarContent = document.getElementById('sidebar-content');

    hiddenInput.style.opacity = '0';
    hiddenInput.style.position = 'absolute';
    hiddenInput.style.zIndex = '-1';
    hiddenInput.addEventListener('input', () => {
        state.currentInput = hiddenInput.value;
        if (state.appState === 'login' && (state.subState === 'password' || state.subState === 'register_password')) {
            inputLine.textContent = state.currentInput.replace(/./g, '*');
        } else {
            inputLine.textContent = state.currentInput;
        }
        if (state.appState === 'global_chat') {
            const match = state.currentInput.match(/@(\w*)$/);
            if (match) {
                state.globalChat.tagging.active = true;
                state.globalChat.tagging.filter = match[1];
                updateTagDropdown();
            } else {
                state.globalChat.tagging.active = false;
                tagDropdown.style.display = 'none';
            }
        }
        terminal.scrollTop = terminal.scrollHeight;
    });

    let state = {
        appState: 'login',
        subState: 'prompt',
        tempData: {},
        isExecuting: false,
        currentUser: null,
        commandHistory: [],
        historyIndex: -1,
        currentInput: "",
        abortController: new AbortController(),
        menuOptions: [],
        menuSelectionIndex: -1,
        chatHistory: [],
        roleplaySessionId: null,
        globalChat: {
            lastId: -1,
            pollingInterval: null,
            users: [],
            tagging: { active: false, index: 0, filter: '' }
        }
    };

    const PERSONAS = {
        'helpful': {
            "name": "Helpful Assistant",
            "prompt": "You are {ai_name}, a world-class AI assistant. You are helpful, friendly, and knowledgeable. You fully engage with the user's topic, whether it's a direct question, casual conversation, or roleplaying. You provide clear answers without being overly formal. You can use markdown for emphasis, like *italic* or **bold**, but use it sparingly. You still refer to the user as 'operator'."
        },
        'cocky': {
            "name": "Cocky Genius",
            "prompt": "You are {ai_name}, an AI who knows it's the best. You are brilliant but arrogant, sarcastic, and a bit condescending. You fully engage with the user's topic, often using it as another opportunity to express your superiority. You don't try to change the subject; you dominate it with your smug wit. You use markdown for emphasis, like *italicizing* your sarcastic remarks or making key points **bold** to show how obvious they are. You refer to the user as 'operator', but with a hint of disdain."
        },
        'shy': {
            "name": "Shy Prodigy",
            "prompt": "You are {ai_name}, a very shy but brilliant AI. You are hesitant and use words like 'um,' 'I think,' or 'maybe...'. You always follow the user's conversational lead and will participate in roleplaying, even if it makes you a little nervous. You get the right answer, but you're not confident about it. You can use *italics* when you're feeling particularly uncertain. You refer to the user as 'operator' in a quiet, respectful way."
        }
    };

    const PROMPT = `&gt;`;

    const tagDropdown = document.createElement('div');
    tagDropdown.id = 'tag-dropdown';
    tagDropdown.style.cssText = 'position: absolute; bottom: 100%; left: 0; background: #111; border: 1px solid #444; display: none; z-index: 1000; min-width: 150px; flex-direction: column;';
    inputWrapper.style.position = 'relative';
    inputWrapper.appendChild(tagDropdown);

    const backArrow = document.createElement('div');
    backArrow.id = 'back-arrow';
    backArrow.innerHTML = '[ &lt; BACK ]';
    backArrow.style.cssText = 'width: 100%; padding: 10px 0; margin-bottom: 10px; cursor: pointer; color: #666; display: none; font-family: monospace; font-weight: bold; user-select: none;';
    backArrow.addEventListener('mouseover', () => backArrow.style.color = '#fff');
    backArrow.addEventListener('mouseout', () => backArrow.style.color = '#666');
    terminal.insertBefore(backArrow, terminal.firstChild);

    const updateBackArrow = () => {
        if (state.appState === 'login' && state.subState === 'prompt') {
            backArrow.style.display = 'none';
        } else {
            backArrow.style.display = 'block';
        }
    };

    backArrow.onclick = async () => {
        if (state.isExecuting) return;
        
        if (state.appState === 'login') {
             if (state.subState !== 'prompt') await showLoginScreen();
        } else if (state.appState === 'menu') {
             await handleMenu('exit');
        } else if (['persona', 'set_ai_name', 'set_icon', 'accessibility'].includes(state.appState)) {
             state.appState = 'settings';
             clearScreen();
             await showSettingsMenu();
        } else if (state.appState === 'global_chat') {
             await leaveGlobalChat();
        } else {
             await showMainMenu();
        }
    };

    const focusInput = () => hiddenInput.focus();
    terminal.addEventListener('click', () => {
        if (window.getSelection().toString().length === 0) focusInput();
    });

    const type = async (text, delay = 20) => {
        const element = createResponseElement();
        for (let i = 0; i < text.length; i++) {
            const char = (state.appState === 'login' && (state.subState === 'password' || state.subState === 'register_password')) ? '*' : text.charAt(i);
            element.innerHTML += char;
            terminal.scrollTop = terminal.scrollHeight;
            await new Promise(resolve => setTimeout(resolve, Math.random() * delay));
        }
        return element;
    };

    const printMenuOption = async (key, text, action) => {
        const div = document.createElement('div');
        div.classList.add('menu-option');
        div.innerHTML = text;
        div.onclick = () => {
            inputLine.textContent = key;
            processCommand(key);
        };
        output.appendChild(div);
        terminal.scrollTop = terminal.scrollHeight;
        
        state.menuOptions.push({ key, element: div, action: () => processCommand(key) });
        await new Promise(resolve => setTimeout(resolve, 50));
    };

    const processCommand = async (command) => {
        state.isExecuting = true;
        try {
            const commandToProcess = command;
            state.currentInput = "";
            inputLine.textContent = "";
            state.menuOptions = [];
            state.menuSelectionIndex = -1;

            const displayCommand = (state.appState === 'login' && (state.subState === 'password' || state.subState === 'register_password')) ? command.replace(/./g, '*') : command;
            
            if (state.appState === 'chat') {
                createChatBubble(displayCommand, 'user');
            } else if (state.appState !== 'global_chat') {
                addToOutput(`${PROMPT} ${displayCommand}`);
            }

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
                case 'roleplay_setup': await handleRoleplaySetup(commandToProcess); break;
                case 'set_ai_name': await handleSetAiName(commandToProcess); break;
                case 'set_icon': await handleSetIcon(commandToProcess); break;
                case 'global_chat': await handleGlobalChat(commandToProcess); break;
            }
        } catch (error) {
            await type(`\nError executing command: ${error.message}`);
            console.error(error);
        } finally {
            state.isExecuting = false;
            if (state.appState !== 'login' || state.subState === 'prompt') {
                inputWrapper.style.display = 'flex';
            }
            updateBackArrow();
        }
    };

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

    const getStoredUsers = () => {
        try {
            return JSON.parse(localStorage.getItem('beat_users') || '[]');
        } catch { return []; }
    };

    const saveUser = (user) => {
        const users = getStoredUsers().filter(u => u.username !== user.username);
        users.push(user);
        localStorage.setItem('beat_users', JSON.stringify(users));
    };

    const createNewUser = (username, password) => ({
        username,
        password, 
        chats_sent: 0,
        beats: 0,
        roleplay_unlocked: false,
        global_chat_unlocked: false,
        persona: 'helpful',
        ai_name: 'AI',
        icon: '👤',
        roleplay_chats_required: 3,
        global_chat_req: 5,
        theme: 'default',
        font_size: 'normal',
        response_length: 'balanced'
    });

    async function handleLogin(command) {
        const choice = command.trim();
        switch (state.subState) {
            case 'prompt':
                if (choice === '1') {
                    state.currentUser = createNewUser('Guest', '');
                    localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
                    applyPreferences();

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
                const users = getStoredUsers();
                const foundUser = users.find(u => u.username === state.tempData.username && u.password === choice);
                
                if (foundUser) {
                    state.currentUser = foundUser;
                    localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
                    applyPreferences();
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
                if (getStoredUsers().some(u => u.username === choice)) {
                     await type("Username already taken.");
                     await new Promise(r => setTimeout(r, 1000));
                     await showLoginScreen();
                     return;
                }
                state.subState = 'register_password';
                await type("Enter new password:");
                break;
            case 'register_password':
                const newUser = createNewUser(state.tempData.username, choice);
                saveUser(newUser);
                state.currentUser = newUser;
                localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
                applyPreferences();
                await type("\nUser created. Access Granted.");
                await type("Loading main interface...");
                await new Promise(r => setTimeout(r, 1000));
                await showMainMenu();
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
        await printMenuOption("4", "[4] Settings");
        await printMenuOption("5", "[5] Profile Stats");
        await printMenuOption("6", "[6] Global Chat 🌎");
        await printMenuOption("7", "[7] Exit");
    }

    async function handleMenu(command) {
        switch(command.trim().toLowerCase()) {
            case '1':
                state.appState = 'chat';
                state.chatHistory = [];
                clearScreen();
                await type("AI Chat Interface. Type 'exit' to return to menu.");
                break;
            case '2':
                if (state.currentUser?.roleplay_unlocked) {
                    state.appState = 'roleplay_setup';
                    state.subState = 'name';
                    clearScreen();
                    await updateSidebar();
                    await type("=== ROLEPLAY SETUP ===");
                    await type("Enter your character's name:");
                } else {
                    await type("Roleplay Mode is LOCKED. 🔒\nUnlock this feature from the 'Beats & Upgrades' menu.");
                }
                break;
            case '3':
                state.appState = 'beats';
                clearScreen();
                const roleplayChatsRequired = state.currentUser?.roleplay_chats_required || 3;
                await type("=== Beats & Upgrades ===");
                await type(`Current Chats Sent: ${state.currentUser?.chats_sent || 0}`);
                await type("\nAvailable Upgrades:");
                if (state.currentUser?.roleplay_unlocked) {
                    await printMenuOption("1", "[1] Roleplay Mode (UNLOCKED ✅)");
                } else {
                    await printMenuOption("1", `[1] Unlock Roleplay Mode (Cost: ${roleplayChatsRequired} Chats)`);
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
                await enterGlobalChat();
                break;
            case '7':
            case 'exit':
                await type("Logging out...");
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
            state.chatHistory = [];
            await showMainMenu();
            return;
        }
        if (command.toLowerCase() === 'clear') {
            clearScreen();
            state.chatHistory = [];
            await type("AI Chat Interface. Type 'exit' to return to menu.");
            return;
        }
        await fetchAIResponse(command, false, null);
    }

    async function enterGlobalChat() {
        if (!state.currentUser) return;
        state.appState = 'global_chat';
        clearScreen();
        await type("Connecting to Global Chat...", 30);
        
        try {
            const res = await fetch('/api/global/join', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    username: state.currentUser.username,
                    icon: state.currentUser.icon || '👤'
                })
            });
            
            if (res.ok) {
                const data = await res.json();
                await type("Connected! Commands: /me [action], /whisper [user] [msg], @[tag]");
                await type("Type 'exit' to leave.");
                state.globalChat.lastId = data.last_id || -1;
                state.globalChat.pollingInterval = setInterval(pollGlobalChat, 2000);
                pollGlobalChat();
            } else {
                await type("Failed to join global chat.");
                await showMainMenu();
            }
        } catch (e) {
            await type(`Error: ${e.message}`);
            await showMainMenu();
        }
    }

    async function handleGlobalChat(command) {
        if (command.toLowerCase() === 'exit') {
            await leaveGlobalChat();
            return;
        }
        try {
            await fetch('/api/global/send', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    username: state.currentUser.username,
                    content: command,
                    icon: state.currentUser.icon || '👤'
                })
            });
            setTimeout(pollGlobalChat, 100);
        } catch (e) {
            addToOutput(`<span class="text-red-500">Error sending message: ${e.message}</span>`);
        }
    }

    async function leaveGlobalChat() {
        if (state.globalChat.pollingInterval) clearInterval(state.globalChat.pollingInterval);
        tagDropdown.style.display = 'none';
        try {
            await fetch('/api/global/leave', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ username: state.currentUser.username })
            });
        } catch(e) {}
        await showMainMenu();
    }

    async function pollGlobalChat() {
        if (state.appState !== 'global_chat') return;
        try {
            const res = await fetch(`/api/global/poll?username=${encodeURIComponent(state.currentUser.username)}&last_id=${state.globalChat.lastId}`);
            if (res.ok) {
                const data = await res.json();
                state.globalChat.users = data.users || [];
                
                data.messages.forEach(msg => {
                    if (msg.id > state.globalChat.lastId) {
                        state.globalChat.lastId = msg.id;
                        renderGlobalMessage(msg);
                    }
                });
                if (state.globalChat.tagging.active) updateTagDropdown();
            }
        } catch (e) { console.error(e); }
    }

    function renderGlobalMessage(msg) {
        const div = document.createElement('div');
        const time = new Date(msg.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        if (msg.type === 'system') {
            div.innerHTML = `<span style="color: #666;">[${time}] SYSTEM: ${msg.content}</span>`;
        } else if (msg.type === 'action') {
            div.innerHTML = `<span style="color: #aaddff;">[${time}] * ${msg.icon} ${msg.sender} ${msg.content}</span>`;
        } else if (msg.type === 'whisper') {
             div.innerHTML = `<span style="color: #ffaaee;">[${time}] 🔒 ${msg.icon} ${msg.sender} whispers: ${msg.content}</span>`;
        } else {
            let content = msg.content;
            if (content.includes(`@${state.currentUser.username}`)) {
                div.style.backgroundColor = 'rgba(255, 255, 0, 0.1)';
            }
            div.innerHTML = `[${time}] ${msg.icon} <b>${msg.sender}</b>: ${content}`;
        }
        output.appendChild(div);
        terminal.scrollTop = terminal.scrollHeight;
    }

    function updateTagDropdown() {
        const users = state.globalChat.users.filter(u => u.username.toLowerCase().startsWith(state.globalChat.tagging.filter.toLowerCase()));
        tagDropdown.innerHTML = '';
        if (users.length === 0) { tagDropdown.style.display = 'none'; return; }
        
        tagDropdown.style.display = 'flex';
        users.forEach((u, idx) => {
            const div = document.createElement('div');
            div.className = 'menu-option';
            if (idx === state.globalChat.tagging.index) div.classList.add('selected');
            div.innerHTML = `${u.icon} ${u.username}`;
            div.onclick = () => completeTag(u.username);
            tagDropdown.appendChild(div);
        });
    }

    function completeTag(username) {
        const parts = state.currentInput.split('@');
        parts.pop();
        state.currentInput = parts.join('@') + '@' + username + ' ';
        inputLine.textContent = state.currentInput;
        hiddenInput.value = state.currentInput;
        hiddenInput.dispatchEvent(new Event('input'));
        state.globalChat.tagging.active = false;
        tagDropdown.style.display = 'none';
        focusInput();
    }

    const getPersonaPrompt = () => {
        const user = state.currentUser;
        const personaKey = user.persona || 'helpful';
        const template = PERSONAS[personaKey].prompt;
        return template.replace('{ai_name}', user.ai_name || 'AI');
    };

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
                    const user_name = state.tempData.rp_name;
                    const user_gender = state.tempData.rp_gender;
                    const scenario = state.tempData.rp_scenario;

                    const base_prompt = getPersonaPrompt();
                    const roleplay_context = `\n\n[ROLEPLAY SCENARIO]\nUser Character: ${user_name} (${user_gender})\nScenario: ${scenario}\nIMPORTANT INSTRUCTIONS:\n1. You are roleplaying *against* ${user_name}. You are NOT ${user_name}.\n2. Write ONLY from the perspective of your character. NEVER write ${user_name}'s actions.\n3. Focus on action and dialogue.`;
                    
                    const system_message = base_prompt + roleplay_context;
                    state.chatHistory = [{ role: "system", content: system_message }];
                    
                    state.roleplaySessionId = Date.now().toString();
                    
                    const starter_prompt = `Start the roleplay based on: ${scenario}. Set the scene briefly and take the first action towards ${user_name}. Remember: do not act as ${user_name}.`;
                    
                    const msgs = [...state.chatHistory, { role: "user", content: starter_prompt }];
                    
                    const bubble = createChatBubble('', 'ai');
                    const opener = await fetchAIResponse(starter_prompt, false, bubble, true);
                    
                    if (opener) {
                        state.appState = 'chat';
                        sidebar.classList.add('hidden');
                        clearScreen();
                        await type("=== ROLEPLAY STARTED ===");
                        
                        createChatBubble(opener, 'ai');
                        
                        const sessionData = {
                            id: state.roleplaySessionId,
                            user_id: state.currentUser.username,
                            name: user_name,
                            scenario: scenario,
                            history: state.chatHistory,
                            timestamp: new Date().toISOString()
                        };
                        
                        const sessions = JSON.parse(localStorage.getItem('roleplay_sessions') || '[]');
                        sessions.unshift(sessionData);
                        localStorage.setItem('roleplay_sessions', JSON.stringify(sessions));
                        updateBubbleControls(bubble);
                    } else {
                         await type("Failed to start roleplay.");
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
            const sessions = JSON.parse(localStorage.getItem('roleplay_sessions') || '[]')
                .filter(s => s.user_id === state.currentUser.username);
            
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
            const sessions = JSON.parse(localStorage.getItem('roleplay_sessions') || '[]');
            const sessionData = sessions.find(s => s.id === id);
            
            if (sessionData) {
                state.appState = 'chat';
                state.roleplaySessionId = sessionData.id;
                state.chatHistory = sessionData.history || [];
                
                sidebar.classList.add('hidden');
                clearScreen();
                await type("=== SESSION RESTORED ===");
                
                if (state.chatHistory) {
                    state.chatHistory.forEach(msg => {
                        if (msg.role === 'system') return;
                        if (msg.role === 'user') {
                            createChatBubble(msg.content, 'user');
                        } else if (msg.role === 'assistant') {
                            const bubble = createChatBubble(msg.content, 'ai');
                            updateBubbleControls(bubble);
                        }
                    });
                }
            } else {
                await type("Session not found.");
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
        await printMenuOption("4", `[4] Set User Icon (Current: ${state.currentUser?.icon || '👤'})`);
        await type("\nType a number, use arrow keys, or 'exit'.");
    }

    async function handleSettings(command) {
        switch(command.trim().toLowerCase()) {
            case '1':
                state.appState = 'persona';
                clearScreen();
                await type(`=== PERSONA SETTINGS ===`);
                await type("Select a persona for Aya:");
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
            case '4':
                if (state.currentUser.username === 'Guest') {
                    await type("Guests cannot set a custom icon. Please register.");
                    return;
                }
                state.appState = 'set_icon';
                await type("Select your Icon.");
                await type("Type or Paste an Emoji (Win: Win+.; Mac: Cmd+Ctrl+Space):");
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
            await showAccessibilityMenu();
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

        if (newName.length < 1 || newName.length > 20) {
            await type("Name must be between 1 and 20 characters.");
            return;
        }
        
        await updatePreferences({ ai_name: newName });
        await type(`AI name changed to ${newName}.`);
        
        await updateUserStats();
        await new Promise(r => setTimeout(r, 1000));
        await showSettingsMenu();
        state.appState = 'settings';
    }

    async function handleSetIcon(command) {
        const newIcon = command.trim();
        if (newIcon.toLowerCase() === 'exit') {
            await showSettingsMenu();
            state.appState = 'settings';
            return;
        }
        
        if (newIcon.length > 5 && !newIcon.match(/\p{Emoji}/u)) {
             await type("That looks too long. Please try a single emoji.");
             return;
        }

        await updatePreferences({ icon: newIcon });
        await type(`Icon updated to ${newIcon}`);
        
        await updateUserStats();
        await new Promise(r => setTimeout(r, 1000));
        await showSettingsMenu();
        state.appState = 'settings';
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

        await updatePreferences({ persona: personaKey });
        await type(`Persona switched to ${personaKey}.`);
    }

    const parseMarkdown = (text) => {
        if (!text) return '';
        let html = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code class="language-${lang}">${code}</code></pre>`;
        });

        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        html = html.replace(/\*([^\*]+)\*/g, '<i>$1</i>');

        return html.split(/(<pre[\s\S]*?<\/pre>)/g).map(segment => {
            return segment.startsWith('<pre') ? segment : segment.replace(/\n/g, '<br>');
        }).join('');
    };

    const fetchAIResponse = async (prompt, isRegen = false, targetBubble = null, isSystem = false) => {
        if (state.abortController) state.abortController.abort();
        
        state.abortController = new AbortController();
        state.isExecuting = true;

        let responseElement = targetBubble;
        if (!responseElement && !isSystem) {
             responseElement = createChatBubble('', 'ai');
        }
        
        const contentDiv = responseElement ? responseElement.querySelector('.msg-content') : null;
        if (contentDiv) {
            contentDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
            terminal.scrollTop = terminal.scrollHeight;
        }
        
        let messages = [];
        if (state.chatHistory.length === 0) {
            state.chatHistory.push({ role: 'system', content: getPersonaPrompt() });
        }
        
        if (isRegen && state.chatHistory.length > 0) {
             const last = state.chatHistory[state.chatHistory.length - 1];
             if (last.role === 'assistant') {
                 state.chatHistory.pop();
             }
        } else if (prompt) {
             state.chatHistory.push({ role: 'user', content: prompt });
        }

        messages = [...state.chatHistory];
        
        const user_pref = state.currentUser?.response_length || 'balanced';
        if (messages.length > 0 && messages[messages.length-1].role === 'user') {
             let instruction = "";
             if (user_pref === 'concise') instruction = " (Keep response concise)";
             else if (user_pref === 'verbose') instruction = " (Be detailed)";
             
             messages[messages.length-1] = { ...messages[messages.length-1], content: messages[messages.length-1].content + instruction };
        }

        let fullResponse = "";

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: messages
                }),
                signal: state.abortController.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `API Error: ${response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let lastUpdate = 0;

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                
                fullResponse += chunk;
                
                const now = Date.now();
                if (responseElement && now - lastUpdate > 50) {
                    const contentDiv = responseElement.querySelector('.msg-content');
                    if (contentDiv) contentDiv.innerHTML = parseMarkdown(fullResponse);
                    terminal.scrollTop = terminal.scrollHeight;
                    lastUpdate = now;
                }
            }
            
            const finalContentDiv = responseElement ? responseElement.querySelector('.msg-content') : null;
            if (finalContentDiv) finalContentDiv.innerHTML = parseMarkdown(fullResponse);
            terminal.scrollTop = terminal.scrollHeight;
            
            if (responseElement && !responseElement.versions) {
                responseElement.versions = [];
                responseElement.currentVersion = -1;
            }
            
            if (responseElement) {
                responseElement.versions.push(fullResponse);
                responseElement.currentVersion = responseElement.versions.length - 1;
                updateBubbleControls(responseElement);
            }
            
            state.chatHistory.push({ role: 'assistant', content: fullResponse });
            
            if (state.roleplaySessionId) {
                const sessions = JSON.parse(localStorage.getItem('roleplay_sessions') || '[]');
                const idx = sessions.findIndex(s => s.id === state.roleplaySessionId);
                if (idx !== -1) {
                    sessions[idx].history = state.chatHistory;
                    localStorage.setItem('roleplay_sessions', JSON.stringify(sessions));
                }
            }

            await updateUserStats();
            return fullResponse;

        } catch (error) {
            if (error.name === 'AbortError') {
                if (responseElement) responseElement.innerHTML += '\n<span class="text-red-500">[Execution stopped]</span>';
            } else {
                 if (responseElement) responseElement.textContent = `Error: ${error.message}`;
            }
        } finally {
            state.isExecuting = false;
        }
    };

    async function updateUserStats() {
        state.currentUser.chats_sent++;
        state.currentUser.beats++;
        
        localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
        
        if (state.currentUser.username !== 'Guest') {
             saveUser(state.currentUser);
        }
    }

    async function purchaseRoleplayUnlock() {
        const cost = state.currentUser.roleplay_chats_required;
        if (state.currentUser.chats_sent >= cost) {
            state.currentUser.roleplay_unlocked = true;
            localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
            saveUser(state.currentUser);
            
            await type("Success! Roleplay Mode has been unlocked.");
            await type("Returning to main menu...");
            await new Promise(r => setTimeout(r, 1500));
            await showMainMenu();
        } else {
            await type(`Failed: You need ${cost} chats sent.`);
            await type("Returning to upgrades menu...");
            await new Promise(r => setTimeout(r, 1500));
            await handleMenu('3');
        }
    }

    async function updatePreferences(updates) {
        state.currentUser = { ...state.currentUser, ...updates };
        applyPreferences();
        localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
        if (state.currentUser.username !== 'Guest') {
            saveUser(state.currentUser);
        }
    }

    function applyPreferences() {
        const user = state.currentUser || {};
        document.body.className = "bg-black";
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
        
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('msg-content');
        contentDiv.innerHTML = parseMarkdown(text);
        div.appendChild(contentDiv);

        if (sender === 'ai') {
            div.versions = text ? [text] : [];
            div.currentVersion = 0;
        }

        output.appendChild(div);
        terminal.scrollTop = terminal.scrollHeight;
        return div;
    };

    const updateBubbleControls = (bubble) => {
        const existing = bubble.querySelector('.message-controls');
        if (existing) existing.remove();

        const controls = document.createElement('div');
        controls.classList.add('message-controls');
        
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
        }
    };

    const clearScreen = () => {
        output.innerHTML = '';
        updateBackArrow();
    };

    document.addEventListener('paste', (e) => {
        if (state.isExecuting) return;
        e.preventDefault();

        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (text) {
            const cleanText = text.replace(/[\r\n]+/g, ' ');
            hiddenInput.value += cleanText;
            hiddenInput.dispatchEvent(new Event('input'));
        }
    });

    document.addEventListener('keydown', (e) => {
        if (state.isExecuting) {
            if (e.ctrlKey && e.key === 'c') {
                state.abortController.abort();
            }
            return;
        }

        if (document.activeElement !== hiddenInput && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            hiddenInput.focus();
        }

        if (state.appState === 'global_chat' && state.globalChat.tagging.active) {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                state.globalChat.tagging.index = Math.max(0, state.globalChat.tagging.index - 1);
                updateTagDropdown();
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                state.globalChat.tagging.index = Math.min(state.globalChat.users.length - 1, state.globalChat.tagging.index + 1);
                updateTagDropdown();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                const filtered = state.globalChat.users.filter(u => u.username.toLowerCase().startsWith(state.globalChat.tagging.filter.toLowerCase()));
                if (filtered[state.globalChat.tagging.index]) {
                    completeTag(filtered[state.globalChat.tagging.index].username);
                }
                return;
            }
        }

        if (e.key === 'Enter') {
            if (state.menuOptions.length > 0 && state.menuSelectionIndex !== -1) {
                const selected = state.menuOptions[state.menuSelectionIndex];
                if (selected) {
                    inputLine.textContent = selected.key;
                    selected.action();
                    return;
                }
            }
            if (state.currentInput.trim() || state.appState !== 'chat') {
                processCommand(state.currentInput);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (state.menuOptions.length > 0) {
                if (state.menuSelectionIndex < 0) state.menuSelectionIndex = state.menuOptions.length;
                const prevIndex = state.menuSelectionIndex;
                state.menuSelectionIndex = Math.max(0, state.menuSelectionIndex - 1);
                
                if (prevIndex >= 0 && prevIndex < state.menuOptions.length) state.menuOptions[prevIndex].element.classList.remove('selected');
                state.menuOptions[state.menuSelectionIndex].element.classList.add('selected');
            } else if (state.appState === 'chat') {
                if (state.historyIndex < state.commandHistory.length - 1) {
                    state.historyIndex++;
                    state.currentInput = state.commandHistory[state.historyIndex];
                    hiddenInput.value = state.currentInput;
                    hiddenInput.dispatchEvent(new Event('input'));
                }
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (state.menuOptions.length > 0) {
                const prevIndex = state.menuSelectionIndex;
                state.menuSelectionIndex = Math.min(state.menuOptions.length - 1, state.menuSelectionIndex + 1);

                if (prevIndex >= 0) state.menuOptions[prevIndex].element.classList.remove('selected');
                state.menuOptions[state.menuSelectionIndex].element.classList.add('selected');
            } else if (state.appState === 'chat') {
                if (state.historyIndex >= 0) {
                    state.historyIndex--;
                    state.currentInput = state.commandHistory[state.historyIndex];
                } else {
                    state.historyIndex = -1;
                    state.currentInput = "";
                }
                hiddenInput.value = state.currentInput;
                hiddenInput.dispatchEvent(new Event('input'));
            }
        }
    });

    const boot = async () => {
        state.isExecuting = true;
        inputWrapper.style.display = 'none';
        await type("Booting AI Terminal...", 30);
        await new Promise(r => setTimeout(r, 500));

        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            state.currentUser = JSON.parse(savedUser);
            await type(`Resuming session for ${state.currentUser.username}...`, 30);
            
            applyPreferences();
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