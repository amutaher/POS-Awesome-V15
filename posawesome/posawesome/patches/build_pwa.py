import subprocess, os, frappe

def build():
    app_path = frappe.get_app_path("posawesome")  # …/apps/posawesome
    cmd = ["yarn", "pwa"]
    subprocess.check_call(cmd, cwd=app_path)
