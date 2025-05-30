import Vue from 'vue';
import Vuex from 'vuex';
import { indexedDB } from './modules/indexedDB';

Vue.use(Vuex);

export default new Vuex.Store({
  modules: {
    indexedDB
  },
  state: {
    // ... existing state ...
  },
  mutations: {
    // ... existing mutations ...
  },
  actions: {
    async initializeApp({ dispatch }) {
      await dispatch('indexedDB/initialize');
      // ... other initialization code ...
    }
  }
}); 