<script setup lang="ts">
const api = useKycApi()
const workflows = ref<any[]>([])
const loading = ref(false)

const fetchWorkflows = async () => {
  loading.value = true
  try {
    workflows.value = await api.getWorkflows()
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

const createWorkflow = async () => {
  try {
    const res = await api.createWorkflow({
      subjectDid: `did:kyc:user-${Math.random().toString(36).substring(7)}`,
      tier: 'standard',
      platformId: '550e8400-e29b-41d4-a716-446655440001',
      schemaId: '770e8400-e29b-41d4-a716-446655440001'
    })
    alert('Workflow Created!')
    fetchWorkflows()
  } catch (err) {
    alert('Failed to create workflow')
  }
}

const transition = async (id: string, state: string) => {
  try {
    await api.transitionWorkflow(id, {
      newState: state,
      actor: 'did:kyc:admin-1',
      detail: `Transitioned to ${state} via Web Dashboard`
    })
    fetchWorkflows()
  } catch (err) {
    alert('Transition failed')
  }
}

onMounted(fetchWorkflows)
</script>

<template>
  <div class="space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold">KYC Workflows</h2>
        <p class="text-slate-400">Manage identity verification pipelines and transitions.</p>
      </div>
      <button 
        @click="createWorkflow"
        class="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2"
      >
        <span>+</span> New Workflow
      </button>
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-slate-950/50">
            <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Subject DID</th>
            <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
            <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Created</th>
            <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y border-slate-800 divide-slate-800">
          <tr v-for="wf in workflows" :key="wf.id" class="hover:bg-slate-800/30 transition-colors">
            <td class="px-6 py-4">
              <p class="font-mono text-xs text-indigo-400 truncate max-w-[200px]">{{ wf.user_did }}</p>
            </td>
            <td class="px-6 py-4">
              <span class="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest border" :class="{
                'bg-emerald-500/10 text-emerald-400 border-emerald-500/20': wf.status === 'initiated' || wf.status === 'approved',
                'bg-amber-500/10 text-amber-400 border-amber-500/20': wf.status === 'in_review',
                'bg-rose-500/10 text-rose-400 border-rose-500/20': wf.status === 'rejected'
              }">{{ wf.status }}</span>
            </td>
            <td class="px-6 py-4 text-xs text-slate-500">{{ new Date(wf.created_at).toLocaleDateString() }}</td>
            <td class="px-6 py-4 flex gap-2">
              <button 
                v-if="wf.status === 'initiated'"
                @click="transition(wf.id, 'in_review')"
                class="text-[10px] font-bold text-amber-400 hover:text-amber-300 transition-colors"
              >REVIEW</button>
              <button 
                v-if="wf.status === 'in_review'"
                @click="transition(wf.id, 'approved')"
                class="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
              >APPROVE</button>
              <button 
                v-if="wf.status === 'in_review'"
                @click="transition(wf.id, 'rejected')"
                class="text-[10px] font-bold text-rose-400 hover:text-rose-300 transition-colors"
              >REJECT</button>
            </td>
          </tr>
          <tr v-if="workflows.length === 0 && !loading">
            <td colspan="4" class="px-6 py-12 text-center text-slate-600 italic">No active workflows found</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
