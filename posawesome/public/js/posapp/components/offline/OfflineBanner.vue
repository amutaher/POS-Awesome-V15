<template>
  <div class="offline-banner">
    <div class="offline-content">
      <span class="offline-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"></line>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
          <line x1="12" y1="20" x2="12.01" y2="20"></line>
        </svg>
      </span>
      <span class="offline-message">{{ message }}</span>
    </div>
  </div>
</template>

<script>
export default {
  name: 'OfflineBanner',
  data() {
    return {
      message: 'You are currently offline. Some features may be limited.'
    }
  }
}
</script>

<style>
:root {
  --banner-height: 36px;
}

.offline-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--banner-height);
  background-color: #ff4757;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.offline-content {
  display: flex;
  align-items: center;
}

.offline-icon {
  margin-right: 8px;
  display: flex;
  align-items: center;
}

.offline-message {
  line-height: 1;
}

@media (max-width: 600px) {
  .offline-message {
    font-size: 12px;
  }
}
</style> 