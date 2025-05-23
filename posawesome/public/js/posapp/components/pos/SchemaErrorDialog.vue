<template>
  <v-dialog
    v-model="dialog"
    max-width="600px"
    persistent
    content-class="schema-error-dialog"
  >
    <v-card>
      <v-card-title class="headline">
        <v-icon left large color="error">mdi-alert-circle-outline</v-icon>
        {{ __('Validation Error') }}
      </v-card-title>
      <v-card-text>
        <v-alert
          v-if="errorMessage"
          type="error"
          dense
          outlined
          :value="true"
        >
          {{ errorMessage }}
        </v-alert>
        
        <p v-if="errorCode">{{ __('Error Code:') }} <code>{{ errorCode }}</code></p>
        
        <v-tabs v-if="hasErrors">
          <v-tab>{{ __('Validation Errors') }}</v-tab>
          <v-tab v-if="details && Object.keys(details).length">{{ __('Details') }}</v-tab>
          
          <v-tab-item>
            <v-card flat>
              <v-card-text>
                <v-list dense>
                  <v-list-item v-for="(error, index) in errors" :key="index">
                    <v-list-item-icon>
                      <v-icon color="error">mdi-alert-circle-small</v-icon>
                    </v-list-item-icon>
                    <v-list-item-content>
                      <v-list-item-title>{{ error }}</v-list-item-title>
                    </v-list-item-content>
                  </v-list-item>
                </v-list>
              </v-card-text>
            </v-card>
          </v-tab-item>
          
          <v-tab-item v-if="details && Object.keys(details).length">
            <v-card flat>
              <v-card-text>
                <pre><code>{{ JSON.stringify(details, null, 2) }}</code></pre>
              </v-card-text>
            </v-card>
          </v-tab-item>
        </v-tabs>
        
        <div v-if="apiVersionMismatch" class="mt-4">
          <v-alert
            type="warning"
            dense
            outlined
            :value="true"
          >
            {{ __('Your app version is out of date. Please update your application.') }}
          </v-alert>
          <p>
            {{ __('Client API Version:') }} <code>{{ apiVersionInfo.client || 'unknown' }}</code><br>
            {{ __('Server API Version:') }} <code>{{ apiVersionInfo.server }}</code>
          </p>
        </div>
        
        <p class="mt-2" v-if="recoverable">
          <b>{{ __('Suggestion:') }}</b> {{ __('You can fix these issues and try again.') }}
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
          color="grey darken-1"
          text
          @click="dismissDialog"
        >
          {{ __('Dismiss') }}
        </v-btn>
        <v-btn
          color="primary"
          @click="handleRetry"
          :disabled="!recoverable"
        >
          {{ __('Try Again') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
export default {
  name: 'SchemaErrorDialog',
  
  data() {
    return {
      dialog: false,
      errorMessage: '',
      errorCode: '',
      errors: [],
      details: null,
      recoverable: true,
      apiVersionMismatch: false,
      apiVersionInfo: {
        client: null,
        server: null
      }
    };
  },
  
  computed: {
    hasErrors() {
      return this.errors && this.errors.length > 0;
    }
  },
  
  mounted() {
    // Listen for schema error events
    window.addEventListener('pos-awesome-schema-error', this.handleSchemaError);
  },
  
  beforeDestroy() {
    // Clean up event listeners
    window.removeEventListener('pos-awesome-schema-error', this.handleSchemaError);
  },
  
  methods: {
    handleSchemaError(event) {
      const errorData = event.detail || {};
      
      // Display the dialog with the error message
      this.errorMessage = errorData.message || __('Validation failed');
      this.errorCode = errorData.code || 'UNKNOWN_ERROR';
      this.errors = errorData.errors || [];
      this.details = errorData.details || null;
      this.recoverable = errorData.recoverable !== false;
      
      // Check for API version mismatch
      if (errorData.api_version) {
        this.apiVersionMismatch = true;
        this.apiVersionInfo = {
          client: errorData.api_version.client,
          server: errorData.api_version.server
        };
      } else {
        this.apiVersionMismatch = false;
        this.apiVersionInfo = {
          client: null,
          server: null
        };
      }
      
      this.dialog = true;
      
      // Emit event for parent components to react
      this.$emit('schema-error', errorData);
    },
    
    dismissDialog() {
      // Just hide the dialog
      this.dialog = false;
      this.$emit('dismissed');
    },
    
    handleRetry() {
      this.dialog = false;
      this.$emit('retry');
    }
  }
};
</script>

<style>
.schema-error-dialog .v-card {
  border-left: 4px solid var(--error);
}

.schema-error-dialog pre {
  background-color: #f5f5f5;
  padding: 8px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.schema-error-dialog code {
  font-family: monospace;
  background-color: #f5f5f5;
  padding: 2px 4px;
  border-radius: 3px;
  font-size: 0.9em;
}
</style> 