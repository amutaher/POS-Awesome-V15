# Copyright (c) 2023, Youssef Restom and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class POSIdempotencyKey(Document):
	def validate(self):
		# Truncate data field if it's too large
		if self.data and len(self.data) > 65535:  # max length for Text field
			self.data = self.data[:65000] + "... [truncated]"
		
		# Truncate error field if it's too large
		if self.error and len(self.error) > 65535:  # max length for Text field 
			self.error = self.error[:65000] + "... [truncated]" 