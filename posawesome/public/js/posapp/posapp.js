import { createVuetify } from 'vuetify';
import { createApp } from 'vue';
import eventBus from './bus';
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import Home from './Home.vue';

// Register service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('/posawesome/public/js/posapp/service-worker.js', {
                scope: '/posawesome/'
            })
            .then(registration => {
                console.log('Service Worker registered successfully:', registration);
            })
            .catch(error => {
                console.error('Service Worker registration failed:', error);
            });
    });
}

// Ensure frappe.PosApp namespace exists
if (typeof frappe === 'undefined') {
    console.error('Frappe is not defined. Make sure Frappe is loaded before this script.');
} else {
    // Initialize the PosApp namespace if it doesn't exist
    frappe.provide('frappe.PosApp');

    // Immediately register the posapp class to avoid race conditions
    frappe.PosApp.posapp = class {
        constructor({ parent }) {
            console.log('POS Awesome app initializing...');
            this.$parent = $(document);
            this.page = parent.page;
            this.make_body();
        }
        make_body() {
            this.$el = this.$parent.find('.main-section');
            const vuetify = createVuetify(
                {
                    components,
                    directives,
                    locale: {
                        rtl: frappe.utils.is_rtl()
                    },
                    theme: {
                        themes: {
                            light: {
                                background: '#FFFFFF',
                                primary: '#0097A7',
                                secondary: '#00BCD4',
                                accent: '#9575CD',
                                success: '#66BB6A',
                                info: '#2196F3',
                                warning: '#FF9800',
                                error: '#E86674',
                                orange: '#E65100',
                                golden: '#A68C59',
                                badge: '#F5528C',
                                customPrimary: '#085294',
                            },
                        },
                    },
                }
            );
            
            try {
                const app = createApp(Home);
                app.use(eventBus);
                app.use(vuetify);
                app.mount(this.$el[0]);
                console.log('POS Awesome Vue app mounted successfully');
            } catch (error) {
                console.error('Failed to mount POS Awesome Vue app:', error);
            }
        }
        setup_header() {
            // Header setup logic here
        }
    };
    
    console.log('POS Awesome app class registered successfully');
}
