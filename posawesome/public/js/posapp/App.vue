<template>
  <v-app>
    <v-main>
      <v-container fluid>
        <v-row>
          <v-col>
            <h2>POS Awesome</h2>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<script>
export default {
  name: 'App',
  data() {
    return {
      pos_profile: null,
      items: [],
      customer: null
    }
  },
  methods: {
    // Add your methods here
  }
}
</script>

<style>
.pos-components {
  height: 100%;
  overflow: hidden;
}
</style> 