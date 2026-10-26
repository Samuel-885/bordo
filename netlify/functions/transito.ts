// Netlify Function de repasse ao TomTom (previsão com trânsito). Toda a lógica está em
// `netlify/transito-tratador.ts`, que tem testes. A chave é a variável de ambiente TOMTOM_API_KEY.

import { criarTratador } from '../transito-tratador'

export default (req: Request): Promise<Response> =>
  criarTratador({
    TOMTOM_API_KEY: process.env.TOMTOM_API_KEY,
    URL: process.env.URL,
    DEPLOY_PRIME_URL: process.env.DEPLOY_PRIME_URL,
    DEPLOY_URL: process.env.DEPLOY_URL,
  })(req)
