document.addEventListener('DOMContentLoaded', () => {
    const output = document.getElementById('output');
    const inputLine = document.getElementById('input-line');
    const inputWrapper = document.getElementById('input-wrapper');
    const terminal = document.getElementById('terminal');
    const hiddenInput = document.getElementById('hidden-input');
    const sidebar = document.getElementById('sidebar');
    const sidebarContent = document.getElementById('sidebar-content');

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
        chatInterval: null,
        lastChatId: 0,
        users: [],
        suggestions: [],
        suggestionIndex: -1
    };

    const PROMPT = `&gt;`;

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
                case 'global_chat': await handleGlobalChat(commandToProcess); break;
                case 'beats': await handleBeats(commandToProcess); break;
                case 'persona': await handlePersona(commandToProcess); break;
                case 'settings': await handleSettings(commandToProcess); break;
                case 'accessibility': await handleAccessibility(commandToProcess); break;
                case 'roleplay_setup': await handleRoleplaySetup(commandToProcess); break;
                case 'set_ai_name': await handleSetAiName(commandToProcess); break;
                case 'set_icon': await handleSetIcon(commandToProcess); break;
            }
        } catch (error) {
            await type(`\nError executing command: ${error.message}`);
            console.error(error);
        } finally {
            state.isExecuting = false;
            if (state.appState !== 'login' || state.subState === 'prompt') {
                inputWrapper.style.display = 'flex';
                updateSuggestions(); 
            }
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

    async function handleLogin(command) {
        const choice = command.trim();
        switch (state.subState) {
            case 'prompt':
                if (choice === '1') {
                    state.currentUser = { username: 'Guest', chats_sent: 0, beats: 0, roleplay_unlocked: false, global_chat_unlocked: false, persona: 'helpful', ai_name: 'AI', icon: '👤', roleplay_chats_required: 3, global_chat_req: 5, theme: 'default', font_size: 'normal', response_length: 'balanced' };
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
                const localUsers = JSON.parse(localStorage.getItem('beats_users') || '{}');
                const user = localUsers[state.tempData.username];
                
                if (user && user.password === choice) {
                     state.currentUser = user.data;
                     localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
                     applyPreferences();
                     await type("\nAccess Granted.");
                     await type("Loading main interface...");
                     await new Promise(r => setTimeout(r, 1000));
                     await showMainMenu();
                } else {
                    await type("Login failed. Invalid username or password.");
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
                const usersDb = JSON.parse(localStorage.getItem('beats_users') || '{}');
                if (usersDb[state.tempData.username]) {
                    await type("Username already exists.");
                    await new Promise(r => setTimeout(r, 1000));
                    await showLoginScreen();
                } else {
                    const newUser = { 
                        username: state.tempData.username, 
                        chats_sent: 0, beats: 0, 
                        roleplay_unlocked: false, global_chat_unlocked: false, 
                        persona: 'helpful', ai_name: 'AI', icon: '👤', 
                        roleplay_chats_required: 3, global_chat_req: 5, 
                        theme: 'default', font_size: 'normal', response_length: 'balanced' 
                    };
                    
                    usersDb[state.tempData.username] = {
                        password: choice,
                        data: newUser
                    };
                    localStorage.setItem('beats_users', JSON.stringify(usersDb));
                    
                    state.currentUser = newUser;
                    localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
                    applyPreferences();
                    await type("\nUser created. Access Granted.");
                    await type("Loading main interface...");
                    await new Promise(r => setTimeout(r, 1000));
                    await showMainMenu();
                }
                break;
        }
    }

    async function showMainMenu() {
        state.appState = 'menu';
        state.subState = 'prompt';
        clearScreen();
        const roleplayStatus = state.currentUser?.roleplay_unlocked ? "UNLOCKED ✅" : "LOCKED 🔒";
        const globalChatStatus = state.currentUser?.global_chat_unlocked ? "UNLOCKED ✅" : "LOCKED 🔒";
        await type("=== MAIN MENU ===");
        await printMenuOption("1", "[1] Talk to AI");
        await printMenuOption("2", `[2] Roleplay Mode (${roleplayStatus})`);
        await printMenuOption("3", `[3] Global Chat Room (${globalChatStatus})`);
        await printMenuOption("4", "[4] Beats & Upgrades");
        await printMenuOption("5", "[5] Settings");
        await printMenuOption("6", "[6] Profile Stats");
        await printMenuOption("7", "[7] Exit");
    }

    async function handleMenu(command) {
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
                    await updateSidebar();
                    await type("=== ROLEPLAY SETUP ===");
                    await type("Enter your character's name:");
                } else {
                    await type("Roleplay Mode is LOCKED. 🔒\nUnlock this feature from the 'Beats & Upgrades' menu.");
                }
                break;
            case '3':
                if (state.currentUser?.global_chat_unlocked) {
                    await enterGlobalChat();
                } else {
                    await type("Global Chat Room is LOCKED. 🔒\nUnlock this feature from the 'Beats & Upgrades' menu.");
                }
                break;
            case '4':
                state.appState = 'beats';
                clearScreen();
                const roleplayChatsRequired = state.currentUser?.roleplay_chats_required || 3;
                const globalChatReq = state.currentUser?.global_chat_req || 5;
                await type("=== Beats & Upgrades ===");
                await type(`Current Chats Sent: ${state.currentUser?.chats_sent || 0}`);
                await type("\nAvailable Upgrades:");
                if (state.currentUser?.roleplay_unlocked) {
                    await printMenuOption("1", "[1] Roleplay Mode (UNLOCKED ✅)");
                } else {
                    await printMenuOption("1", `[1] Unlock Roleplay Mode (Cost: ${roleplayChatsRequired} Chats)`);
                }
                if (state.currentUser?.global_chat_unlocked) {
                    await printMenuOption("2", "[2] Global Chat Room (UNLOCKED ✅)");
                } else {
                    await printMenuOption("2", `[2] Unlock Global Chat (Cost: ${globalChatReq} Chats)`);
                }

                await type("\nType a number to purchase or 'exit' to return.");
                break;
            case '5':
                state.appState = 'settings';
                clearScreen();
                await showSettingsMenu();
                break;
            case '6':
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
            case '7':
            case 'exit':
                await type("Logging out...");
                try { await fetch('/api/logout', { method: 'POST' }); } catch(e){}
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
                        sidebar.classList.add('hidden');
                        clearScreen();
                        await type("=== ROLEPLAY STARTED ===");
                        
                        const bubble = createChatBubble(data.opener, 'ai');
                        updateBubbleControls(bubble);
                    } else {
                        await type(`Error: ${data.error}`);
                        await new Promise(r => setTimeout(r, 2000));
                        await showMainMenu();
                        return;
                    }
                    
                    const sessions = JSON.parse(localStorage.getItem(`rp_sessions_${state.currentUser.username}`) || '[]');
                    const newSession = {
                        id: Date.now(),
                        name: state.tempData.rp_name,
                        scenario: state.tempData.rp_scenario,
                        timestamp: new Date().toISOString(),
                        history: data.history || []
                    };
                    sessions.unshift(newSession);
                    localStorage.setItem(`rp_sessions_${state.currentUser.username}`, JSON.stringify(sessions));
                    state.currentRpSessionId = newSession.id;

                } catch (e) {
                    await type(`Connection Error: ${e.message}`);
                }
                break;
        }
    }

    async function updateSidebar() {
        const sessions = JSON.parse(localStorage.getItem(`rp_sessions_${state.currentUser.username}`) || '[]');
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
        } catch (e) {
            await type(`Error loading session: ${e.message}`);
        }
    }

    async function enterGlobalChat() {
        state.appState = 'global_chat';
        clearScreen();
        await type("Connecting to encrypted global frequency...");
        await new Promise(r => setTimeout(r, 800));
        clearScreen();
        addToOutput("<div class='text-gray-500'>=== GLOBAL CHAT ROOM ===<br>Type 'exit' to disconnect.</div><br>");
        
        await fetch('/api/global_chat/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: 'entered the chat', type: 'system', username: state.currentUser.username })
        });

        await fetchGlobalMessages();
        
        if (state.chatInterval) clearInterval(state.chatInterval);
        state.chatInterval = setInterval(fetchGlobalMessages, 2000);
    }

    async function handleGlobalChat(command) {
        if (command.toLowerCase() === 'exit') {
            await fetch('/api/global_chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: 'left the chat', type: 'system', username: state.currentUser.username })
            });
            
            if (state.chatInterval) clearInterval(state.chatInterval);
            await showMainMenu();
            return;
        }
        
        let content = command;
        let type = 'message';
        let recipient = null;

        const isEmote = command.startsWith('@me ') || command.startsWith('/me ');
        if (isEmote) {
            content = command.substring(4).trim();
            type = 'emote';
        }

        const whisperMatch = command.match(/^\/(?:whisper|w|msg)\s+(\S+)\s+(.+)$/i);
        if (whisperMatch) {
            recipient = whisperMatch[1];
            content = whisperMatch[2];
            type = 'private';
        } else if (command.startsWith('/') && !isEmote) {
             await fetchGlobalMessages(); 
             return;
        }

        try {
            await fetch('/api/global_chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: content, type: type, recipient: recipient, username: state.currentUser.username })
            });
            await fetchGlobalMessages();
        } catch (e) {
            console.error(e);
        }
    }

    async function fetchGlobalMessages() {
        if (state.appState !== 'global_chat') {
            if (state.chatInterval) clearInterval(state.chatInterval);
            return;
        }

        try {
            const res = await fetch(`/api/global_chat/messages?username=${state.currentUser.username}`);
            if (!res.ok) return;
            const msgs = await res.json();
            
            const chatAreaId = 'global-chat-area';
            let chatArea = document.getElementById(chatAreaId);
            if (!chatArea) {
                chatArea = document.createElement('div');
                chatArea.id = chatAreaId;
                output.innerHTML = "<div class='text-gray-500'>=== GLOBAL CHAT ROOM ===<br>Type 'exit' to disconnect.</div><br>";
                output.appendChild(chatArea);
            }
            
            chatArea.innerHTML = msgs.map(m => {
                if (m.type === 'system') {
                    return `<div class="mb-1 text-gray-500 italic text-xs">* ${m.user} ${parseMarkdown(m.content)}</div>`;
                }
                
                if (m.type === 'emote') {
                    return `<div class="mb-1 text-cyan-600 italic">* ${m.user} ${parseMarkdown(m.content)}</div>`;
                }

                if (m.type === 'private') {
                    const isSender = m.user === state.currentUser?.username;
                    const label = isSender ? `To [${m.recipient}]` : `From [${m.user}]`;
                    return `<div class="mb-1 text-private"><span class="font-bold">${label}:</span> ${parseMarkdown(m.content)}</div>`;
                }

                const isMe = m.user === state.currentUser?.username;
                const iconHtml = (isMe && state.currentUser?.icon) ? `<span class="mr-2">${state.currentUser.icon}</span>` : '';
                
                const highlightedContent = m.content.replace(new RegExp(`@${state.currentUser?.username}\\b`, 'g'), '<span class="bg-mention text-white">@' + state.currentUser?.username + '</span>');

                return `<div class="mb-1"><span class="text-gray-500">[${m.time}]</span> ${iconHtml}<span class="font-bold text-cyan-400">${m.user}:</span> ${parseMarkdown(highlightedContent)}</div>`;
            }).join('');
            
            terminal.scrollTop = terminal.scrollHeight;
        } catch (e) {
            console.error(e);
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
        } else if (choice === '2') {
            if (state.currentUser?.global_chat_unlocked) {
                await type("You have already unlocked this feature.");
                return;
            }
            await purchaseGlobalChatUnlock();
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
        } else {
            state.currentUser.ai_name = newName;
            localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
            
            if (state.currentUser.username !== 'Guest') {
                 const usersDb = JSON.parse(localStorage.getItem('beats_users') || '{}');
                 if (usersDb[state.currentUser.username]) {
                     usersDb[state.currentUser.username].data = state.currentUser;
                     localStorage.setItem('beats_users', JSON.stringify(usersDb));
                 }
            }
            
            await type(`AI name changed to ${newName}.`);
            await updateUserStats();
            await new Promise(r => setTimeout(r, 1000));
            await showSettingsMenu();
            state.appState = 'settings';
        }
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
        
        state.currentUser.icon = newIcon;
        localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
        
        if (state.currentUser.username !== 'Guest') {
             const usersDb = JSON.parse(localStorage.getItem('beats_users') || '{}');
             if (usersDb[state.currentUser.username]) {
                 usersDb[state.currentUser.username].data = state.currentUser;
                 localStorage.setItem('beats_users', JSON.stringify(usersDb));
             }
        }
        
        await type("Icon updated.");
        
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

        state.currentUser.persona = personaKey;
        localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
        if (state.currentUser.username !== 'Guest') {
             const usersDb = JSON.parse(localStorage.getItem('beats_users') || '{}');
             if (usersDb[state.currentUser.username]) {
                 usersDb[state.currentUser.username].data = state.currentUser;
                 localStorage.setItem('beats_users', JSON.stringify(usersDb));
             }
        }
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

    const fetchAIResponse = async (prompt, isRegen = false, targetBubble = null) => {
        if (state.abortController) state.abortController.abort();
        
        state.abortController = new AbortController();
        state.isExecuting = true;

        const responseElement = targetBubble || createChatBubble('', 'ai');
        
        const contentDiv = responseElement.querySelector('.msg-content');
        if (contentDiv) {
            contentDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
            terminal.scrollTop = terminal.scrollHeight;
        }
        
        let fullResponse = "";

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: isRegen ? null : prompt,
                    regenerate: isRegen,
                    persona: state.currentUser?.persona,
                    ai_name: state.currentUser?.ai_name,
                    response_length: state.currentUser?.response_length
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
                if (now - lastUpdate > 50) {
                    const contentDiv = responseElement.querySelector('.msg-content');
                    if (contentDiv) contentDiv.innerHTML = parseMarkdown(fullResponse);
                    terminal.scrollTop = terminal.scrollHeight;
                    lastUpdate = now;
                }
            }
            
            const finalContentDiv = responseElement.querySelector('.msg-content');
            if (finalContentDiv) finalContentDiv.innerHTML = parseMarkdown(fullResponse);
            terminal.scrollTop = terminal.scrollHeight;
            
            if (!responseElement.versions) {
                responseElement.versions = [];
                responseElement.currentVersion = -1;
            }
            
            responseElement.versions.push(fullResponse);
            responseElement.currentVersion = responseElement.versions.length - 1;
            updateBubbleControls(responseElement);
            
            await updateUserStats();

            if (state.appState === 'chat' && state.currentRpSessionId) {
                 const sessions = JSON.parse(localStorage.getItem(`rp_sessions_${state.currentUser.username}`) || '[]');
                 const session = sessions.find(s => s.id === state.currentRpSessionId);
                 if (session) {
                     if (!isRegen) session.history.push({ role: 'user', content: prompt });
                     session.history.push({ role: 'assistant', content: fullResponse });
                     localStorage.setItem(`rp_sessions_${state.currentUser.username}`, JSON.stringify(sessions));
                 }
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                responseElement.innerHTML += '\n<span class="text-red-500">[Execution stopped]</span>';
            } else {
                responseElement.textContent = `Error: ${error.message}`;
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
             const usersDb = JSON.parse(localStorage.getItem('beats_users') || '{}');
             if (usersDb[state.currentUser.username]) {
                 usersDb[state.currentUser.username].data = state.currentUser;
                 localStorage.setItem('beats_users', JSON.stringify(usersDb));
             }
        }
    }

    async function purchaseRoleplayUnlock() {
        if (state.currentUser.chats_sent >= state.currentUser.roleplay_chats_required) {
            state.currentUser.roleplay_unlocked = true;
            localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
            await updateUserStats();
            await type("Success! Roleplay Mode has been unlocked.");
            await type("Returning to main menu...");
            await new Promise(r => setTimeout(r, 1500));
            await showMainMenu();
        } else {
            await type(`Failed: Requires ${state.currentUser.roleplay_chats_required} chats.`);
            await type("Returning to upgrades menu...");
            await new Promise(r => setTimeout(r, 1500));
            await handleMenu('4');
        }
    }

    async function purchaseGlobalChatUnlock() {
        if (state.currentUser.chats_sent >= state.currentUser.global_chat_req) {
            state.currentUser.global_chat_unlocked = true;
            localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
            await updateUserStats();
            await type("Success! Uplink established. Global Chat unlocked.");
            await type("Returning to main menu...");
            await new Promise(r => setTimeout(r, 1500));
            await showMainMenu();
        } else {
            await type(`Failed: Requires ${state.currentUser.global_chat_req} chats.`);
            await type("Returning to upgrades menu...");
            await new Promise(r => setTimeout(r, 1500));
            await handleMenu('4');
        }
    }

    async function updatePreferences(updates) {
        state.currentUser = { ...state.currentUser, ...updates };
        
        applyPreferences();

        localStorage.setItem('currentUser', JSON.stringify(state.currentUser));

        if (state.currentUser.username !== 'Guest') {
             const usersDb = JSON.parse(localStorage.getItem('beats_users') || '{}');
             if (usersDb[state.currentUser.username]) {
                 usersDb[state.currentUser.username].data = state.currentUser;
                 localStorage.setItem('beats_users', JSON.stringify(usersDb));
             }
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

    const updateSuggestions = () => {
        const existing = document.getElementById('suggestions');
        if (existing) existing.remove();

        if (state.appState !== 'global_chat') return;
        if (!state.currentInput) return;

        const lastWord = state.currentInput.split(' ').pop();
        
        if (lastWord.startsWith('@')) {
            const query = lastWord.slice(1).toLowerCase();
            state.suggestions = state.users.filter(u => u.username.toLowerCase().startsWith(query)).map(u => ({
                text: u.username,
                icon: u.icon,
                type: 'user'
            }));
            if ('me'.startsWith(query)) state.suggestions.push({ text: 'me', icon: '🎭', type: 'user' });
        } else if (lastWord.startsWith('/')) {
            const query = lastWord.slice(1).toLowerCase();
            const commands = ['whisper', 'me'];
            state.suggestions = commands.filter(c => c.startsWith(query)).map(c => ({
                text: c,
                type: 'cmd'
            }));
        } else {
            state.suggestions = [];
        }

        if (state.suggestions.length > 0) {
            const box = document.createElement('div');
            box.id = 'suggestions';
            box.className = 'suggestion-box';
            
            state.suggestions.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = `suggestion-item ${index === state.suggestionIndex ? 'active' : ''}`;
                div.innerHTML = item.type === 'user' 
                    ? `<span>${item.icon}</span><span>${item.text}</span>`
                    : `<span class="text-cyan-400">/</span><span>${item.text}</span>`;
                div.onclick = () => applySuggestion(item);
                box.appendChild(div);
            });
            
            inputWrapper.style.position = 'relative';
            inputWrapper.appendChild(box);
        } else {
            state.suggestionIndex = -1;
        }
    };

    const applySuggestion = (item) => {
        const words = state.currentInput.split(' ');
        words.pop();
        const prefix = item.type === 'user' ? '@' : '/';
        words.push(prefix + item.text + ' ');
        state.currentInput = words.join(' ');
        
        inputLine.textContent = state.currentInput;
        state.suggestions = [];
        state.suggestionIndex = -1;
        const existing = document.getElementById('suggestions');
        if (existing) existing.remove();
        focusInput();
    };

    document.addEventListener('paste', (e) => {
        if (state.isExecuting) return;
        e.preventDefault();

        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (text) {
            const cleanText = text.replace(/[\r\n]+/g, ' ');
            state.currentInput += cleanText;

            if (state.subState === 'password' || state.subState === 'register_password') {
                inputLine.textContent = state.currentInput.replace(/./g, '*');
            } else {
                inputLine.textContent = state.currentInput;
            }
            terminal.scrollTop = terminal.scrollHeight;
            updateSuggestions();
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
            if (state.suggestions.length > 0 && state.suggestionIndex !== -1) {
                applySuggestion(state.suggestions[state.suggestionIndex]);
                e.preventDefault();
                return;
            }

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
        } else if (e.key === 'Backspace') {
            state.currentInput = state.currentInput.slice(0, -1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (state.menuOptions.length > 0) {
                if (state.menuSelectionIndex < 0) state.menuSelectionIndex = state.menuOptions.length;
                const prevIndex = state.menuSelectionIndex;
                state.menuSelectionIndex = Math.max(0, state.menuSelectionIndex - 1);
                
                if (prevIndex >= 0 && prevIndex < state.menuOptions.length) state.menuOptions[prevIndex].element.classList.remove('selected');
                state.menuOptions[state.menuSelectionIndex].element.classList.add('selected');
                
            } else if (state.suggestions.length > 0) {
                 state.suggestionIndex = Math.max(0, state.suggestionIndex - 1);
                 updateSuggestions();
            } else if (state.appState === 'chat') {
                if (state.historyIndex < state.commandHistory.length - 1) {
                    state.historyIndex++;
                    state.currentInput = state.commandHistory[state.historyIndex];
                }
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (state.menuOptions.length > 0) {
                const prevIndex = state.menuSelectionIndex;
                state.menuSelectionIndex = Math.min(state.menuOptions.length - 1, state.menuSelectionIndex + 1);

                if (prevIndex >= 0) state.menuOptions[prevIndex].element.classList.remove('selected');
                state.menuOptions[state.menuSelectionIndex].element.classList.add('selected');

            } else if (state.suggestions.length > 0) {
                state.suggestionIndex = Math.min(state.suggestions.length - 1, state.suggestionIndex + 1);
                updateSuggestions();
            } else if (state.appState === 'chat') {
                if (state.historyIndex >= 0) {
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

        if (['ArrowUp', 'ArrowDown'].includes(e.key) && state.suggestions.length > 0) {
        } else {
             updateSuggestions();
        }

        if (state.subState === 'password' || state.subState === 'register_password') {
            inputLine.textContent = state.currentInput.replace(/./g, '*');
        } else {
            inputLine.textContent = state.currentInput;
        }
        terminal.scrollTop = terminal.scrollHeight;
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