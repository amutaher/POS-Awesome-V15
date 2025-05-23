/**
 * API Service for POS Awesome
 * Handles all API communication with server including version and schema validation handling
 */
class ApiService {
    constructor() {
        this.apiVersion = '1.0.0'; // Client API version
        this.serverVersion = null; // Will be fetched from server
        this.versionChecked = false;
        this.serverCompatible = null;
        this.initialized = false;
        this.initPromise = null;
        this.apiVersionCheckInterval = 3600000; // 1 hour
        this.lastVersionCheck = 0;
    }

    /**
     * Initialize API service and check version compatibility
     */
    async initialize() {
        if (this.initialized) {
            return true;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = new Promise(async (resolve) => {
            try {
                // Check API version compatibility
                await this.checkApiVersion();
                this.initialized = true;
                resolve(true);
            } catch (error) {
                console.error('[ApiService] Initialization failed:', error);
                // Still mark as initialized, but return false
                this.initialized = true;
                resolve(false);
            }
        });

        return this.initPromise;
    }

    /**
     * Check API version compatibility with server
     */
    async checkApiVersion() {
        // Skip if checked recently (to prevent too many checks)
        const now = Date.now();
        if (this.versionChecked && (now - this.lastVersionCheck) < this.apiVersionCheckInterval) {
            return this.serverCompatible;
        }

        try {
            const response = await fetch('/api/method/posawesome.posawesome.api.posapp.get_api_version', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                console.warn('[ApiService] Failed to check API version:', response.status);
                this.serverCompatible = null;
                return null;
            }

            const result = await response.json();

            if (!result.message || !result.message.version) {
                console.warn('[ApiService] Invalid API version response:', result);
                this.serverCompatible = null;
                return null;
            }

            // Store server version
            this.serverVersion = result.message.version;
            this.versionChecked = true;
            this.lastVersionCheck = now;

            // Check compatibility (for now just exact match)
            this.serverCompatible = (this.apiVersion === this.serverVersion);
            
            // If versions don't match, log a warning
            if (!this.serverCompatible) {
                console.warn(
                    `[ApiService] API version mismatch: client=${this.apiVersion}, server=${this.serverVersion}`
                );
                
                // Dispatch event for UI to handle
                window.dispatchEvent(new CustomEvent('pos-awesome-schema-error', { 
                    detail: { 
                        message: `API version mismatch: client=${this.apiVersion}, server=${this.serverVersion}`,
                        code: 'API_VERSION_MISMATCH',
                        recoverable: false,
                        api_version: {
                            client: this.apiVersion,
                            server: this.serverVersion,
                            compatible: false
                        }
                    }
                }));
            }

            return this.serverCompatible;
        } catch (error) {
            console.error('[ApiService] Error checking API version:', error);
            this.serverCompatible = null;
            return null;
        }
    }

    /**
     * Call API with version header and handle validation errors
     */
    async call(method, args = {}, options = {}) {
        // Ensure we're initialized
        await this.initialize();
        
        // Prepare request with API version
        const headers = {
            'X-API-Version': this.apiVersion,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        // Add idempotency key if provided
        if (options.idempotencyKey) {
            headers['Idempotency-Key'] = options.idempotencyKey;
        }
        
        try {
            const response = await fetch(`/api/method/${method}`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(args)
            });
            
            // Handle auth errors (401, 403)
            if (response.status === 401 || response.status === 403) {
                window.dispatchEvent(new CustomEvent('pos-awesome-auth-error', {
                    detail: {
                        message: 'Authentication required',
                        code: response.status
                    }
                }));
                
                return { error: 'Authentication required', status: response.status };
            }
            
            // Try to parse JSON response
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const result = await response.json();
                
                // Handle API errors
                if (!response.ok || result.exception || (result.message && typeof result.message === 'object' && result.message.status === 'error')) {
                    const errorData = result.exception ? {
                        message: result.exception || 'Unknown error',
                        code: result.exc_type || 'UNKNOWN_ERROR'
                    } : (result.message && typeof result.message === 'object' ? result.message : {
                        message: result._server_messages || 'Unknown error',
                        code: 'SERVER_ERROR'
                    });
                    
                    // Handle schema validation errors specifically
                    if (errorData.code === 'SCHEMA_VALIDATION_FAILED') {
                        window.dispatchEvent(new CustomEvent('pos-awesome-schema-error', { 
                            detail: errorData
                        }));
                    }
                    
                    return { error: errorData, status: response.status };
                }
                
                return result;
            } else {
                // Non-JSON response (likely HTML, could be login page)
                const htmlContent = await response.text();
                
                // Check if it's a login page
                if (htmlContent.includes('login') && htmlContent.includes('password')) {
                    window.dispatchEvent(new CustomEvent('pos-awesome-auth-error', {
                        detail: {
                            message: 'Session expired',
                            code: 'SESSION_EXPIRED'
                        }
                    }));
                    
                    return { error: 'Session expired', status: response.status };
                }
                
                return { 
                    error: 'Unexpected response format', 
                    status: response.status,
                    html: htmlContent.substring(0, 100) + '...' // First 100 chars for debugging
                };
            }
        } catch (error) {
            console.error(`[ApiService] Error calling ${method}:`, error);
            return { error: error.message, code: 'NETWORK_ERROR' };
        }
    }
    
    /**
     * Submit an invoice with validation and version handling
     */
    async submitInvoice(invoice, additionalData, idempotencyKey) {
        return this.call('posawesome.posawesome.api.posapp.submit_invoice', {
            invoice: JSON.stringify(invoice),
            data: JSON.stringify(additionalData)
        }, { idempotencyKey });
    }
    
    /**
     * Get API version info from server
     */
    async getApiVersion() {
        return this.call('posawesome.posawesome.api.posapp.get_api_version');
    }
}

// Create singleton instance
const apiService = new ApiService();

export default apiService; 