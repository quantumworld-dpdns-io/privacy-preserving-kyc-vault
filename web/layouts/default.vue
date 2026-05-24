<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 font-sans">
    <header class="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span class="font-bold text-white">K</span>
          </div>
          <h1 class="text-xl font-bold tracking-tight">KYC Vault</h1>
        </div>
        <nav class="hidden md:flex items-center gap-6">
          <NuxtLink to="/" class="text-sm font-medium text-slate-400 hover:text-white transition-colors">Dashboard</NuxtLink>
          <NuxtLink to="/did" class="text-sm font-medium text-slate-400 hover:text-white transition-colors">DID Registry</NuxtLink>
          <NuxtLink to="/kyc" class="text-sm font-medium text-slate-400 hover:text-white transition-colors">KYC Workflows</NuxtLink>
          <NuxtLink to="/zkp" class="text-sm font-medium text-slate-400 hover:text-white transition-colors">ZKP Proofs</NuxtLink>
        </nav>
        <div class="flex items-center gap-4">
          <span class="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-semibold rounded-full border border-emerald-500/20">
            <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            System Online
          </span>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 py-8">
      <slot />
    </main>

    <footer class="border-t border-slate-800 py-8 mt-auto">
      <div class="max-w-7xl mx-auto px-4 text-center">
        <p class="text-slate-500 text-sm">© 2026 Privacy-Preserving KYC Vault. All rights reserved.</p>
      </div>
    </footer>
  </div>
</template>
