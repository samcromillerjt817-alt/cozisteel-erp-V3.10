import json
import os
import re

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

INPUT = os.path.join(PROJECT_ROOT, "graphify-out", "graph.json")
# Exportação fica fora do repositório de propósito: o Graphify varre o projeto
# inteiro em "graphify update .", então qualquer saída derivada gravada dentro
# do repo vira fonte na rodada seguinte (loop de realimentação já visto antes).
OUTPUT = os.path.expanduser("~/Cozisteel-Knowledge")

os.makedirs(OUTPUT, exist_ok=True)

with open(INPUT, "r", encoding="utf-8") as f:
    graph = json.load(f)

nodes = graph.get("nodes", [])
links = graph.get("links", [])

# mapa id -> nome
node_map = {}

for node in nodes:
    label = node.get("label", "Sem_nome")

    safe_name = re.sub(
        r'[\\/*?:"<>|]',
        "_",
        label
    )

    node_map[node["id"]] = safe_name

# cria backlinks
relations = {}

for link in links:
    source = link.get("source")
    target = link.get("target")

    if source and target:
        relations.setdefault(source, []).append(target)
        relations.setdefault(target, []).append(source)


for node in nodes:

    node_id = node["id"]
    name = node_map[node_id]

    filename = os.path.join(
        OUTPUT,
        f"{name}.md"
    )

    with open(filename, "w", encoding="utf-8") as md:

        md.write(f"# {name}\n\n")

        md.write("## Informações\n\n")

        md.write(
            f"- Tipo: `{node.get('file_type','')}`\n"
        )

        md.write(
            f"- Arquivo: `{node.get('source_file','')}`\n"
        )

        md.write(
            f"- Origem: `{node.get('_origin','')}`\n\n"
        )


        md.write("## Relacionamentos\n\n")

        for related in relations.get(node_id, []):

            if related in node_map:
                md.write(
                    f"- [[{node_map[related]}]]\n"
                )


print(
    f"Gerados {len(nodes)} arquivos em {OUTPUT}"
)
