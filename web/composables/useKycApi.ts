export const useKycApi = () => {
  const config = useRuntimeConfig()
  const apiBase = config.public.apiBase

  const fetchApi = async (endpoint: string, options: any = {}) => {
    const url = `${apiBase}${endpoint}`
    try {
      const response = await $fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })
      return response
    } catch (error: any) {
      console.error(`API Error (${endpoint}):`, error)
      throw error
    }
  }

  return {
    // DID
    resolveDid: (did: string) => fetchApi(`/did/resolve/${did}`),
    registerDid: (data: any) => fetchApi('/did/register', { method: 'POST', body: data }),
    
    // KYC
    createWorkflow: (data: any) => fetchApi('/kyc/workflows', { method: 'POST', body: data }),
    getWorkflows: () => fetchApi('/kyc/workflows'),
    getWorkflow: (id: string) => fetchApi(`/kyc/workflows/${id}`),
    transitionWorkflow: (id: string, data: any) => fetchApi(`/kyc/workflows/${id}/transition`, { method: 'POST', body: data }),

    // ZKP
    generateProof: (data: any) => fetchApi('/zkp/prove', { method: 'POST', body: data }),
    verifyProof: (data: any) => fetchApi('/zkp/verify', { method: 'POST', body: data }),

    // Billing
    recordUsage: (data: any) => fetchApi('/billing/usage', { method: 'POST', body: data }),
    getInvoices: () => fetchApi('/billing/invoices'),
  }
}
