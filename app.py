from flask import Flask, render_template, request, Response, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
import google.generativeai as genai
from google.api_core import exceptions
import os
from dotenv import load_dotenv

app = Flask(__name__)

load_dotenv()  # Load environment variables from .env file

# --- Configuration ---
app.config['SECRET_KEY'] = os.urandom(24)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///site.db'
db = SQLAlchemy(app)
bcrypt = Bcrypt(app)

# --- Application Constants ---
ROLEPLAY_COST = 100
CHANGE_NAME_COST_CHATS = 20

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



# --- Gemini API Configuration ---
# Load the API key from an environment variable for security.
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    # This provides a clear error if the key is missing when you start the app.
    raise ValueError("Error: GEMINI_API_KEY environment variable not set.")
genai.configure(api_key=GEMINI_API_KEY)

# --- Database Models ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(20), unique=True, nullable=False)
    password = db.Column(db.String(60), nullable=False)
    chats_sent = db.Column(db.Integer, default=0)
    beats = db.Column(db.Integer, default=0)
    roleplay_unlocked = db.Column(db.Boolean, default=False)
    ai_name = db.Column(db.String(20), nullable=False, default='AI')

    def to_dict(self):
        return {
            "username": self.username,
            "chats_sent": self.chats_sent,
            "beats": self.beats,
            "roleplay_unlocked": self.roleplay_unlocked,
            "persona": session.get('persona', DEFAULT_PERSONA), # Include current persona
            "ai_name": self.ai_name
        }

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
        session['user_id'] = user.id
        session['persona'] = session.get('persona', DEFAULT_PERSONA) # Restore or set default
        return jsonify(user.to_dict())
    return jsonify({"error": "Invalid credentials."}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    session.pop('chat_history', None) # Clear chat history on logout
    return jsonify({"message": "Logged out."})

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

@app.route('/api/set_ai_name', methods=['POST'])
def set_ai_name():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user.chats_sent < CHANGE_NAME_COST_CHATS:
        return jsonify({"error": f"Requires {CHANGE_NAME_COST_CHATS} chats sent to unlock."}), 403

    data = request.get_json()
    new_name = data.get('name', '').strip()
    if 1 <= len(new_name) <= 20:
        user.ai_name = new_name
        db.session.commit()
        return jsonify({"message": f"AI name changed to {new_name}."})
    return jsonify({"error": "Name must be between 1 and 20 characters."}), 400

@app.route('/api/chat', methods=['POST'])
def chat_proxy():
    # Clear history if requested
    if request.json.get('clear_history'):
        session.pop('chat_history', None)

    if 'user_id' in session:
        user = User.query.get(session['user_id'])
        if not user: # Add validation check
            return Response("Error: Authenticated user not found.", status=500, content_type='text/plain')
        user.chats_sent += 1
        user.beats += 1
        db.session.commit()

    user_prompt = request.json.get('prompt')
    # For Gemini, we can prime the model with a user/model exchange to set the persona.
    # Using a model confirmed to be available from the startup log.
    model = genai.GenerativeModel('gemini-2.5-flash')

    # Retrieve or initialize chat history from the session
    if 'chat_history' not in session:
        session['chat_history'] = [
            {
                "role": "user",
                "parts": [get_current_persona_prompt()]
            },
            {
                "role": "model",
                "parts": ["Acknowledged. Systems online. Ready for input, operator."]
            }
        ]
    chat_history = session['chat_history']

    # Add the user's new prompt to the history *before* starting the stream.
    # This is safe because we are still in the original request context.
    chat_history.append({"role": "user", "parts": [user_prompt]})
    session.modified = True
    
    chat = model.start_chat(history=chat_history)

    def generate(history):
        full_response = []
        try:
            # Send the user's message and stream the response
            response = chat.send_message(user_prompt, stream=True)
            for chunk in response:
                if chunk.parts:
                    text_chunk = chunk.text
                    full_response.append(text_chunk)
                    yield text_chunk.encode('utf-8')
            
            # The user prompt is already in the history, so we just add the model's response.
            history.append({"role": "model", "parts": ["".join(full_response)]})
            
            with app.test_request_context():
                session['chat_history'] = history
                session.modified = True

        except exceptions.NotFound as e:
            yield f"Error: The configured AI model was not found, or is inaccessible. Please check the model name: {e}".encode('utf-8')
        except exceptions.PermissionDenied as e:
            yield f"Error: API key is invalid or has expired. {e}".encode('utf-8')
        except Exception as e:
            yield f"Error: Could not get response from AI: {e}".encode('utf-8')

    return Response(generate(chat_history), content_type='text/plain; charset=utf-8')

@app.route('/api/unlock_roleplay', methods=['POST'])
def unlock_roleplay():
    if 'user_id' not in session:
        return jsonify({"error": "Not logged in"}), 401

    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({"error": "User not found."}), 404

    if user.beats >= ROLEPLAY_COST:
        user.beats -= ROLEPLAY_COST
        user.roleplay_unlocked = True
        db.session.commit()
        return jsonify(user.to_dict())
    else:
        return jsonify({"error": "Not enough beats."}), 400

if __name__ == '__main__':
    # For development: delete and recreate the database on each start.
    # This ensures the schema is always in sync with the models.
    # The database is located in the 'instance' folder by default.
    with app.app_context():
        db_path = os.path.join(app.instance_path, 'site.db')
        if os.path.exists(db_path):
            os.remove(db_path)
    with app.app_context():
        db.create_all()
    app.run(debug=True)