# Ciência de dados — Segmentação sentimental dos ouvintes via letras

> **Status:** etapa futura registrada em roadmap — **nada implementado ainda.**
> Este documento é a fonte de verdade da intenção; a implementação nasce fora do
> repositório (ferramenta pessoal do autor) e **será extraída para o repositório
> independente `karaoke-flow-data`**.

## 1. Contexto

Após o `MANIFEST.md` §6 ("Acerca das Belas Artes") usar dados reais de escuta
(Google Takeout / YouTube Music, 2025→2026), o próximo degrau é **classificar o ouvinte
por sentimento** a partir das músicas que escuta: músicas + metadados + letras.

- **Sujeito (agora):** apenas o perfil pessoal do desenvolvedor (histórico YT Music).
- **Sujeito (futuro):** extendível aos usuários/donos da plataforma Karaokê Watch Party,
  depois de coleta de dados com consentimento (LGPD — ver spec §13 e MANIFEST §7).

## 2. Decisões fechadas (2026-09-22)

| Tema               | Decisão                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Abordagem          | **Híbrida:** embeddings (SBERT multilingue) para clustering + léxicos/ML para sentimento                                         |
| Eixo de sentimento | **Circumplexo valence-arousal** (modelo de Russell) — 2 dimensões                                                                |
| Letras             | Genius API — persistir **apenas excertos curtos** (nunca letra integral — copyright)                                             |
| Metadados          | **+ Spotify API** (valência, energia, danceability, acousticness) como 2ª fonte                                                  |
| Onde vive          | Ferramenta pessoal isolada fora do repo (ex.: `Temp\opencode\...`), nasce aqui, **vira o repo independente `karaoke-flow-data`** |
| Volume esperado    | 500–2k faixas distintas (histórico real: 8.216 eventos / 2.842 faixas)                                                           |
| Idiomas            | Mistura pesada EN/PT/ESP — embeddings multilingue + léxicos por idioma                                                           |
| Clustering         | **HDBSCAN** (não-paramétrico, descobre o número de clusters por densidade)                                                       |
| Saída              | Retrato do ouvinte por quadrante do circumplexo (alimenta evolução da §6)                                                        |

## 3. Pipeline proposto

```
entrada: takeout-music-data.json (faixas distintas + metadados YT)
   │
   ├── Genius API
   │     casar arte↔faixa (MusicBrainz / match título+artista)
   │     baixar letra → persistir SÓ excerto curto (ex.: refrão, N chars)
   │
   ├── Spotify API
   │     buscar faixa por título+artista → valência/energia/danceability/acousticness
   │
   ├── scores sentimentais (léxicos por idioma)
   │     EN: VADER  |  PT: SentiStrenght  |  ESP: léxico a definir (SentiWordNet/pt)
   │     → valence-arousal por faixa (agregação léxico + heurística de tom)
   │
   ├── embeddings SBERT multilingue (frase do excerto + título)
   │     → representação vetorial por faixa
   │
   ├── HDBSCAN → clusters de faixas por densidade
   ├── cruzamento: clusters × quadrantes valence-arousal
   │
   saída: retrato do ouvinte — proporção por quadrante, artistas/franq. dominantes
          por cluster, narrativa sentimental do período (2025→2026, pico 2025-Q4)
```

## 4. Restrições & estado da arte

- **Copyright das letras:** Genius/titulares proíbem republicação de letras integrais.
  Política: excerto curto em memória; persistir apenas IDs + scores + trecho mínimo
  (configurável, default curto). **Nunca** versionar letras no repo.
- **Rate limits/cota:** Genius (rate limit por token) e Spotify (requisições/min) — cache
  local de respostas; para 500–2k faixas, batch simples com cache resolve.
- **Qualidade multimodal:** letra captura só a _letra_; valência acústica (Spotify)
  complementa (uma música "triste" com ritmo dançável → valence × arousal discordante).
- **Idioma:** embeddings multilingue modernos lidam bem com mistura; léxicos são fracos por
  natureza — mitigar com ML (ex.: fine-tune leve) quando houver dados anotados.
- **Reprodutibilidade:** seeds fixas, versões de modelos pinadas, outputs versionados no
  repo futuro `karaoke-flow-data` (dados de entrada NÃO — permanecem isolados).

## 5. Roadmap de extensão

1. Implementar a camada para o perfil pessoal (fora do repo).
2. Escrever evolução da §6 do MANIFEST com o retrato sentimental (valência-arousal).
3. Quando a plataforma coletar dados de usuários com consentimento → reaplicar a camada
   por perfil agregado de cantores/donos; LGPD obrigatório (anonimização, minimização).

## 6. Registro

- Registrado no `TODO.md` (Roadmap, fora do MVP) e no `CHANGELOG.md` `[Unreleased]`.
- Nasce neste repositório (karaoke-flow), mas a implementação será movida para o
  **repo independente `karaoke-flow-data`** (decisão 2026-09-22).
