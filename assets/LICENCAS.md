# Licenças dos assets

## detento.glb (e detento.glb.js)

- **Origem:** Universal Animation Library (Standard), de Quaternius — https://quaternius.itch.io/universal-animation-library (download gratuito). Arquivo usado: `Unreal-Godot/UAL1_Standard.glb`.
- **Licença:** CC0 1.0 Universal (domínio público), conforme o `License.txt` do pacote: https://creativecommons.org/publicdomain/zero/1.0/
- **Alterações:** `tools/preparar_detento.js` deixa só a malha do corpo (sem as juntas e sem UV), os clipes que o motor usa e nenhuma trilha dos dedos.

Para regenerar (o zip original não fica no repositório):

    node tools/preparar_detento.js <caminho/UAL1_Standard.glb>
    node tools/embutir_asset.js assets/detento.glb
