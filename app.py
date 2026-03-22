from flask import Flask, render_template, request, Response, stream_with_context
import requests
import json
import os
from dotenv import load_dotenv

app = Flask(__name__)

load_dotenv()

app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev_key_fixed')

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

if __name__ == '__main__':
    app.run(debug=True)