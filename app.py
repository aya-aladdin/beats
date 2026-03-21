from flask import Flask, render_template, request, Response, jsonify, session, stream_with_context
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
import requests
import json
from sqlalchemy import text
import os
from dotenv import load_dotenv
from datetime import datetime

app = Flask(__name__)

load_dotenv()  # Load environment variables from .env file

# --- Configuration ---
app.config['SECRET_KEY'] = os.urandom(24)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///site.db'
db = SQLAlchemy(app)
bcrypt = Bcrypt(app)

# --- In-Memory Chat Storage ---
CHAT_SESSIONS = {}

# --- Application Constants ---
ROLEPLAY_CHATS_REQUIRED = 3

PERSONAS = {
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
}

DEFAULT_PERSONA = 'helpful'

def get_current_persona_prompt():
    """Gets the full prompt text for the user's current persona."""
    ai_name = 'AI' # Default for guests
    if 'user_id' in session:
        user = User.query.get(session['user_id'])
        if user:
            ai_name = user.ai_name
        persona_key = session.get('persona', DEFAULT_PERSONA)
    else: # Guest user
        persona_key = request.json.get('persona', DEFAULT_PERSONA)

    prompt_template = PERSONAS.get(persona_key, PERSONAS[DEFAULT_PERSONA])['prompt']
    return prompt_template.format(ai_name=ai_name)


# --- Database Models ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(20), unique=True, nullable=False)
    password = db.Column(db.String(60), nullable=False)
    chats_sent = db.Column(db.Integer, default=0)
    beats = db.Column(db.Integer, default=0)
    roleplay_unlocked = db.Column(db.Boolean, default=False)
    ai_name = db.Column(db.String(20), nullable=False, default='AI')
    font_size = db.Column(db.String(20), default='normal')
    theme = db.Column(db.String(20), default='default')
    response_length = db.Column(db.String(20), default='balanced')

    def to_dict(self):
        return {
            "username": self.username,
            "chats_sent": self.chats_sent,
            "beats": self.beats,
            "roleplay_unlocked": self.roleplay_unlocked,
            "persona": session.get('persona', DEFAULT_PERSONA), # Include current persona
            "ai_name": self.ai_name,
            "roleplay_chats_required": ROLEPLAY_CHATS_REQUIRED,
            "font_size": self.font_size,
            "theme": self.theme,
            "response_length": self.response_length
        }

class ChatSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(50)) # Character Name
    scenario = db.Column(db.String(200)) # Short snippet of scenario
    history = db.Column(db.Text, default='[]') # JSON string
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

@app.route('/')
def index():
    return render_template('index.html')

# --- API Routes ---

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists."}), 409
    
    # Clear any existing chat session (e.g. from Guest mode)
    chat_session_id = session.get('chat_session_id')
    if chat_session_id and chat_session_id in CHAT_SESSIONS:
        del CHAT_SESSIONS[chat_session_id]
    session.pop('chat_session_id', None)
    session.pop('active_db_id', None)
    
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
    user = User(username=username, password=hashed_password)
    db.session.add(user)
    db.session.commit()
    session['user_id'] = user.id
    session['persona'] = DEFAULT_PERSONA
    return jsonify(user.to_dict()), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    user = User.query.filter_by(username=username).first()
    if user and bcrypt.check_password_hash(user.password, password):
        # Clear any existing chat session to ensure a fresh start
        chat_session_id = session.get('chat_session_id')
        if chat_session_id and chat_session_id in CHAT_SESSIONS:
            del CHAT_SESSIONS[chat_session_id]
        session.pop('chat_session_id', None)
        session.pop('active_db_id', None)

        session['user_id'] = user.id
        session['persona'] = session.get('persona', DEFAULT_PERSONA) # Restore or set default
        return jsonify(user.to_dict())
    return jsonify({"error": "Invalid credentials."}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    # Clear server-side chat memory
    chat_session_id = session.get('chat_session_id')
    if chat_session_id and chat_session_id in CHAT_SESSIONS:
        del CHAT_SESSIONS[chat_session_id]
    
    session.pop('user_id', None)
    session.pop('chat_session_id', None)
    session.pop('active_db_id', None)
    return jsonify({"message": "Logged out."})

@app.route('/api/reset_chat', methods=['POST'])
def reset_chat():
    # Explicitly clear chat memory without logging out
    chat_session_id = session.get('chat_session_id')
    if chat_session_id and chat_session_id in CHAT_SESSIONS:
        del CHAT_SESSIONS[chat_session_id]
    session.pop('active_db_id', None)
    session.pop('chat_session_id', None)
    return jsonify({"message": "Chat memory cleared."})

@app.route('/api/user_data')
def user_data():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401
    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({"error": "User not found."}), 404
    return jsonify(user.to_dict())

@app.route('/api/set_persona', methods=['POST'])
def set_persona():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401
    
    data = request.get_json()
    new_persona = data.get('persona')

    if new_persona in PERSONAS:
        session['persona'] = new_persona
        persona_name = PERSONAS[new_persona]['name']
        return jsonify({"message": f"Persona switched to {persona_name}."})
    else:
        return jsonify({"error": "Invalid persona."}), 400

@app.route('/api/update_preferences', methods=['POST'])
def update_preferences():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401
    
    user = User.query.get(session['user_id'])
    data = request.get_json()
    
    if 'font_size' in data: user.font_size = data['font_size']
    if 'theme' in data: user.theme = data['theme']
    if 'response_length' in data: user.response_length = data['response_length']
    
    db.session.commit()
    return jsonify({"message": "Preferences updated.", "user": user.to_dict()})

@app.route('/api/set_ai_name', methods=['POST'])
def set_ai_name():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    new_name = data.get('name', '').strip()
    if 1 <= len(new_name) <= 20:
        user.ai_name = new_name
        db.session.commit()
        return jsonify({"message": f"AI name changed to {new_name}."})
    return jsonify({"error": "Name must be between 1 and 20 characters."}), 400

@app.route('/api/chat', methods=['POST'])
def chat_proxy():
    user = None
    if 'user_id' in session:
        user = User.query.get(session['user_id'])
        if not user: # Add validation check
            return Response("Error: Authenticated user not found.", status=500, content_type='text/plain')
        user.chats_sent += 1
        user.beats += 1
        db.session.commit()
    
    # --- Memory Management ---
    # Ensure the user has a unique session ID for chat memory
    if 'chat_session_id' not in session:
        session['chat_session_id'] = os.urandom(16).hex()
    session_id = session['chat_session_id']

    # Retrieve or initialize history
    history = CHAT_SESSIONS.get(session_id, [])
    if not history:
        # Initialize with the system prompt/persona
        # Using OpenAI format: system, user, assistant
        history = [
            {"role": "system", "content": get_current_persona_prompt()},
            {"role": "assistant", "content": "Acknowledged. Systems online. Ready for input, operator."}
        ]
        CHAT_SESSIONS[session_id] = history

    is_regenerate = request.json.get('regenerate', False)
    user_prompt = request.json.get('prompt', '')
    
    # Determine length instruction based on user preference
    # We use prompt engineering to control length instead of max_tokens to prevent cut-offs
    user_pref = user.response_length if user else 'balanced'
    
    length_instruction = ""
    if user_pref == 'concise':
        length_instruction = " (Keep your response concise and brief.)"
    elif user_pref == 'verbose':
        length_instruction = " (Provide a detailed and comprehensive response.)"

    if is_regenerate:
        # Logic: Pop the last AI response, use the existing history (ending in user) to generate
        if history and history[-1]['role'] == 'assistant':
            history.pop()
        
        # Use the history as is (it should already have the user prompt at the end)
        messages = history
        # Re-append instruction to the last user message in the transient 'messages' list
        if messages and messages[-1]['role'] == 'user':
            messages[-1]['content'] += length_instruction
    else:
        # Standard flow: Append new user prompt
        messages = history + [{"role": "user", "content": user_prompt + length_instruction}]

    # Always allow a high token limit so the AI can finish its sentence
    max_tokens = 4000 

    def generate():
        full_response_text = ""
        try:
            url = "https://ai.hackclub.com/proxy/v1/chat/completions"
            headers = {
                "Authorization": "Bearer sk-hc-v1-aad18691f5b94ed8ae959cdbaf95600ea2df3328179a449097e83188c5183a91",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "qwen/qwen3-32b",
                "messages": messages,
                "stream": True,
                "max_tokens": max_tokens
            }
            
            with requests.post(url, headers=headers, json=payload, stream=True) as response:
                if not response.ok:
                    yield f"Error: API returned {response.status_code} - {response.text}".encode('utf-8')
                    return

                for line in response.iter_lines():
                    if line:
                        decoded_line = line.decode('utf-8')
                        if decoded_line.startswith('data: '):
                            content_str = decoded_line[6:]
                            if content_str.strip() == '[DONE]':
                                break
                            try:
                                json_obj = json.loads(content_str)
                                delta = json_obj['choices'][0].get('delta', {})
                                if 'content' in delta:
                                    text = delta['content']
                                    full_response_text += text
                                    yield text.encode('utf-8')
                            except (json.JSONDecodeError, KeyError):
                                continue
            
            # --- Update Memory ---
            # Append the completed turn to the session history
            # We re-fetch from CHAT_SESSIONS to ensure we are appending to the current list
            current_history = CHAT_SESSIONS.get(session_id, [])
            
            # Only append user prompt if it's a new chat, not a regen
            if not is_regenerate:
                current_history.append({"role": "user", "content": user_prompt})
            
            current_history.append({"role": "assistant", "content": full_response_text})
            CHAT_SESSIONS[session_id] = current_history

            # --- Persist to Database if active session ---
            if 'active_db_id' in session:
                db_chat = ChatSession.query.get(session['active_db_id'])
                if db_chat:
                    db_chat.history = json.dumps(current_history)
                    db.session.commit()

        except Exception as e:
            yield f"Error: Could not get response from AI: {e}".encode('utf-8')

    return Response(stream_with_context(generate()), content_type='text/plain; charset=utf-8')

@app.route('/api/unlock_roleplay', methods=['POST'])
def unlock_roleplay():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({"error": "User not found."}), 404

    if user.chats_sent >= ROLEPLAY_CHATS_REQUIRED:
        user.roleplay_unlocked = True
        db.session.commit()
        return jsonify(user.to_dict())
    else:
        return jsonify({"error": f"Requires {ROLEPLAY_CHATS_REQUIRED} chats sent."}), 400

@app.route('/api/roleplay/sessions', methods=['GET'])
def get_roleplay_sessions():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401
    
    # Get sessions ordered by newest first
    chats = ChatSession.query.filter_by(user_id=session['user_id']).order_by(ChatSession.timestamp.desc()).all()
    results = []
    for c in chats:
        results.append({
            "id": c.id,
            "name": c.name,
            "scenario": c.scenario[:50] + "..." if len(c.scenario) > 50 else c.scenario,
            "timestamp": c.timestamp.isoformat()
        })
    return jsonify(results)

@app.route('/api/roleplay/load', methods=['POST'])
def load_roleplay_session():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401
    
    data = request.get_json()
    chat_id = data.get('id')
    chat = ChatSession.query.filter_by(id=chat_id, user_id=session['user_id']).first()
    
    if not chat:
        return jsonify({"error": "Chat not found"}), 404

    # Restore to memory
    new_session_id = os.urandom(16).hex()
    session['chat_session_id'] = new_session_id
    session['active_db_id'] = chat.id
    
    try:
        history = json.loads(chat.history)
    except:
        history = []

    CHAT_SESSIONS[new_session_id] = history
    
    return jsonify({"message": "Loaded", "history": history})

@app.route('/api/roleplay/start', methods=['POST'])
def start_roleplay():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    data = request.get_json()
    user_name = data.get('user_name')
    user_gender = data.get('user_gender')
    scenario = data.get('scenario')

    # Reset Chat History for the new roleplay
    if 'chat_session_id' not in session:
        session['chat_session_id'] = os.urandom(16).hex()
    session_id = session['chat_session_id']

    # Build System Prompt with Roleplay Context
    base_prompt = get_current_persona_prompt()
    roleplay_context = (
        f"\n\n[ROLEPLAY SCENARIO]\n"
        f"User Character: {user_name} ({user_gender})\n"
        f"Scenario: {scenario}\n"
        f"IMPORTANT INSTRUCTIONS:\n"
        f"1. You are roleplaying *against* {user_name}. You are NOT {user_name}.\n"
        f"2. Write ONLY from the perspective of your character (the counterpart). NEVER write {user_name}'s actions, thoughts, or dialogue.\n"
        f"3. Focus on action and dialogue. Avoid excessive flowery description or irrelevant details.\n"
        f"4. Drive the interaction forward with your actions. Do not break character."
    )
    
    system_message = base_prompt + roleplay_context
    
    # Initialize History
    history = [{"role": "system", "content": system_message}]
    
    # Generate Opening Line from AI
    try:
        url = "https://ai.hackclub.com/proxy/v1/chat/completions"
        headers = {
            "Authorization": "Bearer sk-hc-v1-aad18691f5b94ed8ae959cdbaf95600ea2df3328179a449097e83188c5183a91",
            "Content-Type": "application/json"
        }
        # Ask AI to start the scene based on the context
        starter_prompt = f"Start the roleplay based on: {scenario}. Set the scene briefly and take the first action towards {user_name}. Remember: do not act as {user_name}."
        startup_payload = {
            "model": "qwen/qwen3-32b",
            "messages": history + [{"role": "user", "content": starter_prompt}],
            "max_tokens": 4000
        }
        
        response = requests.post(url, headers=headers, json=startup_payload)
        response_json = response.json()
        ai_opener = response_json['choices'][0]['message']['content']
        
        if not ai_opener:
            ai_opener = "Scenario initialized. (No output generated)"
        
        # Save to history so the chat can continue from here (including the trigger prompt)
        history.append({"role": "user", "content": starter_prompt})
        history.append({"role": "assistant", "content": ai_opener})
        CHAT_SESSIONS[session_id] = history

        # --- Save to DB ---
        new_chat = ChatSession(
            user_id=session['user_id'],
            name=user_name,
            scenario=scenario,
            history=json.dumps(history)
        )
        db.session.add(new_chat)
        db.session.commit()
        session['active_db_id'] = new_chat.id
        
        return jsonify({"message": "Roleplay started.", "opener": ai_opener})

    except Exception as e:
        # Fallback if AI fails to generate opener
        fallback = "Scenario initialized. Ready for your input."
        history.append({"role": "assistant", "content": fallback})
        CHAT_SESSIONS[session_id] = history
        return jsonify({"message": "Roleplay initialized.", "opener": fallback})

def check_and_migrate_db():
    """Adds new columns to the database if they are missing (Simple Migration)."""
    try:
        with app.app_context():
            with db.engine.connect() as conn:
                # Check and add font_size
                try:
                    conn.execute(text("SELECT font_size FROM user LIMIT 1"))
                except Exception:
                    print("Migrating DB: Adding font_size column...")
                    conn.execute(text("ALTER TABLE user ADD COLUMN font_size VARCHAR(20) DEFAULT 'normal'"))
                    conn.commit() # Ensure changes are saved

                # Check and add theme
                try:
                    conn.execute(text("SELECT theme FROM user LIMIT 1"))
                except Exception:
                    print("Migrating DB: Adding theme column...")
                    conn.execute(text("ALTER TABLE user ADD COLUMN theme VARCHAR(20) DEFAULT 'default'"))
                    conn.commit()

                # Check and add response_length
                try:
                    conn.execute(text("SELECT response_length FROM user LIMIT 1"))
                except Exception:
                    print("Migrating DB: Adding response_length column...")
                    conn.execute(text("ALTER TABLE user ADD COLUMN response_length VARCHAR(20) DEFAULT 'balanced'"))
                    conn.commit()
    except Exception as e:
        print(f"Migration Warning: {e}")

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        check_and_migrate_db() # Run migration check
    app.run(debug=True)