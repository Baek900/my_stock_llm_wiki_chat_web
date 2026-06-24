# -*- coding: utf-8 -*-
import subprocess
import base64
import sys
import os

def spawn_wmi_process(cmd_line, cwd):
    escaped_cmd = cmd_line.replace("'", "''")
    normalized_cwd = cwd.replace("\\", "/")
    escaped_cwd = normalized_cwd.replace("'", "''")
    
    ps_command = f"Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{{ CommandLine = '{escaped_cmd}'; CurrentDirectory = '{escaped_cwd}' }}"
    encoded_cmd = base64.b64encode(ps_command.encode("utf-16-le")).decode("ascii")
    
    res = subprocess.run(
        ["powershell", "-NoProfile", "-EncodedCommand", encoded_cmd],
        capture_output=True,
        text=True,
        encoding='utf-8',
        errors='ignore'
    )
    if res.returncode == 0 and "ReturnValue" in res.stdout:
        print(f"[SUCCESS] Detached service launched via WMI: {cmd_line}")
    else:
        print(f"[ERROR] Detached launch failed: {res.stdout.strip()} Stderr: {res.stderr.strip()}", file=sys.stderr)

if __name__ == "__main__":
    base_dir = r"C:\Users\qorrb\OneDrive\Desktop\git hub\my_stock_llm_wiki_chat"
    
    # 1. Spawn Lemonade Server
    lemonade_exe = r"C:\Users\qorrb\AppData\Local\lemonade_server\bin\LemonadeServer.exe"
    lemonade_dir = r"C:\Users\qorrb\AppData\Local\lemonade_server\bin"
    spawn_wmi_process(lemonade_exe, lemonade_dir)
    
    # 2. Spawn Backend (FastAPI)
    backend_cmd = 'cmd.exe /c ""' + base_dir + '\\.venv\\Scripts\\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8080 --reload > "' + base_dir + '\\backend_stdout.log" 2> "' + base_dir + '\\backend_stderr.log""'
    backend_dir = os.path.join(base_dir, "backend")
    spawn_wmi_process(backend_cmd, backend_dir)
    
    # 3. Spawn Frontend (Vite) with CI=true to prevent TTY interactive shell crash
    frontend_cmd = 'cmd.exe /c "set CI=true && \"C:\\Program Files\\nodejs\\npm.cmd\" run dev"'
    frontend_dir = os.path.join(base_dir, "frontend")
    spawn_wmi_process(frontend_cmd, frontend_dir)
