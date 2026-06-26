# -*- coding: utf-8 -*-
import os
import tempfile
import subprocess

LOCK_FILE = os.path.join(tempfile.gettempdir(), "agent_guru_api_llm.lock")

def is_process_alive(pid):
    """
    Checks if a Windows process is alive by PID.
    """
    try:
        import ctypes
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if handle:
            exit_code = ctypes.c_ulong()
            kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code))
            kernel32.CloseHandle(handle)
            return exit_code.value == 259 # 259 represents STILL_ACTIVE
        return False
    except Exception:
        try:
            out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}"], capture_output=True, text=True, errors="ignore")
            return str(pid) in out.stdout
        except Exception:
            return True

def check_resource_busy():
    """
    Checks if a scheduled/pipeline background task is using the local LLM lock.
    If the lock is held by another alive process, return True.
    """
    import sys
    if sys.platform != "win32":
        return False
        
    if os.path.exists(LOCK_FILE):
        try:
            with open(LOCK_FILE, "r") as f:
                pid = int(f.read().strip())
            
            # Lock is held by another process which is still alive
            if pid != os.getpid() and is_process_alive(pid):
                return True
        except Exception:
            pass
    return False
