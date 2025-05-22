#!/usr/bin/env python
import os
import subprocess
import sys
import json
import shutil
from pathlib import Path

def ensure_node_modules():
    """Ensure node modules are installed"""
    print("Checking node modules...")
    if not os.path.exists("node_modules"):
        print("Installing node modules...")
        subprocess.check_call(["npm", "install"])
    return True

def build_pwa():
    """Build the PWA assets using vite"""
    print("Building PWA assets...")
    # Make sure public directory exists
    os.makedirs("posawesome/public/build", exist_ok=True)
    
    # Run vite build
    subprocess.check_call(["npm", "run", "build"])
    
    print("PWA build completed successfully")
    return True

def update_manifest():
    """Update PWA manifest with correct paths"""
    manifest_path = "posawesome/public/manifest.json"
    
    if not os.path.exists(manifest_path):
        print(f"Manifest file not found at {manifest_path}, creating...")
        # Create a basic manifest if it doesn't exist
        manifest = {
            "name": "POS Awesome",
            "short_name": "POS Awesome",
            "description": "Progressive Web App for POS Awesome",
            "theme_color": "#4F46E5",
            "background_color": "#ffffff",
            "display": "standalone",
            "scope": "/",
            "start_url": "/app/posapp",
            "icons": [
                {
                    "src": "icons/icon-72x72.png",
                    "sizes": "72x72",
                    "type": "image/png"
                },
                {
                    "src": "icons/icon-144x144.png",
                    "sizes": "144x144",
                    "type": "image/png"
                },
                {
                    "src": "icons/icon-192x192.png",
                    "sizes": "192x192",
                    "type": "image/png"
                },
                {
                    "src": "icons/icon-512x512.png",
                    "sizes": "512x512",
                    "type": "image/png"
                }
            ]
        }
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)
    
    return True

def copy_service_worker():
    """Ensure service worker is copied to the correct location"""
    build_sw = "posawesome/public/build/service-worker.js"
    root_sw = "posawesome/public/service-worker.js"
    
    if os.path.exists(build_sw):
        # Copy the built service worker to the public directory
        shutil.copy2(build_sw, root_sw)
        print(f"Copied service worker from {build_sw} to {root_sw}")
    else:
        print(f"Warning: Built service worker not found at {build_sw}")
    
    return True

def update_hooks():
    """Update hooks.py to register PWA assets"""
    hooks_path = "posawesome/hooks.py"
    
    if not os.path.exists(hooks_path):
        print(f"Error: hooks.py not found at {hooks_path}")
        return False
    
    with open(hooks_path, "r") as f:
        hooks_content = f.read()
    
    # Check if PWA assets are already registered
    if "web_include_js" in hooks_content and "posawesome/build/" in hooks_content:
        print("PWA assets already registered in hooks.py")
        return True
    
    # Find the app_include_css section
    include_js_marker = "app_include_js"
    
    if include_js_marker not in hooks_content:
        print(f"Warning: Could not find {include_js_marker} in hooks.py")
        return False
    
    # Insert PWA registration
    pwa_assets = [
        '    "app_include_js": [',
        '        "posawesome/build/assets/index.js"',
        '    ],',
        '    "app_include_css": [',
        '        "posawesome/build/assets/index.css"',
        '    ],'
    ]
    
    # Split the content
    parts = hooks_content.split(include_js_marker)
    
    # Check if we need to modify
    if len(parts) != 2:
        print("Warning: Could not safely update hooks.py, skipping")
        return False
    
    # Replace with new content
    new_content = parts[0]
    new_content += "\n".join(pwa_assets)
    new_content += parts[1].split("},", 1)[1]
    
    # Write back
    with open(hooks_path, "w") as f:
        f.write(new_content)
    
    print("Updated hooks.py to register PWA assets")
    return True

def main():
    """Main build function"""
    print("Starting POS Awesome PWA build process...")
    
    # Ensure prerequisites
    if not ensure_node_modules():
        sys.exit(1)
    
    # Build steps
    if not build_pwa():
        sys.exit(1)
    
    # Post-build steps
    update_manifest()
    copy_service_worker()
    update_hooks()
    
    print("POS Awesome PWA build completed successfully!")
    print("Run 'bench build --app posawesome' to complete the installation.")

if __name__ == "__main__":
    main() 