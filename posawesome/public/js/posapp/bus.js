import mitt from 'mitt';

// Create a safer event bus that wraps mitt
const createSafeEventBus = () => {
    // Create the mitt instance
    const emitter = mitt();
    
    // Create a safer wrapper
    const safeEmitter = {
        // Safe emit that checks handlers before calling
        emit(type, evt) {
            try {
                if (!emitter.all) return;
                
                const handlers = emitter.all.get(type);
                if (!handlers) return;
                
                // Convert to array to avoid mutation issues
                const safeHandlers = Array.from(handlers);
                
                // Call each handler safely
                safeHandlers.forEach(handler => {
                    if (typeof handler === 'function') {
                        try {
                            handler(evt);
                        } catch (e) {
                            console.error(`Error in event handler for "${type}":`, e);
                        }
                    } else {
                        console.warn(`Ignoring non-function handler for "${type}"`);
                    }
                });
            } catch (error) {
                console.error(`Error emitting "${type}" event:`, error);
            }
        },
        
        // Safe on that ensures handler is a function
        on(type, handler) {
            if (typeof handler !== 'function') {
                console.warn(`Attempting to register non-function handler for "${type}"`);
                return;
            }
            
            try {
                emitter.on(type, handler);
            } catch (error) {
                console.error(`Error registering handler for "${type}":`, error);
            }
        },
        
        // Safe off method
        off(type, handler) {
            try {
                emitter.off(type, handler);
            } catch (error) {
                console.error(`Error removing handler for "${type}":`, error);
            }
        }
    };
    
    return safeEmitter;
};

export default {
    install: (app, options) => {
        app.config.globalProperties.__ = window.__;
        app.config.globalProperties.frappe = window.frappe;
        app.config.globalProperties.eventBus = createSafeEventBus();
    }
}

