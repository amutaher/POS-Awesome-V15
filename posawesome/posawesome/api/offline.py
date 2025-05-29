import os
import frappe
from frappe.website.utils import get_home_page

def get_context(context):
    if frappe.local.request.path == "/app/posapp/offline":
        context.no_cache = 1
        context.template = "templates/offline.html"
        return context
    
    if frappe.local.request.path == "/app/posapp/service-worker.js":
        frappe.local.response.filename = "service-worker.js"
        frappe.local.response.filecontent = get_service_worker_content()
        frappe.local.response.type = "text/javascript"
        return context

def get_service_worker_content():
    sw_path = frappe.get_app_path("posawesome", "public", "js", "service-worker.js")
    with open(sw_path, "r") as f:
        return f.read() 