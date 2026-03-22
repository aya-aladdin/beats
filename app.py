from flask import Flask, render_template, request, Response, jsonify, session, stream_with_context
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
import requests
import json
from sqlalchemy import text, or_, and_
import os
from dotenv import load_dotenv
from datetime import datetime

app = Flask(__name__)

load_dotenv()

app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev_key_fixed_for_restart')

database_url = os.environ.get('DATABASE_URL', 'sqlite:///site.db')
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)
app.config['SQLALCHEMY_DATABASE_URI'] = database_url
db = SQLAlchemy(app)
bcrypt = Bcrypt(app)

CHAT_SESSIONS = {}

ROLEPLAY_CHATS_REQUIRED = 3
GLOBAL_CHAT_REQ = 5

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
    ai_name = 'AI'
    if 'user_id' in session:
        user = User.query.get(session['user_id'])
        if user:
            ai_name = user.ai_name
        persona_key = session.get('persona', DEFAULT_PERSONA)
    else:
        persona_key = request.json.get('persona', DEFAULT_PERSONA)

    prompt_template = PERSONAS.get(persona_key, PERSONAS[DEFAULT_PERSONA])['prompt']
    return prompt_template.format(ai_name=ai_name)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(20), unique=True, nullable=False)
    password = db.Column(db.String(60), nullable=False)
    chats_sent = db.Column(db.Integer, default=0)
    beats = db.Column(db.Integer, default=0)
    roleplay_unlocked = db.Column(db.Boolean, default=False)
    global_chat_unlocked = db.Column(db.Boolean, default=False)
    ai_name = db.Column(db.String(20), nullable=False, default='AI')
    icon = db.Column(db.String(10), default='👤')
    font_size = db.Column(db.String(20), default='normal')
    theme = db.Column(db.String(20), default='default')
    response_length = db.Column(db.String(20), default='balanced')

    def to_dict(self):
        return {
            "username": self.username,
            "chats_sent": self.chats_sent,
            "beats": self.beats,
            "roleplay_unlocked": self.roleplay_unlocked,
            "global_chat_unlocked": self.global_chat_unlocked,
            "persona": session.get('persona', DEFAULT_PERSONA),
            "ai_name": self.ai_name,
            "icon": self.icon,
            "roleplay_chats_required": ROLEPLAY_CHATS_REQUIRED,
            "global_chat_req": GLOBAL_CHAT_REQ,
            "font_size": self.font_size,
            "theme": self.theme,
            "response_length": self.response_length
        }

class ChatSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(50))
    scenario = db.Column(db.String(200))
    history = db.Column(db.Text, default='[]')
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class GlobalMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(20), nullable=False)
    content = db.Column(db.String(200), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    msg_type = db.Column(db.String(10), default='message')
    recipient = db.Column(db.String(20), nullable=True)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists."}), 409
    
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
        chat_session_id = session.get('chat_session_id')
        if chat_session_id and chat_session_id in CHAT_SESSIONS:
            del CHAT_SESSIONS[chat_session_id]
        session.pop('chat_session_id', None)
        session.pop('active_db_id', None)

        session['user_id'] = user.id
        session['persona'] = session.get('persona', DEFAULT_PERSONA)
        return jsonify(user.to_dict())
    return jsonify({"error": "Invalid credentials."}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    chat_session_id = session.get('chat_session_id')
    if chat_session_id and chat_session_id in CHAT_SESSIONS:
        del CHAT_SESSIONS[chat_session_id]
    
    session.pop('user_id', None)
    session.pop('chat_session_id', None)
    session.pop('active_db_id', None)
    return jsonify({"message": "Logged out."})

@app.route('/api/reset_chat', methods=['POST'])
def reset_chat():
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

@app.route('/api/set_icon', methods=['POST'])
def set_icon():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    new_icon = data.get('icon', '').strip()
    if 1 <= len(new_icon) <= 10:
        user.icon = new_icon
        db.session.commit()
        return jsonify({"message": f"Icon updated to {new_icon}"})
    return jsonify({"error": "Invalid icon."}), 400

@app.route('/api/chat', methods=['POST'])
def chat_proxy():
    user = None
    if 'user_id' in session:
        user = User.query.get(session['user_id'])
        if not user:
            return Response("Error: Authenticated user not found.", status=500, content_type='text/plain')
        user.chats_sent += 1
        user.beats += 1
        db.session.commit()
    
    if 'chat_session_id' not in session:
        session['chat_session_id'] = os.urandom(16).hex()
    session_id = session['chat_session_id']

    history = CHAT_SESSIONS.get(session_id)

    if not history and 'active_db_id' in session:
        db_chat = ChatSession.query.get(session['active_db_id'])
        if db_chat:
            try:
                history = json.loads(db_chat.history)
                CHAT_SESSIONS[session_id] = history
            except:
                pass

    if not history:
        history = [
            {"role": "system", "content": get_current_persona_prompt()},
            {"role": "assistant", "content": "Acknowledged. Systems online. Ready for input, operator."}
        ]
        CHAT_SESSIONS[session_id] = history

    is_regenerate = request.json.get('regenerate', False)
    user_prompt = request.json.get('prompt', '')
    
    user_pref = user.response_length if user else 'balanced'
    
    length_instruction = ""
    if user_pref == 'concise':
        length_instruction = " (Keep your response concise and brief.)"
    elif user_pref == 'verbose':
        length_instruction = " (Provide a detailed and comprehensive response.)"

    if is_regenerate:
        if history and history[-1]['role'] == 'assistant':
            history.pop()
        
        messages = [msg.copy() for msg in history]

        if messages and messages[-1]['role'] == 'user':
            messages[-1]['content'] += length_instruction
    else:
        messages = history + [{"role": "user", "content": user_prompt + length_instruction}]

    if len(messages) > 21:
        messages = [messages[0]] + messages[-20:]

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
                "model": "meta-llama/Meta-Llama-3.1-8B-Instruct",
                "messages": messages,
                "stream": True,
                "max_tokens": max_tokens
            }
            with requests.post(url, headers=headers, json=payload, stream=True, timeout=60) as response:
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
            
            current_history = CHAT_SESSIONS.get(session_id, [])
            
            if not is_regenerate:
                current_history.append({"role": "user", "content": user_prompt})
            
            current_history.append({"role": "assistant", "content": full_response_text})
            CHAT_SESSIONS[session_id] = current_history

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

@app.route('/api/unlock_global_chat', methods=['POST'])
def unlock_global_chat():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({"error": "User not found."}), 404

    if user.chats_sent >= GLOBAL_CHAT_REQ:
        user.global_chat_unlocked = True
        db.session.commit()
        return jsonify(user.to_dict())
    else:
        return jsonify({"error": f"Requires {GLOBAL_CHAT_REQ} chats sent."}), 400

@app.route('/api/users/list', methods=['GET'])
def get_users_list():
    if 'user_id' not in session:
        return jsonify([])
    users = User.query.with_entities(User.username, User.icon).all()
    return jsonify([{"username": u.username, "icon": u.icon} for u in users])

@app.route('/api/global_chat/messages', methods=['GET'])
def get_global_messages():
    if 'user_id' not in session:
        return jsonify([])
    
    current_user = User.query.get(session['user_id'])
    username = current_user.username

    msgs = GlobalMessage.query.filter(
        or_(
            GlobalMessage.recipient == None,
            GlobalMessage.recipient == '',
            GlobalMessage.recipient == username,
            and_(GlobalMessage.username == username, GlobalMessage.recipient != None)
        )
    ).order_by(GlobalMessage.timestamp.desc()).limit(50).all()
    
    data = [{
        "user": m.username, 
        "content": m.content, 
        "type": m.msg_type, 
        "time": m.timestamp.strftime("%H:%M"),
        "recipient": m.recipient
    } for m in msgs[::-1]]
    return jsonify(data)

@app.route('/api/global_chat/send', methods=['POST'])
def send_global_message():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401
    
    user = User.query.get(session['user_id'])
    data = request.get_json()
    content = data.get('content', '').strip()
    msg_type = data.get('type', 'message')
    recipient = data.get('recipient', None)
    
    if content:
        msg = GlobalMessage(username=user.username, content=content[:200], msg_type=msg_type, recipient=recipient)
        db.session.add(msg)
        db.session.commit()
    return jsonify({"status": "sent"})

@app.route('/api/roleplay/sessions', methods=['GET'])
def get_roleplay_sessions():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401
    
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

    if 'chat_session_id' not in session:
        session['chat_session_id'] = os.urandom(16).hex()
    session_id = session['chat_session_id']

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
    
    history = [{"role": "system", "content": system_message}]
    
    try:
        url = "https://ai.hackclub.com/proxy/v1/chat/completions"
        headers = {
            "Authorization": "Bearer sk-hc-v1-aad18691f5b94ed8ae959cdbaf95600ea2df3328179a449097e83188c5183a91",
            "Content-Type": "application/json"
        }
        starter_prompt = f"Start the roleplay based on: {scenario}. Set the scene briefly and take the first action towards {user_name}. Remember: do not act as {user_name}."
        startup_payload = {
            "model": "meta-llama/Meta-Llama-3.1-8B-Instruct",
            "messages": history + [{"role": "user", "content": starter_prompt}],
            "max_tokens": 4000
        }
        
        response = requests.post(url, headers=headers, json=startup_payload)
        response_json = response.json()
        ai_opener = response_json['choices'][0]['message']['content']
        
        if not ai_opener:
            ai_opener = "Scenario initialized. (No output generated)"
        
        history.append({"role": "user", "content": starter_prompt})
        history.append({"role": "assistant", "content": ai_opener})
        CHAT_SESSIONS[session_id] = history

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
        fallback = "Scenario initialized. Ready for your input."
        history.append({"role": "assistant", "content": fallback})
        CHAT_SESSIONS[session_id] = history
        return jsonify({"message": "Roleplay initialized.", "opener": fallback})

def check_and_migrate_db():
    try:
        with db.engine.connect() as conn:
            try:
                conn.execute(text("SELECT font_size FROM user LIMIT 1"))
            except Exception:
                print("Migrating DB: Adding font_size column...")
                conn.execute(text("ALTER TABLE user ADD COLUMN font_size VARCHAR(20) DEFAULT 'normal'"))
                conn.commit()

            try:
                conn.execute(text("SELECT theme FROM user LIMIT 1"))
            except Exception:
                print("Migrating DB: Adding theme column...")
                conn.execute(text("ALTER TABLE user ADD COLUMN theme VARCHAR(20) DEFAULT 'default'"))
                conn.commit()

            try:
                conn.execute(text("SELECT response_length FROM user LIMIT 1"))
            except Exception:
                print("Migrating DB: Adding response_length column...")
                conn.execute(text("ALTER TABLE user ADD COLUMN response_length VARCHAR(20) DEFAULT 'balanced'"))
                conn.commit()

            try:
                conn.execute(text("SELECT global_chat_unlocked FROM user LIMIT 1"))
            except Exception:
                print("Migrating DB: Adding global_chat_unlocked column...")
                conn.execute(text("ALTER TABLE user ADD COLUMN global_chat_unlocked BOOLEAN DEFAULT 0"))
                conn.commit()

            try:
                conn.execute(text("SELECT icon FROM user LIMIT 1"))
            except Exception:
                print("Migrating DB: Adding icon column...")
                conn.execute(text("ALTER TABLE user ADD COLUMN icon VARCHAR(10) DEFAULT '👤'"))
                conn.commit()

            try:
                conn.execute(text("SELECT msg_type FROM global_message LIMIT 1"))
            except Exception:
                print("Migrating DB: Adding msg_type column to global_message...")
                conn.execute(text("ALTER TABLE global_message ADD COLUMN msg_type VARCHAR(10) DEFAULT 'message'"))
                conn.commit()

            try:
                conn.execute(text("SELECT recipient FROM global_message LIMIT 1"))
            except Exception:
                print("Migrating DB: Adding recipient column to global_message...")
                conn.execute(text("ALTER TABLE global_message ADD COLUMN recipient VARCHAR(20) DEFAULT NULL"))
                conn.commit()
    except Exception as e:
        print(f"Migration Warning: {e}")

with app.app_context():
    db.create_all()
    check_and_migrate_db()

if __name__ == '__main__':
    app.run(debug=True)