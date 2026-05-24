<script setup lang="ts">
const services = ref([
  { name: 'DID Service', status: 'online', uptime: '99.9%', latency: '45ms' },
  { name: 'Credential Service', status: 'online', uptime: '99.8%', latency: '62ms' },
  { name: 'KYC Service', status: 'online', uptime: '99.9%', latency: '38ms' },
  { name: 'ZKP Service', status: 'online', uptime: '99.7%', latency: '120ms' },
  { name: 'Billing Service', status: 'online', uptime: '100%', latency: '25ms' },
  { name: 'Admin Service', status: 'online', uptime: '99.9%', latency: '15ms' },
])

const stats = ref([
  { label: 'Total DIDs', value: '12,450', trend: '+12%', color: 'text-indigo-400' },
  { label: 'Active Workflows', value: '842', trend: '+5%', color: 'text-emerald-400' },
  { label: 'Proofs Verified', value: '45.2k', trend: '+18%', color: 'text-amber-400' },
  { label: 'Monthly Volume', value: '$1.2M', trend: '+24%', color: 'text-rose-400' },
])
</script>

<template>
  <div class="space-y-10">
    <!-- Hero Section -->
    <section class="space-y-4">
      <h2 class="text-3xl font-extrabold tracking-tight">System Overview</h2>
      <p class="text-slate-400 max-w-2xl">
        Real-time monitoring and management of the privacy-preserving KYC infrastructure. 
        Track identity resolution, credential issuance, and zero-knowledge proof verification.
      </p>
    </section>

    <!-- Stats Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div v-for="s in stats" :key="s.label" class="p-6 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all shadow-sm">
        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{{ s.label }}</p>
        <div class="flex items-end justify-between">
          <p class="text-2xl font-bold" :class="s.color">{{ s.value }}</p>
          <span class="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">{{ s.trend }}</span>
        </div>
      </div>
    </div>

    <!-- Services Status -->
    <section class="space-y-6">
      <div class="flex items-center justify-between">
        <h3 class="text-xl font-bold">Microservices Status</h3>
        <button class="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
          View Detailed Logs
        </button>
      </div>
      
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div v-for="service in services" :key="service.name" class="flex items-center justify-between p-5 rounded-xl bg-slate-900/50 border border-slate-800">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
              <div class="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50"></div>
            </div>
            <div>
              <p class="font-bold text-sm">{{ service.name }}</p>
              <p class="text-xs text-slate-500">Uptime: {{ service.uptime }}</p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-xs font-mono text-slate-400">{{ service.latency }}</p>
            <p class="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mt-0.5">{{ service.status }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Quick Actions -->
    <section class="space-y-6">
      <h3 class="text-xl font-bold">Quick Actions</h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <NuxtLink to="/did" class="group p-6 rounded-2xl bg-indigo-600/5 border border-indigo-500/20 hover:bg-indigo-600/10 hover:border-indigo-500/40 transition-all">
          <h4 class="font-bold text-indigo-400 mb-2 flex items-center gap-2">
            Register DID
          </h4>
          <p class="text-sm text-slate-400">Onboard a new identity to the decentralized registry.</p>
        </NuxtLink>
        <NuxtLink to="/kyc" class="group p-6 rounded-2xl bg-emerald-600/5 border border-emerald-500/20 hover:bg-emerald-600/10 hover:border-emerald-500/40 transition-all">
          <h4 class="font-bold text-emerald-400 mb-2">New KYC Workflow</h4>
          <p class="text-sm text-slate-400">Initiate identity verification for a platform applicant.</p>
        </NuxtLink>
        <NuxtLink to="/zkp" class="group p-6 rounded-2xl bg-amber-600/5 border border-amber-500/20 hover:bg-amber-600/10 hover:border-amber-500/40 transition-all">
          <h4 class="font-bold text-amber-400 mb-2">Verify Proof</h4>
          <p class="text-sm text-slate-400">Validate a zero-knowledge disclosure without revealing data.</p>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>
