# -*- coding: utf-8 -*-
from setuptools import setup, find_packages
import os
import sys
import subprocess
from setuptools.command.install import install
from setuptools.command.develop import develop

with open("requirements.txt") as f:
    install_requires = f.read().strip().split("\n")

# get version from __version__ variable in posawesome/__init__.py
from posawesome import __version__ as version

def build_pwa():
    """Build the PWA assets"""
    build_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build.py")
    
    if os.path.exists(build_script):
        print("Building PWA assets...")
        try:
            subprocess.check_call([sys.executable, build_script])
            print("PWA build completed successfully during setup")
        except Exception as e:
            print(f"Warning: PWA build failed: {e}")
            print("You can run 'python build.py' manually after installation")
    else:
        print(f"Warning: build.py not found at {build_script}")

class PostDevelopCommand(develop):
    """Post-installation for development mode."""
    def run(self):
        develop.run(self)
        try:
            build_pwa()
        except Exception as e:
            print(f"Error building PWA assets: {e}")

class PostInstallCommand(install):
    """Post-installation for installation mode."""
    def run(self):
        install.run(self)
        try:
            build_pwa()
        except Exception as e:
            print(f"Error building PWA assets: {e}")

setup(
    name="posawesome",
    version=version,
    description="POS Awesome",
    author="Yousef Restom",
    author_email="youssef@totrox.com",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=install_requires,
    cmdclass={
        'develop': PostDevelopCommand,
        'install': PostInstallCommand,
    },
)
