// Copyright (c) 20201 Youssef Restom and contributors
// For license information, please see license.txt

frappe.ui.form.on('POS Profile', {
    setup: function (frm) {
        frm.set_query("posa_cash_mode_of_payment", function (doc) {
            return {
                filters: { 'type': 'Cash' }
            };
        });

        frm.set_query("income_account", function(doc) {
            return {
                filters: {
                    'company': doc.company,
                    'is_group': 0,
                    'account_type': 'Income Account'
                }
            };
        });
    },
    
    company: function(frm) {
        if(frm.doc.company) {
            frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: "Company",
                    name: frm.doc.company
                },
                callback: function(r) {
                    if(r.message) {
                        let company = r.message;
                        
                        // Set income account if not already set
                        if(!frm.doc.income_account && company.default_income_account) {
                            frm.set_value('income_account', company.default_income_account);
                        }
                        
                        // Set expense account if not already set
                        if(!frm.doc.expense_account && company.default_expense_account) {
                            frm.set_value('expense_account', company.default_expense_account);
                        }
                        
                        // Set cost center if not already set
                        if(!frm.doc.cost_center && company.cost_center) {
                            frm.set_value('cost_center', company.cost_center);
                        }
                        
                        frm.refresh_fields();
                    }
                }
            });
        }
    }
});