import frappe
from frappe.model.document import Document

class POSDeliveryCharges(Document):
    def validate(self):
        self.validate_accounts()
        self.update_profiles_list()

    def validate_accounts(self):
        """Validate if account belongs to company"""
        for field in ["account"]:
            account = self.get(field)
            if account:
                account_company = frappe.db.get_value("Account", account, "company")
                if account_company != self.company:
                    frappe.throw(
                        frappe._("Account {0} does not belong to company {1}").format(
                            account, self.company
                        )
                    )

    def update_profiles_list(self):
        """Update the list of POS profiles for quick filtering"""
        profiles = []
        for profile in self.pos_profiles:
            if profile.pos_profile not in profiles:
                profiles.append(profile.pos_profile)
        self.profiles_list = ",".join(profiles) if profiles else "" 