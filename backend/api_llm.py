# -*- coding: utf-8 -*-
import os
import sys
import json
import time
from contextlib import contextmanager

# Import shared agent API wrapper
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def log(msg):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [ANTIGRAVITY-LLM-WRAPPER] {msg}")

def get_gcp_project_id():
    # 1. Check environment variables
    proj = os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("GCP_PROJECT")
    if proj:
        return proj
    
    # 2. Try fetching from GCE metadata server
    import urllib.request
    url = "http://metadata.google.internal/computeMetadata/v1/project/project-id"
    req = urllib.request.Request(url, headers={"Metadata-Flavor": "Google"})
    try:
        with urllib.request.urlopen(req, timeout=2) as response:
            return response.read().decode("utf-8").strip()
    except Exception:
        return None

def load_model(model_name, ctx_size=8192):
    return True

def unload_model(model_name=None):
    return True

def check_loaded_models():
    return []

@contextmanager
def local_model_context(model_name, ctx_size=8192):
    log(f"Entering cloud API context: {model_name}")
    try:
        yield model_name
    finally:
        log(f"Exiting cloud API context: {model_name}")

def generate_chat_completion(model_name, messages, temperature=0.3, max_tokens=8192, force_local=True, model_mode="normal", **kwargs):
    """
    Routes chat completion. If running on GCP or force_local=False, calls Google GenAI (Gemini) API.
    Otherwise, calls local Lemonade Server on port 8000.
    """
    running_on_gcp = os.getenv("RUNNING_ON_GCP", "false").lower() == "true"
    
    if force_local and not running_on_gcp:
        import urllib.request
        import urllib.error
        import json

        url = "http://127.0.0.1:8000/v1/chat/completions"
        headers = {"Content-Type": "application/json"}
        
        payload = {
            "model": model_name,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False
        }
        
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers)
        
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                res_body = response.read().decode("utf-8")
                res_json = json.loads(res_body)
                content = res_json["choices"][0]["message"]["content"]
                return content
        except Exception as e:
            log(f"ERROR: Local model request failed: {e}. Trying cloud fallback...")
            # Fallback to cloud if local fails
            return generate_chat_completion(model_name, messages, temperature, max_tokens, force_local=False, model_mode=model_mode, **kwargs)
    else:
        # Cloud mode using Google GenAI SDK (Vertex AI if GCP project is set, otherwise standard API Key)
        try:
            from google import genai
            from google.genai import types
        except ImportError:
            log("google-genai package not installed. Installing dynamically...")
            import subprocess
            subprocess.run([sys.executable, "-m", "pip", "install", "google-genai"], check=True)
            from google import genai
            from google.genai import types

        project_id = get_gcp_project_id()
        location = os.getenv("GOOGLE_CLOUD_LOCATION") or os.getenv("GCP_LOCATION") or "us-central1"
        
        # Initialize client and map models. Prioritize GEMINI_API_KEY (AI Studio) over Vertex AI.
        if os.getenv("GEMINI_API_KEY"):
            log("Initializing standard Gemini API client using GEMINI_API_KEY")
            client = genai.Client()
            if model_mode == "turbo":
                gemini_model = "gemini-3.1-pro-preview"
            elif model_mode == "normal":
                gemini_model = "gemini-3.5-flash"
            elif model_mode == "default":
                gemini_model = "gemini-3.1-flash-lite"
            else:
                gemini_model = "gemini-3.5-flash"
        elif running_on_gcp or project_id:
            log(f"Initializing Vertex AI client (Project: {project_id}, Location: {location})")
            kwargs = {}
            if project_id:
                kwargs["project"] = project_id
            client = genai.Client(vertexai=True, location=location, **kwargs)
            if model_mode == "turbo":
                gemini_model = "gemini-3.1-pro-preview"
            elif model_mode == "normal":
                gemini_model = "gemini-3.5-flash"
            elif model_mode == "default":
                gemini_model = "gemini-3.1-flash-lite"
            else:
                gemini_model = "gemini-3.5-flash"
        else:
            raise ValueError(
                "Google Cloud Project ID 또는 GEMINI_API_KEY가 감지되지 않았습니다. "
                "Vertex AI 서비스 권한을 주거나 GEMINI_API_KEY 환경변수를 주입해야 합니다."
            )
            
        log(f"Calling Cloud Gemini API - Model Mode: {model_mode} -> Target Model: {gemini_model}")
            
            
        contents = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            # Map role: user -> user, assistant -> model, system -> system_instruction
            if role == "system":
                pass
            elif role == "assistant" or role == "model":
                contents.append(types.Content(role="model", parts=[types.Part.from_text(text=content)]))
            else:
                contents.append(types.Content(role="user", parts=[types.Part.from_text(text=content)]))
                
        # Gather system instruction if present
        system_instructions = [msg.get("content", "") for msg in messages if msg.get("role") == "system"]
        sys_inst = "\n".join(system_instructions) if system_instructions else None
        
        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
            system_instruction=sys_inst
        )
        
        try:
            response = client.models.generate_content(
                model=gemini_model,
                contents=contents,
                config=config
            )
            return response.text
        except Exception as e:
            log(f"ERROR: Cloud Gemini API request failed: {e}")
            raise e

if __name__ == "__main__":
    # Test block
    test_msgs = [{"role": "user", "content": "안녕하세요! 클라우드 API 연동 테스트입니다."}]
    # Set standard Gemini API key if not on GCP for testing
    if not os.getenv("GEMINI_API_KEY") and not os.getenv("GCP_PROJECT"):
        os.environ["GEMINI_API_KEY"] = "dummy"
    try:
        res = generate_chat_completion("Gemma-4-26B-A4B-it-GGUF", test_msgs, force_local=False, model_mode="normal")
        print("Test result:", res)
    except Exception as e:
        print("Test failed as expected on error:", e)
