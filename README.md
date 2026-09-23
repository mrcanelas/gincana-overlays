# XXII Gincana Cultural — Sistema de Transmissão

CETI José Nogueira de Aguiar · Brasil de Muitos Brasis

## Início rápido

```bash
npm install
npm start
```

Ou execute `scripts/iniciar.bat`.

Painel: http://localhost:3000/controle

Dados oficiais ficam em `database/gincana.json` (persistência local sem dependência nativa).

## Fontes OBS (1920×1080)

| Fonte | URL |
|---|---|
| Painel | http://localhost:3000/controle |
| Overlay composto | http://localhost:3000/overlay |
| Abertura | http://localhost:3000/tela |
| Intervalo (mic) | http://localhost:3000/intervalo |
| Cronômetro | http://localhost:3000/cronometro |
| Resultados | http://localhost:3000/resultados |
| Apuração | http://localhost:3000/apuracao |
| Placar | http://localhost:3000/placar |

Na fonte **Intervalo**, permita o microfone na Fonte de Navegador e desative o áudio da fonte.

## Brasões

Coloque PNG/SVG em `public/assets/brasoes/` ou envie pelo painel (módulo Equipes). Recomendado: SVG ou PNG transparente 512×512.
