import os
import sys
import frappe
import subprocess
import shutil
from frappe import _
from frappe.utils import execute_in_shell

def after_install():
    """Run after app installation"""
    print("\n\nPOS Awesome: Setting up PWA...")
    setup_pwa()

def before_build():
    """Run before app build"""
    print("\n\nPOS Awesome: Preparing to build PWA...")

def after_build():
    """Run after app build"""
    print("\n\nPOS Awesome: Building PWA for production...")
    build_pwa()

def setup_pwa():
    """Setup PWA configuration and dependencies"""
    try:
        # Check if node_modules exists and install if not
        app_path = frappe.get_app_path("posawesome")
        build_script_path = os.path.join(os.path.dirname(app_path), "build-pwa.js")
        
        if not os.path.exists(build_script_path):
            print("Warning: build-pwa.js not found in app root")
            return

        # Make build script executable
        os.chmod(build_script_path, 0o755)
        
        # Check if node_modules exists
        node_modules_path = os.path.join(os.path.dirname(app_path), "node_modules")
        if not os.path.exists(node_modules_path):
            print("Installing Node.js dependencies...")
            # Run npm/yarn install
            execute_in_shell("cd {} && yarn install".format(os.path.dirname(app_path)))
    
    except Exception as e:
        print("Error setting up PWA:", str(e))

def build_pwa():
    """Build PWA for production"""
    try:
        app_path = frappe.get_app_path("posawesome")
        build_script_path = os.path.join(os.path.dirname(app_path), "build-pwa.js")
        
        if not os.path.exists(build_script_path):
            print("Warning: build-pwa.js not found in app root")
            return
        
        # Execute the build script
        print("Running PWA build script...")
        result = subprocess.run(["node", build_script_path], capture_output=True, text=True)
        
        if result.returncode != 0:
            print("Error building PWA:")
            print(result.stderr)
        else:
            print("PWA build completed successfully:")
            print(result.stdout)
            
    except Exception as e:
        print("Error building PWA:", str(e)) 