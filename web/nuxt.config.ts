// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss'],
  app: {
    head: {
      title: 'KYC Vault - Privacy-Preserving Identity',
      meta: [
        { name: 'description', content: 'Modern, secure, and privacy-preserving KYC platform' }
      ]
    }
  },
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'https://localhost/api/v1'
    }
  }
})
