import { createVuetify } from 'vuetify';
import { createApp } from 'vue';
import eventBus from './bus';
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import Home from './Home.vue';
import OfflineStorage from './services/offlineStorage.js';

frappe.provide('frappe.PosApp');


frappe.PosApp.posapp = class {
    constructor({ parent }) {
        this.$parent = $(document);
        this.page = parent.page;
        this.make_body();
    }

    async make_body() {
        this.$el = this.$parent.find('.main-section');
        
        // Initialize offline storage and wait for it to be ready
        await this.init_offline_storage();
        
        // Register service worker and setup sync
        await this.init_service_worker();
        
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
        const app = createApp(Home)
        app.use(eventBus);
        app.use(vuetify)
        app.mount(this.$el[0]);
    }

    async init_offline_storage() {
        try {
            window.offlineStorage = new OfflineStorage('posAwesomeDB', 1);
            // Wait for the ready promise to resolve
            await window.offlineStorage.ready;
            console.log('Global OfflineStorage initialized successfully');
            
            // Check data availability
            const offlineDataStatus = await window.offlineStorage.checkOfflineDataAvailability();
            console.log('Offline data status:', offlineDataStatus);
            
            return window.offlineStorage;
        } catch (error) {
            console.error('Failed to initialize global OfflineStorage:', error);
            throw error;
        }
    }
    
    async init_service_worker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/assets/posawesome/service-worker.js');
                console.log('Service Worker registered with scope:', registration.scope);
                
                // Setup cross-browser synchronization fallback
                registration.ready.then(reg => {
                    if ('sync' in reg) {
                        console.log('Background Sync is supported');
                        // Register for background sync
                        reg.sync.register('sync-pending-invoices').catch(err => {
                            console.error('Background Sync registration error:', err);
                        });
                    } else {
                        console.log('Background Sync not supported, using polling fallback');
                        // Set up polling sync for browsers without Background Sync (e.g. Safari)
                        this.setupSyncPolling();
                    }
                });
                
                return registration;
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        } else {
            console.log('Service Workers not supported');
        }
    }
    
    setupSyncPolling() {
        // Clear any existing interval
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        
        // Set up polling every minute when online
        this.syncInterval = setInterval(() => {
            if (navigator.onLine && window.offlineStorage) {
                window.offlineStorage.processAll().then(result => {
                    if (result) {
                        console.log('Polling sync successful');
                    }
                }).catch(err => {
                    console.error('Polling sync error:', err);
                });
            }
        }, 60000); // Check every minute
        
        // Also set up event listeners for manual sync
        window.addEventListener('online', () => {
            if (window.offlineStorage) {
                window.offlineStorage.processAll();
            }
        });
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (this.syncInterval) {
                clearInterval(this.syncInterval);
            }
        });
    }

    setup_header() {
        // Header setup code
    }
};
