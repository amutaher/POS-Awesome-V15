import os
import frappe
from frappe.website.utils import get_home_page
from frappe.utils.response import build_response

@frappe.whitelist(allow_guest=True)
def service_worker():
    sw_path = frappe.get_app_path("posawesome", "public", "js", "service-worker.js")
    with open(sw_path, "r") as f:
        content = f.read()
    
    frappe.response.headers["Content-Type"] = "application/javascript"
    frappe.response.headers["Service-Worker-Allowed"] = "/app/posapp/"
    return content

@frappe.whitelist(allow_guest=True)
def offline_page():
    template = frappe.get_template("templates/offline.html")
    html = template.render()
    
    frappe.response.headers["Content-Type"] = "text/html"
    return html 