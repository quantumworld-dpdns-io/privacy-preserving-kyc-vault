<script setup lang="ts">
const api = useKycApi()
const didInput = ref('did:kyc:test-user-123')
const resolutionResult = ref<any>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const resolveDid = async () => {
  loading.value = true
  error.value = null
  resolutionResult.value = null
  try {
    resolutionResult.value = await api.resolveDid(didInput.value)
  } catch (err: any) {
    error.value = err.data?.message || err.message || 'Failed to resolve DID'
  } finally {
    loading.value = false
  }
}

const registerSample = async () => {
  loading.value = true
  error.value = null
  const sampleDid = `did:kyc:${Math.random().toString(36).substring(7)}`
  try {
    const res = await api.registerDid({
      did: sampleDid,
      document: {
        id: sampleDid,
        verificationMethod: [{
          id: `${sampleDid}#key-1`,
          type: 'Ed25519VerificationKey2020',
          controller: sampleDid,
          publicKeyMultibase: 'z6MkmPh99NqZit9idp77nE9vAArY673rUPZ5C1jL'
        }]
      }
    })
    didInput.value = sampleDid
    resolutionResult.value = res
    alert(`Successfully registered: ${sampleDid}`)
  } catch (err: any) {
    error.value = err.data?.message || err.message || 'Failed to register DID'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-8">
    <section>
      <h2 class="text-2xl font-bold mb-4">DID Registry Demo</h2>
      <p class="text-slate-400">Resolve existing DIDs or register new ones on the decentralized platform.</p>
    </section>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Resolution Form -->
      <div class="p-8 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
        <h3 class="text-lg font-bold">Resolve Identity</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">DID URI</label>
            <input 
              v-model="didInput" 
              type="text" 
              class="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
              placeholder="did:kyc:..."
            />
          </div>
          <div class="flex gap-3">
            <button 
              @click="resolveDid" 
              :disabled="loading"
              class="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors"
            >
              {{ loading ? 'Resolving...' : 'Resolve' }}
            </button>
            <button 
              @click="registerSample"
              class="px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-bold transition-colors"
            >
              Quick Register
            </button>
          </div>
        </div>

        <div v-if="error" class="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          {{ error }}
        </div>
      </div>

      <!-- Result View -->
      <div class="p-8 rounded-2xl bg-slate-900 border border-slate-800 min-h-[300px] flex flex-col">
        <h3 class="text-lg font-bold mb-4">DID Document</h3>
        <div v-if="resolutionResult" class="flex-1 bg-slate-950 rounded-xl p-4 overflow-auto max-h-[400px]">
          <pre class="text-xs font-mono text-indigo-300 leading-relaxed">{{ JSON.stringify(resolutionResult, null, 2) }}</pre>
        </div>
        <div v-else class="flex-1 flex flex-col items-center justify-center text-slate-600 gap-4">
          <div class="w-12 h-12 rounded-full border-2 border-dashed border-slate-800"></div>
          <p class="text-sm italic">Enter a DID to see its document</p>
        </div>
      </div>
    </div>
  </div>
</template>
