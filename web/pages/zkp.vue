<script setup lang="ts">
const api = useKycApi()
const circuitId = ref('age-verification-v1')
const publicInputs = ref('{"minAge": 18, "merkleRoot": "0xabc123..."}')
const proofResult = ref<any>(null)
const loading = ref(false)
const verificationResult = ref<any>(null)

const generateProof = async () => {
  loading.value = true
  proofResult.value = null
  verificationResult.value = null
  try {
    const inputs = JSON.parse(publicInputs.value)
    proofResult.value = await api.generateProof({
      circuitId: circuitId.value,
      inputs
    })
  } catch (err) {
    alert('Proof generation failed. Ensure backend services are running.')
  } finally {
    loading.value = false
  }
}

const verifyProof = async () => {
  if (!proofResult.value) return
  loading.value = true
  try {
    verificationResult.value = await api.verifyProof({
      circuitId: circuitId.value,
      proof: proofResult.value.proof
    })
  } catch (err) {
    alert('Verification failed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-8">
    <section>
      <h2 class="text-2xl font-bold mb-4">Zero-Knowledge Proofs</h2>
      <p class="text-slate-400">Generate and verify privacy-preserving identity disclosures using Noir circuits.</p>
    </section>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Prover Card -->
      <div class="p-8 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 font-bold italic text-xl">P</div>
          <h3 class="text-lg font-bold">Prover (Client-side)</h3>
        </div>
        
        <div class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Circuit ID</label>
            <select v-model="circuitId" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm outline-none">
              <option value="age-verification-v1">Age Verification (v1)</option>
              <option value="kyc-attribute-v1">KYC Attribute Disclosure (v1)</option>
              <option value="membership-v1">Membership Verification (v1)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Public Inputs (JSON)</label>
            <textarea 
              v-model="publicInputs" 
              rows="3"
              class="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm font-mono text-amber-300 outline-none"
            ></textarea>
          </div>
          <button 
            @click="generateProof"
            :disabled="loading"
            class="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors shadow-lg shadow-amber-600/10"
          >
            {{ loading ? 'Generating...' : 'Generate Proof' }}
          </button>
        </div>
      </div>

      <!-- Verifier Card -->
      <div class="p-8 rounded-2xl bg-slate-900 border border-slate-800 space-y-6 flex flex-col">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500 font-bold italic text-xl">V</div>
          <h3 class="text-lg font-bold">Verifier (Service-side)</h3>
        </div>

        <div v-if="proofResult" class="flex-1 space-y-6 flex flex-col">
          <div class="bg-slate-950 rounded-xl p-4 flex-1 overflow-auto max-h-[200px]">
            <p class="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest text-right italic">Generated Proof (truncated)</p>
            <pre class="text-xs font-mono text-emerald-400 leading-relaxed">{{ JSON.stringify(proofResult.proof, null, 2).substring(0, 500) }}...</pre>
          </div>

          <button 
            @click="verifyProof"
            :disabled="loading"
            class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors"
          >
            {{ loading ? 'Verifying...' : 'Verify this Proof' }}
          </button>

          <div v-if="verificationResult" class="p-4 rounded-xl border flex items-center justify-between" :class="verificationResult.verified ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'">
            <div class="flex items-center gap-3">
              <span v-if="verificationResult.verified" class="text-xl">✅</span>
              <span v-else class="text-xl">❌</span>
              <div>
                <p class="font-bold text-sm">{{ verificationResult.verified ? 'Verification Passed' : 'Verification Failed' }}</p>
                <p class="text-[10px] opacity-70">Time: {{ verificationResult.verificationTimeMs }}ms</p>
              </div>
            </div>
          </div>
        </div>
        
        <div v-else class="flex-1 flex flex-col items-center justify-center text-slate-600 gap-4">
          <div class="w-12 h-12 rounded-full border-2 border-dashed border-slate-800"></div>
          <p class="text-sm italic">Generate a proof first to enable verification</p>
        </div>
      </div>
    </div>
  </div>
</template>
