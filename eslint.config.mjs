import nextConfig from 'eslint-config-next'
import reactHooks from 'eslint-plugin-react-hooks'

const config = [
  ...nextConfig,
  {
    // Baseline temporária (ADR-015, Lote 0): 20 ocorrências pré-existentes catalogadas para
    // correção dedicada em lote futuro — nunca suprimidas, só rebaixadas de error para warning
    // enquanto a baseline de qualidade é estabelecida sem misturar refatoração comportamental.
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
]

export default config
