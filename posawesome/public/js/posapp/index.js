import Vue from 'vue';
import Vuetify from 'vuetify';
import App from './App.vue';
import './pos.css';

// Initialize Frappe POS App namespace
frappe.provide('frappe.PosApp');

frappe.PosApp.posapp = class {
    constructor(page) {
        this.page = page;
        this.make_app();
    }

    make_app() {
        this.$components_container = $('<div class="pos-components"></div>').appendTo(this.page.main);
        
        // Initialize Vue with Vuetify
        Vue.use(Vuetify);
        
        const vuetify = new Vuetify({
            theme: {
                themes: {
                    light: {
                        primary: '#0097A7',
                        secondary: '#00BCD4',
                        accent: '#9575CD',
                        error: '#f44336',
                        warning: '#ff9800',
                        info: '#2196f3',
                        success: '#4caf50'
                    }
                }
            }
        });

        // Create Vue instance
        this.vue = new Vue({
            el: this.$components_container[0],
            vuetify,
            render: h => h(App)
        });

        // Make vue instance accessible
        this.vue_app = this.vue;
    }
}; 