# PDF — Modelo Comercial + Modelo Técnico (baseado na sua referência)

Não precisa aplicar de novo a logo (já está em `public/logo.png` do pacote anterior).
Este pacote só troca o `pdf.service.ts`.

## Modelo Comercial (Orçamento) — o que mudou

Aproximei bastante da referência que você enviou:

- **Dois cartões lado a lado** logo abaixo do cabeçalho: um claro com os **Dados do
  Cliente**, um escuro (preto) com os **Dados da Empresa** (puxados direto das
  Configurações do sistema — CNPJ, endereço, telefone, e-mail)
- **Caixa de totais** destacada (subtotal, desconto, frete, e o TOTAL em barra vermelha)
- **Duas caixas lado a lado**: Condições Comerciais (pagamento, prazo, garantia,
  validade) e Observações
- **Bloco de assinatura**: linha para assinatura do cliente + data — ou, se o
  orçamento já estiver aprovado, uma faixa verde "✓ APROVADO em [data]" no lugar
- **Rodapé institucional**: 4 selos (Qualidade / Excelência / Compromisso /
  Confiança) + barra vermelha com "COZISTEEL — SOLUÇÕES EM AÇO INOXIDÁVEL"
- Quebra de página automática se o orçamento tiver muitos itens (o fechamento do
  documento — totais, condições, assinatura — nunca fica cortado ao meio)

## Modelo Técnico (Requisição de Compra e Ordem de Produção) — o que mudou

Ganharam o mesmo cartão de identificação (dados da empresa + dados do documento),
mas **sem** o rodapé institucional de selos/marketing — são documentos internos,
não precisam do apelo comercial. Mantém a mesma cor, tabelas e tipografia.

## O que não pude replicar exatamente

- **Fotos dos produtos** na tabela de itens — depende do cadastro de Produto ter
  campo de foto (ainda não existe)
- **A logo hexagonal preta/vermelha** da sua referência — isso é um logo diferente
  do arquivo real que você me enviou (o circular). Usei a logo oficial que você
  forneceu; se tiver esse outro arquivo de logo em alta resolução, me envia que eu troco.

## Aplicar

```bash
unzip -o cozisteel-pdf-modelo-comercial-tecnico.zip -d .
rm -rf .next
npm run build
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
pm2 restart cozisteel-erp
```

## Testar

- Gera o PDF de um Orçamento (aprovado e não aprovado, pra ver os dois estados do
  bloco de assinatura)
- Gera o PDF de uma Requisição e de uma Ordem de Produção — confere que ficou mais
  sóbrio, sem o rodapé de selos
