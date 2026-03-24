from flask import Flask, render_template, request, Response, stream_with_context, jsonify
import requests
import json
import time

app = Flask(__name__)

chat_messages = []
active_users = {}
MAX_MESSAGES = 100
message_id_counter = 0

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/chat', methods=['POST'])
def chat_proxy():
    data = request.get_json()
    messages = data.get('messages', [])
    model = data.get('model', "meta-llama/Meta-Llama-3.1-8B-Instruct")

    def generate():
        try:
            url = "https://ai.hackclub.com/proxy/v1/chat/completions"
            headers = {
                "Authorization": "Bearer sk-hc-v1-aad18691f5b94ed8ae959cdbaf95600ea2df3328179a449097e83188c5183a91",
                "Content-Type": "application/json"
            }
            payload = {
                "model": model,
                "messages": messages,
                "stream": True,
                "max_tokens": 4000
            }
            with requests.post(url, headers=headers, json=payload, stream=True, timeout=60) as response:
                if not response.ok:
                    yield f"Error: {response.status_code}".encode('utf-8')
                    return

                for line in response.iter_lines():
                    if line:
                        decoded_line = line.decode('utf-8')
                        if decoded_line.startswith('data: '):
                            content_str = decoded_line[6:]
                            if content_str.strip() == '[DONE]': break
                            try:
                                json_obj = json.loads(content_str)
                                delta = json_obj['choices'][0].get('delta', {})
                                if 'content' in delta:
                                    yield delta['content'].encode('utf-8')
                            except: continue
        except Exception as e:
            yield f"Error: {e}".encode('utf-8')

    return Response(stream_with_context(generate()), content_type='text/plain; charset=utf-8')

@app.route('/api/global/join', methods=['POST'])
def join_chat():
    global message_id_counter
    data = request.get_json(silent=True) or {}
    username = data.get('username')
    icon = data.get('icon', '👤')
    
    if not username: return jsonify({'error': 'Username required'}), 400
    
    active_users[username] = {'last_seen': time.time(), 'icon': icon}
    message_id_counter += 1
    chat_messages.append({
        'id': message_id_counter, 'type': 'system',
        'content': f"{username} has entered the chat.", 'timestamp': time.time()
    })
    return jsonify({'status': 'joined', 'last_id': message_id_counter})

@app.route('/api/global/leave', methods=['POST'])
def leave_chat():
    global message_id_counter
    data = request.get_json(silent=True) or {}
    username = data.get('username')
    if username in active_users:
        del active_users[username]
        message_id_counter += 1
        chat_messages.append({
            'id': message_id_counter, 'type': 'system',
            'content': f"{username} has left the chat.", 'timestamp': time.time()
        })
    return jsonify({'status': 'left'})

@app.route('/api/global/send', methods=['POST'])
def send_message():
    global message_id_counter
    data = request.get_json(silent=True) or {}
    username, content = data.get('username'), data.get('content')
    icon = data.get('icon', '👤')
    
    if not username or not content: return jsonify({'error': 'Missing data'}), 400
    
    active_users[username] = {'last_seen': time.time(), 'icon': icon}
    
    msg_type = 'message'
    target = None
    
    if content.startswith('/me '):
        msg_type = 'action'
        content = content[4:]
    elif content.startswith('/whisper '):
        parts = content.split(' ', 2)
        if len(parts) >= 3:
            msg_type = 'whisper'
            target, content = parts[1], parts[2]
        else: return jsonify({'error': 'Invalid format'}), 400
            
    message_id_counter += 1
    chat_messages.append({
        'id': message_id_counter, 'type': msg_type, 'sender': username,
        'icon': icon, 'content': content, 'target': target, 'timestamp': time.time()
    })
    if len(chat_messages) > MAX_MESSAGES: chat_messages.pop(0)
    return jsonify({'status': 'sent'})

@app.route('/api/global/poll', methods=['GET'])
def poll_chat():
    global message_id_counter
    username = request.args.get('username')
    last_id = int(request.args.get('last_id', -1))
    
    if username in active_users: active_users[username]['last_seen'] = time.time()
    
    now = time.time()
    for u in [u for u, d in active_users.items() if now - d['last_seen'] > 30]:
        del active_users[u]
        message_id_counter += 1
        chat_messages.append({'id': message_id_counter, 'type': 'system', 'content': f"{u} has left (timeout).", 'timestamp': now})

    new_msgs = []
    for msg in chat_messages:
        if msg['id'] > last_id:
            if msg['type'] == 'whisper':
                if msg['sender'] == username or msg['target'] == username: new_msgs.append(msg)
            else: new_msgs.append(msg)
            
    return jsonify({
        'messages': new_msgs,
        'users': [{'username': u, 'icon': d['icon']} for u, d in active_users.items()]
    })

if __name__ == '__main__':
    app.run(debug=True)