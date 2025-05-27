doc_events = {
    "Sales Invoice": {
        "validate": "posawesome.posawesome.api.posapp.validate",
        "before_submit": "posawesome.posawesome.api.posapp.before_submit",
        "before_cancel": "posawesome.posawesome.api.posapp.before_cancel",
    },
    "Customer": {
        "validate": "posawesome.posawesome.api.posapp.set_customer_info",
    },
    "Payment Entry": {
        "on_cancel": "posawesome.posawesome.api.payment_entry.on_payment_entry_cancel"
    }
} 