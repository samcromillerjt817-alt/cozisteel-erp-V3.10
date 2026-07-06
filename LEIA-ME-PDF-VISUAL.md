# Identidade Visual nos PDFs — todos os módulos

## O que mudou

Reconstruí a geração de PDF do zero (`pdf.service.ts`), aplicando a mesma identidade
em **todos os documentos gerados pelo sistema**:

- **Logo real da Cozisteel** (a que você enviou, com a margem branca cortada pra ficar
  maior e mais nítida) no cabeçalho de cada PDF
- **Cor institucional exata** `#B21119` (extraída pixel a pixel da sua logo) em:
  título do documento, barra de destaque abaixo do cabeçalho, cabeçalho das tabelas,
  caixas de total, linha do rodapé, títulos de seção
- **Títulos de seção com barrinha vermelha** (padrão visual consistente em "DADOS DO
  CLIENTE", "ITENS", "OBSERVAÇÕES" etc.)
- **Rodapé padronizado** com linha vermelha, nome da empresa, número de página e data
  de geração — igual em todos os documentos
- Linhas alternadas nas tabelas (zebra sutil) pra facilitar leitura

## Documentos atualizados (por módulo)

| Módulo | Documento |
|---|---|
| Orçamentos | Proposta comercial |
| Orçamentos | Romaneio de transporte |
| Compras | Requisição de compra |
| Produção | Ordem de Produção |
| Relatórios | Vendas, Produção, Compras, Estoque (todos usam o mesmo gerador) |

## Aplicar

```bash
unzip -o cozisteel-pdf-visual.zip -d .
rm -rf .next
npm run build
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
pm2 restart cozisteel-erp
```

**Atenção**: dessa vez a pasta `public/` também mudou (a logo nova). Confirma que o
`cp -r public .next/standalone/` rodou depois do build, senão o PDF gera sem logo
(cai automaticamente no fallback de texto "COZISTEEL" em vermelho, não quebra, mas
fica sem a imagem).

## Testar

Gera um PDF de cada tipo e confere a logo, a cor e o rodapé:
- Orçamento → botão de download PDF
- Orçamento → romaneio de transporte
- Requisição → PDF
- Ordem de Produção → PDF
- Relatórios → qualquer tipo → Exportar PDF

## O que fica para depois (fora do escopo desta entrega)

Você também pediu, no mesmo pacote de ideias, PDF de orçamento **com opção de
incluir fotos dos produtos**. Isso depende de o cadastro de Produto ter campo de
foto (que ainda não existe — está na sua lista de "Produtos: fotos"). Assim que
esse upload de foto existir, adiciono o checkbox "incluir imagens" na geração do
PDF do orçamento.
